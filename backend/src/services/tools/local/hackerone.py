from __future__ import annotations

from typing import Any

import httpx

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool, truncate

logger = get_logger(__name__)

BASIS = "https://api.hackerone.com/v1"

SEVERITIES = ("none", "low", "medium", "high", "critical")
HACKTIVITY_SORT = (
    "latest_disclosable_activity_at",
    "disclosed_at",
    "total_awarded_amount",
    "votes",
)


class _HackerOneTool(LocalTool):
    def __init__(self, client: httpx.AsyncClient, username: str, token: str) -> None:
        self._client = client
        self._auth = (username, token)

    async def _hole(self, path: str, **params: Any) -> dict[str, Any]:
        return await self._call("GET", path, params=params or None)

    async def _send(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._call("POST", path, json=body)

    async def _call(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self._auth[0]:
            raise ToolError(
                "HackerOne needs an API username too. Add "
                "HACKERONE_API_USERNAME to backend/.env -- it is shown next "
                "to your token under HackerOne -> Settings -> API Tokens."
            )
        try:
            response = await self._client.request(
                method,
                f"{BASIS}{path}",
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
            raise ToolError(
                "HackerOne rejected the credentials (HTTP "
                f"{response.status_code}). Check HACKERONE_API_USERNAME and "
                "HACKERONE_API_TOKEN in the backend .env -- both come from "
                "the same API token in your HackerOne settings."
            )
        if response.status_code == 404:
            raise ToolError("Not found on HackerOne (HTTP 404) -- wrong handle or id?")
        if response.status_code == 429:
            wait_time = response.headers.get("Retry-After", "a moment")
            raise ToolError(f"HackerOne rate limit hit -- retry after {wait_time}.")

        try:
            data = response.json()
        except ValueError:
            raise ToolError(
                f"HackerOne returned no JSON (HTTP {response.status_code})."
            ) from None

        if response.status_code >= 400:
            error = data.get("errors") if isinstance(data, dict) else None
            notification = _error_text(error) or f"HTTP {response.status_code}"
            raise ToolError(f"HackerOne error: {notification}")
        return data


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
        data = await self._hole(
            "/hackers/programs",
            **{
                "page[number]": max(1, int(page)),
                "page[size]": max(1, min(int(page_size), 100)),
            },
        )
        entries = data.get("data") or []
        if not entries:
            return "No programs available for this account."

        lines = [f"{len(entries)} programs (page {page}):", ""]
        for entry in entries:
            a = entry.get("attributes") or {}
            markers = []
            if a.get("offers_bounties"):
                markers.append("bounties")
            if a.get("open_scope"):
                markers.append("open-scope")
            if a.get("bookmarked"):
                markers.append("bookmarked")
            submission_state = a.get("submission_state") or a.get("state") or "?"
            lines.append(f"- {a.get('name', '(no name)')}  [{a.get('handle', '?')}]")
            tail = f"  submissions: {submission_state}"
            if markers:
                tail += "  |  " + ", ".join(markers)
            lines.append(tail)
        if _next(data):
            lines += ["", f"More programs on page {int(page) + 1}."]
        return truncate("\n".join(lines), 6000)


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
        slug = handle.strip().strip("/")
        if not slug:
            raise ToolError("Give a program handle.")

        data = await self._hole(f"/hackers/programs/{slug}")
        a = (data.get("data") or {}).get("attributes") or {}

        lines = [f"{a.get('name', slug)}  [{a.get('handle', slug)}]", ""]
        lines.append(f"State: {a.get('state', '?')}")
        lines.append(f"Submissions: {a.get('submission_state', '?')}")
        lines.append(f"Bounties: {'yes' if a.get('offers_bounties') else 'no'}")
        if a.get("currency"):
            lines.append(f"Currency: {a['currency']}")
        if policy := (a.get("policy") or "").strip():
            lines += ["", "Policy:", truncate(policy, 2500)]

        if include_scope:
            lines += ["", "In scope:"]
            lines.append(await self._scopes(slug))

        if include_weaknesses:
            lines += ["", "Accepted weaknesses (id -> name):"]
            lines.append(await self._weaknesses(slug))

        return truncate("\n".join(lines), 8000)

    async def _scopes(self, handle: str) -> str:
        try:
            data = await self._hole(
                f"/hackers/programs/{handle}/structured_scopes",
                **{"page[size]": 100},
            )
        except ToolError as exc:
            return f"  (could not load scope: {exc})"
        entries = data.get("data") or []
        if not entries:
            return "  (no structured scope published)"
        lines = []
        for entry in entries:
            a = entry.get("attributes") or {}
            if a.get("eligible_for_submission") is False:
                continue
            bounty = "bounty" if a.get("eligible_for_bounty") else "no-bounty"
            severity = a.get("max_severity")
            marker = f"{bounty}"
            if severity:
                marker += f", max {severity}"
            lines.append(
                f"  [scope {entry.get('id', '?')}] "
                f"{a.get('asset_type', '?')}: {a.get('asset_identifier', '?')}  ({marker})"
            )
        return "\n".join(lines) or "  (nothing currently eligible for submission)"

    async def _weaknesses(self, handle: str) -> str:
        try:
            data = await self._hole(
                f"/hackers/programs/{handle}/weaknesses",
                **{"page[size]": 100},
            )
        except ToolError as exc:
            return f"  (could not load weaknesses: {exc})"
        entries = data.get("data") or []
        if not entries:
            return "  (program lists no specific weaknesses)"
        lines = []
        for entry in entries:
            a = entry.get("attributes") or {}
            extern = f" ({a['external_id']})" if a.get("external_id") else ""
            lines.append(f"  [{entry.get('id', '?')}] {a.get('name', '?')}{extern}")
        return "\n".join(lines)


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

        data = await self._hole("/hackers/hacktivity", **params)
        entries = data.get("data") or []
        if not entries:
            return f"No disclosed reports for {query!r}." if query else "No results."

        lines = [f"{len(entries)} disclosed reports:", ""]
        for entry in entries:
            a = entry.get("attributes") or {}
            team = _relationship_handle(entry, "team")
            parts = []
            if a.get("severity_rating"):
                parts.append(str(a["severity_rating"]))
            if _amount(a.get("total_awarded_amount")):
                parts.append(f"${_amount(a['total_awarded_amount'])}")
            if a.get("disclosed_at"):
                parts.append(str(a["disclosed_at"])[:10])
            head = a.get("title") or "(undisclosed title)"
            lines.append(f"- {head}")
            subtitle = f"  {team}" if team else "  "
            if parts:
                subtitle += "  |  " + ", ".join(parts)
            lines.append(subtitle)
            if a.get("url"):
                lines.append(f"  {a['url']}")
        return truncate("\n".join(lines), 7000)


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
            identifier = str(report_id).strip()
            data = await self._hole(f"/hackers/reports/{identifier}")
            a = (data.get("data") or {}).get("attributes") or {}
            lines = [f"Report #{identifier}: {a.get('title', '(no title)')}", ""]
            lines.append(f"State: {a.get('state', '?')}")
            if a.get("created_at"):
                lines.append(f"Created: {a['created_at']}")
            team = _relationship_handle(data.get("data") or {}, "team")
            if team:
                lines.append(f"Program: {team}")
            if info := (a.get("vulnerability_information") or "").strip():
                lines += ["", truncate(info, 4000)]
            return truncate("\n".join(lines), 6000)

        data = await self._hole(
            "/hackers/me/reports",
            **{
                "page[number]": max(1, int(page)),
                "page[size]": max(1, min(int(page_size), 100)),
            },
        )
        entries = data.get("data") or []
        if not entries:
            return "You have no reports."
        lines = [f"{len(entries)} of your reports (page {page}):", ""]
        for entry in entries:
            a = entry.get("attributes") or {}
            lines.append(
                f"- #{entry.get('id', '?')}  [{a.get('state', '?')}]  "
                f"{a.get('title', '(no title)')}"
            )
        return truncate("\n".join(lines), 6000)


def _report_body(
    *,
    team_handle: str,
    title: str,
    vulnerability_information: str,
    impact: str,
    severity_rating: str,
    weakness_id: int | None,
    structured_scope_id: int | None,
) -> dict[str, Any]:
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
            "enum": list(SEVERITIES),
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


def _check_report(severity_rating: str) -> str:
    severity = severity_rating.strip().lower()
    if severity not in SEVERITIES:
        raise ToolError(f"severity_rating must be one of {', '.join(SEVERITIES)}.")
    return severity


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
        severity = _check_report(severity_rating)
        slug = team_handle.strip().strip("/")
        if not slug:
            raise ToolError("Give the program's team_handle.")

        body = _report_body(
            team_handle=slug,
            title=title.strip(),
            vulnerability_information=vulnerability_information,
            impact=impact,
            severity_rating=severity,
            weakness_id=weakness_id,
            structured_scope_id=structured_scope_id,
        )
        import json as _json

        return truncate(
            "\n".join(
                [
                    f"DRAFT (not submitted) for program '{slug}':",
                    "",
                    f"# {title.strip()}",
                    f"Severity: {severity}",
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
                    _json.dumps(body, ensure_ascii=False, indent=2),
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
        severity = _check_report(severity_rating)
        slug = team_handle.strip().strip("/")
        if not slug:
            raise ToolError("Give the program's team_handle.")

        body = _report_body(
            team_handle=slug,
            title=title.strip(),
            vulnerability_information=vulnerability_information,
            impact=impact,
            severity_rating=severity,
            weakness_id=weakness_id,
            structured_scope_id=structured_scope_id,
        )
        data = await self._send("/hackers/reports", body)
        entry = data.get("data") or {}
        identifier = entry.get("id", "?")
        a = entry.get("attributes") or {}
        url = a.get("url") or f"https://hackerone.com/reports/{identifier}"
        return f"Submitted to '{slug}'. Report #{identifier}: {url}"


def create_hackerone_tools(
    client: httpx.AsyncClient,
    username: str,
    token: str,
    *,
    allow_submit: bool = False,
) -> list[LocalTool]:
    tools: list[LocalTool] = [
        HackerOneProgramsTool(client, username, token),
        HackerOneProgramTool(client, username, token),
        HackerOneHacktivityTool(client, username, token),
        HackerOneReportsTool(client, username, token),
        HackerOneDraftReportTool(client, username, token),
    ]
    if allow_submit:
        tools.append(HackerOneSubmitReportTool(client, username, token))
        logger.info("HackerOne: submitting enabled (HACKERONE_ALLOW_SUBMIT=true)")
    else:
        logger.info(
            "HackerOne: drafts only -- hackerone_submit_report off "
            "(HACKERONE_ALLOW_SUBMIT not set)"
        )
    return tools


def _next(data: dict[str, Any]) -> bool:
    return bool((data.get("links") or {}).get("next"))


def _amount(value: object) -> str:
    if value in (None, "", "0", "0.0", 0):
        return ""
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return str(value)
    if number <= 0:
        return ""
    return f"{number:.0f}" if number == int(number) else f"{number:.2f}"


def _relationship_handle(entry: dict[str, Any], name: str) -> str:
    relationship = (entry.get("relationships") or {}).get(name) or {}
    a = ((relationship.get("data") or {}).get("attributes")) or {}
    return a.get("handle", "")


def _error_text(error: object) -> str:
    if not isinstance(error, list):
        return ""
    parts = []
    for entry in error:
        if isinstance(entry, dict):
            chunk = entry.get("title") or entry.get("detail")
            if chunk:
                parts.append(str(chunk))
    return "; ".join(parts)
