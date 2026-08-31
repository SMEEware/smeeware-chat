"""HTML lesbar machen: Hauptinhalt finden, Markdown daraus bauen.

Warum Markdown und nicht Rohtext: Ueberschriften, Listen, Tabellen und Links
tragen die Struktur, die das Modell sonst raten muesste -- und Markdown ist
ein Bruchteil der Zeichen, die dasselbe HTML kostet.

``hauptinhalt`` ist eine abgespeckte Readability: Absaetze punkten, die Punkte
wandern an Eltern und Grosseltern, Navigations- und Fusszeilen-Klassennamen
ziehen ab. Wer die Seite komplett will, nimmt ``mode="full"``.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, NavigableString, Tag

# Trägt nie Inhalt -- fliegt immer raus.
MUELL = {
    "script", "style", "noscript", "svg", "canvas", "template", "iframe",
    "form", "button", "input", "select", "textarea", "head", "meta", "link",
    "object", "embed", "map", "audio", "video", "source",
}
# Trägt nur im Modus "full" Inhalt.
BEIWERK = {"nav", "aside", "footer", "header"}

BLOCK = {
    "p", "div", "section", "article", "main", "figure", "figcaption", "dl",
    "dt", "dd", "address", "details", "summary", "fieldset", "hgroup",
}
UEBERSCHRIFT = {"h1": "#", "h2": "##", "h3": "###", "h4": "####", "h5": "#####", "h6": "######"}
BETONUNG = {"strong": "**", "b": "**", "em": "_", "i": "_", "del": "~~", "s": "~~"}

POSITIV = re.compile(r"article|body|content|entry|main|post|story|text|blog|markdown", re.I)
NEGATIV = re.compile(
    r"nav|menu|sidebar|footer|comment|meta|promo|banner|advert|\bads?\b|cookie|"
    r"social|share|related|breadcrumb|pager|popup|modal|newsletter|subscribe",
    re.I,
)


def parse(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def titel(suppe: BeautifulSoup) -> str:
    for kandidat in (suppe.find("h1"), suppe.find("title")):
        if isinstance(kandidat, Tag) and (text := kandidat.get_text(" ", strip=True)):
            return _knapp(text)
    return ""


def saeubern(suppe: BeautifulSoup, *, beiwerk: bool = False) -> BeautifulSoup:
    """Entfernt Skripte und Styles -- optional auch Navigation und Fusszeile."""
    weg = MUELL | (set() if beiwerk else BEIWERK)
    for tag in suppe.find_all(list(weg)):
        tag.decompose()
    for kommentar in suppe.find_all(string=lambda s: type(s) is not NavigableString):
        kommentar.extract()
    return suppe


def hauptinhalt(suppe: BeautifulSoup) -> Tag:
    """Der Knoten mit dem eigentlichen Text -- oder der ganze Body."""
    body = suppe.body or suppe

    # Semantische Abkuerzung: eine eindeutige <article>/<main> glauben wir.
    for name in ("article", "main"):
        knoten = suppe.find_all(name)
        if len(knoten) == 1 and len(knoten[0].get_text(strip=True)) > 400:
            return knoten[0]

    punkte: dict[int, float] = {}
    knoten_nach_id: dict[int, Tag] = {}
    for absatz in body.find_all(["p", "pre", "blockquote", "td"]):
        text = absatz.get_text(" ", strip=True)
        if len(text) < 25:
            continue
        wert = 1 + text.count(",") + text.count(";") + min(len(text) / 100, 3.0)
        for stufe, eltern in enumerate(_vorfahren(absatz, 3)):
            if stufe == 0 or eltern is not body:
                knoten_nach_id.setdefault(id(eltern), eltern)
                punkte[id(eltern)] = punkte.get(id(eltern), 0.0) + wert / (stufe + 1)

    if not punkte:
        return body

    for schluessel, knoten in knoten_nach_id.items():
        merkmale = " ".join(knoten.get("class", [])) + " " + (knoten.get("id") or "")
        if NEGATIV.search(merkmale):
            punkte[schluessel] *= 0.2
        elif POSITIV.search(merkmale):
            punkte[schluessel] *= 1.5
        punkte[schluessel] *= 1 - _linkdichte(knoten)

    bester = knoten_nach_id[max(punkte, key=lambda k: punkte[k])]
    # Zu duenn geraten? Dann lieber die ganze Seite als ein halber Satz.
    return bester if len(bester.get_text(strip=True)) > 250 else body


def zu_markdown(knoten: Tag, basis: str = "", *, bilder: bool = False) -> str:
    return _aufraeumen(_render(knoten, basis, bilder))


def tabelle_zu_markdown(tabelle: Tag, *, max_zeilen: int = 50) -> str:
    """Eine <table> als Markdown-Tabelle. Leere Zeilen fliegen raus."""
    zeilen: list[list[str]] = []
    for tr in tabelle.find_all("tr"):
        zellen = tr.find_all(["th", "td"], recursive=False) or tr.find_all(["th", "td"])
        werte = [_zellentext(z) for z in zellen]
        if any(werte):
            zeilen.append(werte)
    if not zeilen:
        return ""

    breite = max(len(z) for z in zeilen)
    zeilen = [z + [""] * (breite - len(z)) for z in zeilen]
    kopf, rumpf = zeilen[0], zeilen[1:]

    aus = [
        "| " + " | ".join(kopf) + " |",
        "|" + "|".join(" --- " for _ in kopf) + "|",
    ]
    aus += ["| " + " | ".join(z) + " |" for z in rumpf[:max_zeilen]]
    if len(rumpf) > max_zeilen:
        aus.append(f"[... {len(rumpf) - max_zeilen} more rows]")
    return "\n".join(aus)


# ---------------------------------------------------------------------- #
# Der Wandler                                                             #
# ---------------------------------------------------------------------- #


def _render(knoten: object, basis: str, bilder: bool, *, roh: bool = False) -> str:
    if isinstance(knoten, NavigableString):
        if type(knoten) is not NavigableString:  # Kommentar, Doctype, CDATA
            return ""
        text = str(knoten)
        return text if roh else re.sub(r"\s+", " ", text)

    if not isinstance(knoten, Tag):
        return ""

    name = knoten.name.lower()
    if name in MUELL:
        return ""

    def kinder(*, in_roh: bool = roh) -> str:
        return "".join(_render(k, basis, bilder, roh=in_roh) for k in knoten.children)

    if name == "br":
        return "\n"
    if name == "hr":
        return "\n\n---\n\n"
    if name in UEBERSCHRIFT:
        if text := kinder().strip():
            return f"\n\n{UEBERSCHRIFT[name]} {text}\n\n"
        return ""
    if name == "pre":
        code = knoten.get_text()
        sprache = _sprache(knoten)
        return f"\n\n```{sprache}\n{code.strip()}\n```\n\n"
    if name == "code":
        text = kinder().strip()
        return f"`{text}`" if text else ""
    if name == "blockquote":
        text = _aufraeumen(kinder())
        eingerueckt = "\n".join(f"> {z}" if z else ">" for z in text.split("\n"))
        return f"\n\n{eingerueckt}\n\n"
    if name == "a":
        return _link(knoten, kinder(), basis)
    if name == "img":
        return _bild(knoten, basis, bilder)
    if name in ("ul", "ol"):
        return _liste(knoten, basis, bilder)
    if name == "li":
        return kinder()
    if name == "table":
        if md := tabelle_zu_markdown(knoten):
            return f"\n\n{md}\n\n"
        return ""
    if name in BETONUNG:
        text = kinder().strip()
        zeichen = BETONUNG[name]
        return f"{zeichen}{text}{zeichen}" if text else ""
    if name in BLOCK:
        # An den Raendern trimmen: sonst landet das Leerzeichen zwischen zwei
        # Inline-Elementen am Zeilenanfang. Innere Einrueckung bleibt heil.
        inhalt = kinder().strip()
        return f"\n\n{inhalt}\n\n" if inhalt else ""
    return kinder()


def _liste(knoten: Tag, basis: str, bilder: bool) -> str:
    geordnet = knoten.name.lower() == "ol"
    zeilen: list[str] = []
    nummer = int(knoten.get("start", 1) or 1)

    for punkt in knoten.find_all("li", recursive=False):
        inhalt = _aufraeumen(_render(punkt, basis, bilder))
        if not inhalt:
            continue
        # Leerzeilen im Punkt zusammenziehen -- eine verschachtelte Liste soll
        # direkt unter ihrem Elternpunkt stehen, nicht durch eine Luecke getrennt.
        inhalt = re.sub(r"\n{2,}", "\n", inhalt)
        marke = f"{nummer}." if geordnet else "-"
        nummer += 1
        erste, *rest = inhalt.split("\n")
        zeilen.append(f"{marke} {erste}")
        # Jede Ebene rueckt ihre Fortsetzungszeilen um zwei Leerzeichen ein;
        # verschachtelte Listen erben die Einrueckung dadurch von selbst.
        zeilen += [f"  {z}" for z in rest if z.strip()]

    return f"\n\n{chr(10).join(zeilen)}\n\n" if zeilen else ""


def _link(knoten: Tag, text: str, basis: str) -> str:
    ziel = str(knoten.get("href") or "").strip()
    text = text.strip() or str(knoten.get("title") or "").strip()
    if not ziel or ziel.startswith(("javascript:", "#")):
        return text
    ziel = urljoin(basis, ziel) if basis else ziel
    if not text:
        return f"<{ziel}>"
    return f"[{text}]({ziel})"


def _bild(knoten: Tag, basis: str, bilder: bool) -> str:
    beschreibung = str(knoten.get("alt") or "").strip()
    quelle = str(knoten.get("src") or knoten.get("data-src") or "").strip()
    if not bilder:
        # Ohne Bilder bleibt der Alt-Text -- er sagt oft, was das Modell braucht.
        return f"[Image: {beschreibung}]" if beschreibung else ""
    if not quelle or quelle.startswith("data:"):
        return f"[Image: {beschreibung}]" if beschreibung else ""
    return f"![{beschreibung}]({urljoin(basis, quelle) if basis else quelle})"


def _sprache(knoten: Tag) -> str:
    """Sprache aus ``class="language-python"`` o. ae. -- fuer den Codeblock."""
    ziele = [knoten, *knoten.find_all("code", limit=1)]
    for ziel in ziele:
        for klasse in ziel.get("class", []):
            if treffer := re.fullmatch(r"(?:language|lang|highlight)[-_](\w+)", klasse):
                return treffer.group(1)
    return ""


def _zellentext(zelle: Tag) -> str:
    text = re.sub(r"\s+", " ", zelle.get_text(" ", strip=True))
    return text.replace("|", "\\|")


def _linkdichte(knoten: Tag) -> float:
    gesamt = len(knoten.get_text(strip=True))
    if not gesamt:
        return 1.0
    in_links = sum(len(a.get_text(strip=True)) for a in knoten.find_all("a"))
    return min(in_links / gesamt, 1.0)


def _vorfahren(knoten: Tag, anzahl: int) -> list[Tag]:
    kette: list[Tag] = []
    eltern = knoten.parent
    while eltern is not None and len(kette) < anzahl and isinstance(eltern, Tag):
        kette.append(eltern)
        eltern = eltern.parent
    return kette


def _aufraeumen(text: str) -> str:
    text = "\n".join(z.rstrip() for z in text.split("\n"))
    # Nur nach einem sichtbaren Zeichen zusammenziehen -- die fuehrenden
    # Leerzeichen von Listeneinrueckungen muessen stehen bleiben.
    text = re.sub(r"(?<=\S)[ \t]{2,}", " ", text)
    # Ein einzelnes fuehrendes Leerzeichen stammt immer vom Umbruch zwischen
    # zwei Inline-Elementen; Einrueckungen sind immer zwei oder mehr.
    text = re.sub(r"^ (?=\S)", "", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _knapp(text: str, grenze: int = 200) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= grenze else text[:grenze] + "..."
