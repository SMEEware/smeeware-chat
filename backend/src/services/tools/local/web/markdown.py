from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, NavigableString, Tag

JUNK_TAGS = {
    "script", "style", "noscript", "svg", "canvas", "template", "iframe",
    "form", "button", "input", "select", "textarea", "head", "meta", "link",
    "object", "embed", "map", "audio", "video", "source",
}
CHROME_TAGS = {"nav", "aside", "footer", "header"}

BLOCK = {
    "p", "div", "section", "article", "main", "figure", "figcaption", "dl",
    "dt", "dd", "address", "details", "summary", "fieldset", "hgroup",
}
HEADINGS = {"h1": "#", "h2": "##", "h3": "###", "h4": "####", "h5": "#####", "h6": "######"}
EMPHASIS = {"strong": "**", "b": "**", "em": "_", "i": "_", "del": "~~", "s": "~~"}

POSITIVE = re.compile(r"article|body|content|entry|main|post|story|text|blog|markdown", re.I)
NEGATIVE = re.compile(
    r"nav|menu|sidebar|footer|comment|meta|promo|banner|advert|\bads?\b|cookie|"
    r"social|share|related|breadcrumb|pager|popup|modal|newsletter|subscribe",
    re.I,
)


def parse(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def title(soup: BeautifulSoup) -> str:
    for candidate in (soup.find("h1"), soup.find("title")):
        if isinstance(candidate, Tag) and (text := candidate.get_text(" ", strip=True)):
            return _clip(text)
    return ""


def clean(soup: BeautifulSoup, *, keep_chrome: bool = False) -> BeautifulSoup:
    removed_tags = JUNK_TAGS | (set() if keep_chrome else CHROME_TAGS)
    for tag in soup.find_all(list(removed_tags)):
        tag.decompose()
    for comment in soup.find_all(string=lambda s: type(s) is not NavigableString):
        comment.extract()
    return soup


def main_content(soup: BeautifulSoup) -> Tag:
    body = soup.body or soup

    for name in ("article", "main"):
        node = soup.find_all(name)
        if len(node) == 1 and len(node[0].get_text(strip=True)) > 400:
            return node[0]

    points: dict[int, float] = {}
    nodes_by_id: dict[int, Tag] = {}
    for paragraph in body.find_all(["p", "pre", "blockquote", "td"]):
        text = paragraph.get_text(" ", strip=True)
        if len(text) < 25:
            continue
        value = 1 + text.count(",") + text.count(";") + min(len(text) / 100, 3.0)
        for level, parent in enumerate(_ancestors(paragraph, 3)):
            if level == 0 or parent is not body:
                nodes_by_id.setdefault(id(parent), parent)
                points[id(parent)] = points.get(id(parent), 0.0) + value / (level + 1)

    if not points:
        return body

    for key, node in nodes_by_id.items():
        traits = " ".join(node.get("class", [])) + " " + (node.get("id") or "")
        if NEGATIVE.search(traits):
            points[key] *= 0.2
        elif POSITIVE.search(traits):
            points[key] *= 1.5
        points[key] *= 1 - _link_density(node)

    best = nodes_by_id[max(points, key=lambda k: points[k])]
    return best if len(best.get_text(strip=True)) > 250 else body


def to_markdown(node: Tag, basis: str = "", *, images: bool = False) -> str:
    return _cleanup(_render(node, basis, images))


def table_to_markdown(table: Tag, *, max_rows: int = 50) -> str:
    lines: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"], recursive=False) or tr.find_all(["th", "td"])
        values = [_cell_text(z) for z in cells]
        if any(values):
            lines.append(values)
    if not lines:
        return ""

    latitude = max(len(z) for z in lines)
    lines = [z + [""] * (latitude - len(z)) for z in lines]
    head, body_rows = lines[0], lines[1:]

    out = [
        "| " + " | ".join(head) + " |",
        "|" + "|".join(" --- " for _ in head) + "|",
    ]
    out += ["| " + " | ".join(z) + " |" for z in body_rows[:max_rows]]
    if len(body_rows) > max_rows:
        out.append(f"[... {len(body_rows) - max_rows} more rows]")
    return "\n".join(out)


def _render(node: object, basis: str, images: bool, *, raw: bool = False) -> str:
    if isinstance(node, NavigableString):
        if type(node) is not NavigableString:
            return ""
        text = str(node)
        return text if raw else re.sub(r"\s+", " ", text)

    if not isinstance(node, Tag):
        return ""

    name = node.name.lower()
    if name in JUNK_TAGS:
        return ""

    def render_children(*, in_raw: bool = raw) -> str:
        return "".join(_render(k, basis, images, raw=in_raw) for k in node.children)

    if name == "br":
        return "\n"
    if name == "hr":
        return "\n\n---\n\n"
    if name in HEADINGS:
        if text := render_children().strip():
            return f"\n\n{HEADINGS[name]} {text}\n\n"
        return ""
    if name == "pre":
        code = node.get_text()
        language = _language(node)
        return f"\n\n```{language}\n{code.strip()}\n```\n\n"
    if name == "code":
        text = render_children().strip()
        return f"`{text}`" if text else ""
    if name == "blockquote":
        text = _cleanup(render_children())
        indented = "\n".join(f"> {z}" if z else ">" for z in text.split("\n"))
        return f"\n\n{indented}\n\n"
    if name == "a":
        return _link(node, render_children(), basis)
    if name == "img":
        return _image(node, basis, images)
    if name in ("ul", "ol"):
        return _list(node, basis, images)
    if name == "li":
        return render_children()
    if name == "table":
        if md := table_to_markdown(node):
            return f"\n\n{md}\n\n"
        return ""
    if name in EMPHASIS:
        text = render_children().strip()
        chars = EMPHASIS[name]
        return f"{chars}{text}{chars}" if text else ""
    if name in BLOCK:
        content = render_children().strip()
        return f"\n\n{content}\n\n" if content else ""
    return render_children()


def _list(node: Tag, basis: str, images: bool) -> str:
    ordered = node.name.lower() == "ol"
    lines: list[str] = []
    number = int(node.get("start", 1) or 1)

    for point in node.find_all("li", recursive=False):
        content = _cleanup(_render(point, basis, images))
        if not content:
            continue
        content = re.sub(r"\n{2,}", "\n", content)
        marker = f"{number}." if ordered else "-"
        number += 1
        first, *rest = content.split("\n")
        lines.append(f"{marker} {first}")
        lines += [f"  {z}" for z in rest if z.strip()]

    return f"\n\n{chr(10).join(lines)}\n\n" if lines else ""


def _link(node: Tag, text: str, basis: str) -> str:
    target = str(node.get("href") or "").strip()
    text = text.strip() or str(node.get("title") or "").strip()
    if not target or target.startswith(("javascript:", "#")):
        return text
    target = urljoin(basis, target) if basis else target
    if not text:
        return f"<{target}>"
    return f"[{text}]({target})"


def _image(node: Tag, basis: str, images: bool) -> str:
    description = str(node.get("alt") or "").strip()
    source = str(node.get("src") or node.get("data-src") or "").strip()
    if not images:
        return f"[Image: {description}]" if description else ""
    if not source or source.startswith("data:"):
        return f"[Image: {description}]" if description else ""
    return f"![{description}]({urljoin(basis, source) if basis else source})"


def _language(node: Tag) -> str:
    targets = [node, *node.find_all("code", limit=1)]
    for target in targets:
        for cls in target.get("class", []):
            if matched := re.fullmatch(r"(?:language|lang|highlight)[-_](\w+)", cls):
                return matched.group(1)
    return ""


def _cell_text(cell: Tag) -> str:
    text = re.sub(r"\s+", " ", cell.get_text(" ", strip=True))
    return text.replace("|", "\\|")


def _link_density(node: Tag) -> float:
    total = len(node.get_text(strip=True))
    if not total:
        return 1.0
    in_links = sum(len(a.get_text(strip=True)) for a in node.find_all("a"))
    return min(in_links / total, 1.0)


def _ancestors(node: Tag, count: int) -> list[Tag]:
    chain: list[Tag] = []
    parent = node.parent
    while parent is not None and len(chain) < count and isinstance(parent, Tag):
        chain.append(parent)
        parent = parent.parent
    return chain


def _cleanup(text: str) -> str:
    text = "\n".join(z.rstrip() for z in text.split("\n"))
    text = re.sub(r"(?<=\S)[ \t]{2,}", " ", text)
    text = re.sub(r"^ (?=\S)", "", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _clip(text: str, limit: int = 200) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[:limit] + "..."
