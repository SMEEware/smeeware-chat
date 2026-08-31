"""HackerOne -- Bug-Bounty-Programme durchstoebern und Reports schreiben.

Sechs Werkzeuge am selben httpx-Client, alle gegen die offizielle
HackerOne-API (https://api.hackerone.com/v1). Angemeldet wird per HTTP Basic:
API-Benutzername als Nutzer, API-Token als Passwort -- beides stammt aus den
API-Token-Einstellungen des Kontos und steht in der .env.

    hackerone_programs        paginierte Liste zugaenglicher Programme
    hackerone_program         ein Programm samt In-Scope-Assets und den
                              Weakness-IDs, die ein Report braucht
    hackerone_hacktivity      oeffentlich offengelegte Reports durchsuchen
                              (Lucene) -- was auf einem Ziel gefunden wurde
                              und was es eingebracht hat
    hackerone_reports         eigene Reports auflisten oder einen per ID holen
    hackerone_draft_report    einen einreichfertigen Report verfassen -- NUR
                              formatieren, es wird nichts gesendet
    hackerone_submit_report   den Report wirklich an ein Programm senden;
                              nur vorhanden, wenn HACKERONE_ALLOW_SUBMIT=true

Alles hier bewegt sich innerhalb eines Programms, das Sicherheitstests
ausdruecklich erlaubt -- das ist der Sinn eines Bug-Bounty-Programms. Das
Senden bleibt trotzdem hinter einem Schalter: ein automatisch abgeschickter,
schwacher Report kann einen Forscher aus einem Programm werfen. Voreingestellt
entwirft das Modell nur, absenden tut ein Mensch.
"""

from __future__ import annotations

from typing import Any

import httpx

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool, truncate

logger = get_logger(__name__)

BASIS = "https://api.hackerone.com/v1"

# Gueltige Werte laut API -- hier gespiegelt, damit ein Tippfehler im
# Modell nicht erst die HackerOne-API bemueht.
SCHWERE = ("none", "low", "medium", "high", "critical")
HACKTIVITY_SORT = (
    "latest_disclosable_activity_at",
    "disclosed_at",
    "total_awarded_amount",
    "votes",
)


class _HackerOneTool(LocalTool):
    """Basis: ein Aufruf, ein Fehlerpfad, eine Anmeldung.

    Der Client wird geteilt (Verbindungen bleiben offen); die Zugangsdaten
    haengen pro Anfrage dran statt am Client, weil sich denselben Client auch
    Brave und SerpApi teilen.
    """

    def __init__(self, client: httpx.AsyncClient, username: str, token: str) -> None:
        self._client = client
        self._auth = (username, token)

    async def _hole(self, pfad: str, **params: Any) -> dict[str, Any]:
        return await self._ruf("GET", pfad, params=params or None)

    async def _sende(self, pfad: str, koerper: dict[str, Any]) -> dict[str, Any]:
        return await self._ruf("POST", pfad, json=koerper)

    async def _ruf(
        self,
        methode: str,
        pfad: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        # Ohne API-Benutzer meldet sich HackerOne nicht an. Lieber hier
        # klar sagen, was fehlt, als eine 401 aus der Ferne zu holen.
        if not self._auth[0]:
            raise ToolError(
                "HackerOne needs an API username too. Add "
                "HACKERONE_API_USERNAME to backend/.env -- it is shown next "
                "to your token under HackerOne -> Settings -> API Tokens."
            )
        try:
            response = await self._client.request(
                methode,
                f"{BASIS}{pfad}",
                params=params,
                json=json,
                auth=self._auth,
                headers={"Accept": "application/json"},
            )
        except httpx.HTTPError as exc:
            raise ToolError(
                f"HackerOne unreachable: {type(exc).__name__}: {exc}"
            ) from exc

        if response.status_code in (401, 403):
            # Der haeufigste Fall: das API-Token stimmt, aber der
            # API-Benutzername fehlt oder passt nicht dazu.
            raise ToolError(
                "HackerOne rejected the credentials (HTTP "
                f"{response.status_code}). Check HACKERONE_API_USERNAME and "
                "HACKERONE_API_TOKEN in the backend .env -- both come from "
                "the same API token in your HackerOne settings."
            )
        if response.status_code == 404:
            raise ToolError("Not found on HackerOne (HTTP 404) -- wrong handle or id?")
        if response.status_code == 429:
            wartezeit = response.headers.get("Retry-After", "a moment")
            raise ToolError(f"HackerOne rate limit hit -- retry after {wartezeit}.")

        try:
            daten = response.json()
        except ValueError:
            raise ToolError(
                f"HackerOne returned no JSON (HTTP {response.status_code})."
            ) from None

        if response.status_code >= 400:
            # HackerOne legt die eigentliche Ursache in "errors": [{title,...}].
            fehler = daten.get("errors") if isinstance(daten, dict) else None
            hinweis = _fehlertext(fehler) or f"HTTP {response.status_code}"
            raise ToolError(f"HackerOne error: {hinweis}")
        return daten


class HackerOneProgramsTool(_HackerOneTool):
    name = "hackerone_programs"
    description = (
        "Browses the bug bounty and vulnerability disclosure programs your "
        "HackerOne account can access, as a paginated list. Use this to find "
        "programs to work on. Each entry shows the handle (its short id), "
        "name, whether it pays bounties, whether it accepts submissions right "
        "now, and whether its scope is open. Pass the handle to "
        "hackerone_program for the full scope and the weakness ids a report "
        "needs."
    )
    parameters = {
        "type": "object",
        "properties": {
            "page": {"type": "integer", "description": "Page number (default 1)"},
            "page_size": {
                "type": "integer",
                "description": "Programs per page (1-100, default 25)",
            },
        },
    }

    async def run(self, page: int = 1, page_size: int = 25) -> str:
        daten = await self._hole(
            "/hackers/programs",
            **{
                "page[number]": max(1, int(page)),
                "page[size]": max(1, min(int(page_size), 100)),
            },
        )
        eintraege = daten.get("data") or []
        if not eintraege:
            return "No programs available for this account."

        zeilen = [f"{len(eintraege)} programs (page {page}):", ""]
        for eintrag in eintraege:
            a = eintrag.get("attributes") or {}
            marken = []
            if a.get("offers_bounties"):
                marken.append("bounties")
            if a.get("open_scope"):
                marken.append("open-scope")
            if a.get("bookmarked"):
                marken.append("bookmarked")
            zustand = a.get("submission_state") or a.get("state") or "?"
            zeilen.append(f"- {a.get('name', '(no name)')}  [{a.get('handle', '?')}]")
            schwanz = f"  submissions: {zustand}"
            if marken:
                schwanz += "  |  " + ", ".join(marken)
            zeilen.append(schwanz)
        if _naechste(daten):
            zeilen += ["", f"More programs on page {int(page) + 1}."]
        return truncate("\n".join(zeilen), 6000)


class HackerOneProgramTool(_HackerOneTool):
    name = "hackerone_program"
    description = (
        "Fetches one HackerOne program by its handle: policy summary, whether "
        "it pays, and -- unless you turn them off -- its structured scope "
        "(which assets are in scope and eligible for a bounty) and its "
        "accepted weakness types. You need the structured_scope_id and "
        "weakness_id from here to draft or submit a report."
    )
    parameters = {
        "type": "object",
        "properties": {
            "handle": {
                "type": "string",
                "description": "The program handle, e.g. 'security' or 'gitlab'",
            },
            "include_scope": {
                "type": "boolean",
                "description": "Include the in-scope assets and their ids (default true)",
            },
            "include_weaknesses": {
                "type": "boolean",
                "description": "Include accepted weakness types and their ids (default true)",
            },
        },
        "required": ["handle"],
    }

    async def run(
        self,
        handle: str,
        include_scope: bool = True,
        include_weaknesses: bool = True,
    ) -> str:
        griff = handle.strip().strip("/")
        if not griff:
            raise ToolError("Give a program handle.")

        daten = await self._hole(f"/hackers/programs/{griff}")
        a = (daten.get("data") or {}).get("attributes") or {}

        zeilen = [f"{a.get('name', griff)}  [{a.get('handle', griff)}]", ""]
        zeilen.append(f"State: {a.get('state', '?')}")
        zeilen.append(f"Submissions: {a.get('submission_state', '?')}")
        zeilen.append(f"Bounties: {'yes' if a.get('offers_bounties') else 'no'}")
        if a.get("currency"):
            zeilen.append(f"Currency: {a['currency']}")
        if leitlinie := (a.get("policy") or "").strip():
            zeilen += ["", "Policy:", truncate(leitlinie, 2500)]

        if include_scope:
            zeilen += ["", "In scope:"]
            zeilen.append(await self._scopes(griff))

        if include_weaknesses:
            zeilen += ["", "Accepted weaknesses (id -> name):"]
            zeilen.append(await self._weaknesses(griff))

        return truncate("\n".join(zeilen), 8000)

    async def _scopes(self, handle: str) -> str:
        try:
            daten = await self._hole(
                f"/hackers/programs/{handle}/structured_scopes",
                **{"page[size]": 100},
            )
        except ToolError as exc:
            return f"  (could not load scope: {exc})"
        eintraege = daten.get("data") or []
        if not eintraege:
            return "  (no structured scope published)"
        zeilen = []
        for eintrag in eintraege:
            a = eintrag.get("attributes") or {}
            if a.get("eligible_for_submission") is False:
                continue
            praemie = "bounty" if a.get("eligible_for_bounty") else "no-bounty"
            schwere = a.get("max_severity")
            marke = f"{praemie}"
            if schwere:
                marke += f", max {schwere}"
            zeilen.append(
                f"  [scope {eintrag.get('id', '?')}] "
                f"{a.get('asset_type', '?')}: {a.get('asset_identifier', '?')}  ({marke})"
            )
        return "\n".join(zeilen) or "  (nothing currently eligible for submission)"

    async def _weaknesses(self, handle: str) -> str:
        try:
            daten = await self._hole(
                f"/hackers/programs/{handle}/weaknesses",
                **{"page[size]": 100},
            )
        except ToolError as exc:
            return f"  (could not load weaknesses: {exc})"
        eintraege = daten.get("data") or []
        if not eintraege:
            return "  (program lists no specific weaknesses)"
        zeilen = []
        for eintrag in eintraege:
            a = eintrag.get("attributes") or {}
            extern = f" ({a['external_id']})" if a.get("external_id") else ""
            zeilen.append(f"  [{eintrag.get('id', '?')}] {a.get('name', '?')}{extern}")
        return "\n".join(zeilen)


class HackerOneHacktivityTool(_HackerOneTool):
    name = "hackerone_hacktivity"
    description = (
        "Searches HackerOne's public hacktivity feed -- vulnerability reports "
        "that programs have disclosed. Use it to research a target: what kinds "
        "of bugs get found, what they pay, which programs are active. The "
        "query uses Apache Lucene syntax; filter on fields like "
        "team:\"gitlab\", severity_rating:high, cwe:\"cwe-79\", "
        "disclosed:true, total_awarded_amount:>500."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Lucene query, e.g. 'team:\"gitlab\" severity_rating:high'",
            },
            "sort": {
                "type": "string",
                "enum": list(HACKTIVITY_SORT),
                "description": "Sort field (default latest_disclosable_activity_at)",
            },
            "descending": {
                "type": "boolean",
                "description": "Newest/highest first (default true)",
            },
            "page": {"type": "integer", "description": "Page number (default 1)"},
            "page_size": {
                "type": "integer",
                "description": "Results per page (1-100, default 25)",
            },
        },
    }

    async def run(
        self,
        query: str = "",
        sort: str = "latest_disclosable_activity_at",
        descending: bool = True,
        page: int = 1,
        page_size: int = 25,
    ) -> str:
        if sort not in HACKTIVITY_SORT:
            sort = "latest_disclosable_activity_at"
        params: dict[str, Any] = {
            "sort": f"-{sort}" if descending else sort,
            "page[number]": max(1, int(page)),
            "page[size]": max(1, min(int(page_size), 100)),
        }
        if query.strip():
            params["queryString"] = query.strip()

        daten = await self._hole("/hackers/hacktivity", **params)
        eintraege = daten.get("data") or []
        if not eintraege:
            return f"No disclosed reports for {query!r}." if query else "No results."

        zeilen = [f"{len(eintraege)} disclosed reports:", ""]
        for eintrag in eintraege:
            a = eintrag.get("attributes") or {}
            team = _beziehung_handle(eintrag, "team")
            teile = []
            if a.get("severity_rating"):
                teile.append(str(a["severity_rating"]))
            if _betrag(a.get("total_awarded_amount")):
                teile.append(f"${_betrag(a['total_awarded_amount'])}")
            if a.get("disclosed_at"):
                teile.append(str(a["disclosed_at"])[:10])
            kopf = a.get("title") or "(undisclosed title)"
            zeilen.append(f"- {kopf}")
            unter = f"  {team}" if team else "  "
            if teile:
                unter += "  |  " + ", ".join(teile)
            zeilen.append(unter)
            if a.get("url"):
                zeilen.append(f"  {a['url']}")
        return truncate("\n".join(zeilen), 7000)


class HackerOneReportsTool(_HackerOneTool):
    name = "hackerone_reports"
    description = (
        "Your own reports on HackerOne. Without an id: a paginated list of the "
        "reports you have submitted, with their state. With report_id: the "
        "full detail of one report, including its current triage state."
    )
    parameters = {
        "type": "object",
        "properties": {
            "report_id": {
                "type": "string",
                "description": "A report id for full detail; omit to list your reports",
            },
            "page": {"type": "integer", "description": "Page number when listing (default 1)"},
            "page_size": {
                "type": "integer",
                "description": "Reports per page (1-100, default 25)",
            },
        },
    }

    async def run(
        self,
        report_id: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> str:
        if report_id:
            kennung = str(report_id).strip()
            daten = await self._hole(f"/hackers/reports/{kennung}")
            a = (daten.get("data") or {}).get("attributes") or {}
            zeilen = [f"Report #{kennung}: {a.get('title', '(no title)')}", ""]
            zeilen.append(f"State: {a.get('state', '?')}")
            if a.get("created_at"):
                zeilen.append(f"Created: {a['created_at']}")
            team = _beziehung_handle(daten.get("data") or {}, "team")
            if team:
                zeilen.append(f"Program: {team}")
            if info := (a.get("vulnerability_information") or "").strip():
                zeilen += ["", truncate(info, 4000)]
            return truncate("\n".join(zeilen), 6000)

        daten = await self._hole(
            "/hackers/me/reports",
            **{
                "page[number]": max(1, int(page)),
                "page[size]": max(1, min(int(page_size), 100)),
            },
        )
        eintraege = daten.get("data") or []
        if not eintraege:
            return "You have no reports."
        zeilen = [f"{len(eintraege)} of your reports (page {page}):", ""]
        for eintrag in eintraege:
            a = eintrag.get("attributes") or {}
            zeilen.append(
                f"- #{eintrag.get('id', '?')}  [{a.get('state', '?')}]  "
                f"{a.get('title', '(no title)')}"
            )
        return truncate("\n".join(zeilen), 6000)


def _report_koerper(
    *,
    team_handle: str,
    title: str,
    vulnerability_information: str,
    impact: str,
    severity_rating: str,
    weakness_id: int | None,
    structured_scope_id: int | None,
) -> dict[str, Any]:
    """Baut den JSON:API-Koerper fuer POST /hackers/reports.

    Eine Stelle fuer Entwurf und Absenden -- so kann der Entwurf exakt den
    Koerper zeigen, den das Absenden schicken wuerde.
    """
    attribute: dict[str, Any] = {
        "team_handle": team_handle,
        "title": title,
        "vulnerability_information": vulnerability_information,
        "impact": impact,
        "severity_rating": severity_rating,
    }
    if weakness_id is not None:
        attribute["weakness_id"] = int(weakness_id)
    if structured_scope_id is not None:
        attribute["structured_scope_id"] = int(structured_scope_id)
    return {"data": {"type": "report", "attributes": attribute}}


_REPORT_PARAMS = {
    "type": "object",
    "properties": {
        "team_handle": {
            "type": "string",
            "description": "The program's handle (from hackerone_programs)",
        },
        "title": {"type": "string", "description": "Short, specific report title"},
        "vulnerability_information": {
            "type": "string",
            "description": (
                "The full write-up in Markdown: summary, steps to reproduce, "
                "proof of concept, and remediation."
            ),
        },
        "impact": {
            "type": "string",
            "description": "What an attacker gains -- the concrete security impact",
        },
        "severity_rating": {
            "type": "string",
            "enum": list(SCHWERE),
            "description": "Your severity estimate",
        },
        "weakness_id": {
            "type": "integer",
            "description": "Weakness id from hackerone_program (optional but recommended)",
        },
        "structured_scope_id": {
            "type": "integer",
            "description": "Structured scope id of the affected asset (optional)",
        },
    },
    "required": [
        "team_handle",
        "title",
        "vulnerability_information",
        "impact",
        "severity_rating",
    ],
}


def _pruefe_report(severity_rating: str) -> str:
    schwere = severity_rating.strip().lower()
    if schwere not in SCHWERE:
        raise ToolError(f"severity_rating must be one of {', '.join(SCHWERE)}.")
    return schwere


class HackerOneDraftReportTool(_HackerOneTool):
    name = "hackerone_draft_report"
    description = (
        "Composes a submission-ready HackerOne report and returns it for "
        "review -- it does NOT send anything. Use this to write up a finding: "
        "it validates the fields and shows both the formatted report and the "
        "exact payload that would be submitted. The person then submits it "
        "from their HackerOne dashboard (or enables direct submission)."
    )
    parameters = _REPORT_PARAMS

    async def run(
        self,
        team_handle: str,
        title: str,
        vulnerability_information: str,
        impact: str,
        severity_rating: str,
        weakness_id: int | None = None,
        structured_scope_id: int | None = None,
    ) -> str:
        schwere = _pruefe_report(severity_rating)
        griff = team_handle.strip().strip("/")
        if not griff:
            raise ToolError("Give the program's team_handle.")

        koerper = _report_koerper(
            team_handle=griff,
            title=title.strip(),
            vulnerability_information=vulnerability_information,
            impact=impact,
            severity_rating=schwere,
            weakness_id=weakness_id,
            structured_scope_id=structured_scope_id,
        )
        import json as _json

        return truncate(
            "\n".join(
                [
                    f"DRAFT (not submitted) for program '{griff}':",
                    "",
                    f"# {title.strip()}",
                    f"Severity: {schwere}",
                    (
                        f"Weakness id: {weakness_id}"
                        if weakness_id is not None
                        else "Weakness id: (none set)"
                    ),
                    (
                        f"Scope id: {structured_scope_id}"
                        if structured_scope_id is not None
                        else "Scope id: (none set)"
                    ),
                    "",
                    "## Vulnerability information",
                    vulnerability_information.strip(),
                    "",
                    "## Impact",
                    impact.strip(),
                    "",
                    "---",
                    "To submit, hand this to hackerone_submit_report (if "
                    "enabled) or paste it into HackerOne. Exact API payload:",
                    _json.dumps(koerper, ensure_ascii=False, indent=2),
                ]
            ),
            8000,
        )


class HackerOneSubmitReportTool(_HackerOneTool):
    name = "hackerone_submit_report"
    description = (
        "Submits a vulnerability report to a HackerOne program for real. This "
        "is irreversible and visible to the program's team, so only submit a "
        "finding that is complete and reproducible -- draft with "
        "hackerone_draft_report first. Returns the created report id and url."
    )
    parameters = _REPORT_PARAMS

    async def run(
        self,
        team_handle: str,
        title: str,
        vulnerability_information: str,
        impact: str,
        severity_rating: str,
        weakness_id: int | None = None,
        structured_scope_id: int | None = None,
    ) -> str:
        schwere = _pruefe_report(severity_rating)
        griff = team_handle.strip().strip("/")
        if not griff:
            raise ToolError("Give the program's team_handle.")

        koerper = _report_koerper(
            team_handle=griff,
            title=title.strip(),
            vulnerability_information=vulnerability_information,
            impact=impact,
            severity_rating=schwere,
            weakness_id=weakness_id,
            structured_scope_id=structured_scope_id,
        )
        daten = await self._sende("/hackers/reports", koerper)
        eintrag = daten.get("data") or {}
        kennung = eintrag.get("id", "?")
        a = eintrag.get("attributes") or {}
        url = a.get("url") or f"https://hackerone.com/reports/{kennung}"
        return f"Submitted to '{griff}'. Report #{kennung}: {url}"


def create_hackerone_tools(
    client: httpx.AsyncClient,
    username: str,
    token: str,
    *,
    allow_submit: bool = False,
) -> list[LocalTool]:
    """Alle HackerOne-Werkzeuge -- das Absenden nur, wenn ausdruecklich erlaubt."""
    werkzeuge: list[LocalTool] = [
        HackerOneProgramsTool(client, username, token),
        HackerOneProgramTool(client, username, token),
        HackerOneHacktivityTool(client, username, token),
        HackerOneReportsTool(client, username, token),
        HackerOneDraftReportTool(client, username, token),
    ]
    if allow_submit:
        werkzeuge.append(HackerOneSubmitReportTool(client, username, token))
        logger.info("HackerOne: Absenden aktiv (HACKERONE_ALLOW_SUBMIT=true)")
    else:
        logger.info(
            "HackerOne: nur Entwurf -- hackerone_submit_report aus "
            "(HACKERONE_ALLOW_SUBMIT nicht gesetzt)"
        )
    return werkzeuge


def _naechste(daten: dict[str, Any]) -> bool:
    return bool((daten.get("links") or {}).get("next"))


def _betrag(wert: object) -> str:
    """'500.0' -> '500', None/0 -> ''. Bloss keine Nullbetraege anzeigen."""
    if wert in (None, "", "0", "0.0", 0):
        return ""
    try:
        zahl = float(wert)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return str(wert)
    if zahl <= 0:
        return ""
    return f"{zahl:.0f}" if zahl == int(zahl) else f"{zahl:.2f}"


def _beziehung_handle(eintrag: dict[str, Any], name: str) -> str:
    """Zieht den Handle aus relationships[name].data.attributes.handle."""
    beziehung = (eintrag.get("relationships") or {}).get(name) or {}
    a = ((beziehung.get("data") or {}).get("attributes")) or {}
    return a.get("handle", "")


def _fehlertext(fehler: object) -> str:
    if not isinstance(fehler, list):
        return ""
    teile = []
    for eintrag in fehler:
        if isinstance(eintrag, dict):
            stueck = eintrag.get("title") or eintrag.get("detail")
            if stueck:
                teile.append(str(stueck))
    return "; ".join(teile)
