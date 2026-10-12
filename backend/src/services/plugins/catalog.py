from __future__ import annotations

from collections.abc import Iterable, Sequence

from src.services.plugins.manifest import ALWAYS_AVAILABLE, PluginManifest

CATALOG: tuple[PluginManifest, ...] = (
    PluginManifest(
        slug="web-search",
        title="Web Search",
        category="search",
        summary="Search the web, images and videos through Brave.",
        description=(
            "Gives the model a general-purpose search engine. It can look up "
            "current information, find images to inspect, and locate videos. "
            "Results carry titles, links and snippets, not full pages -- use "
            "Web Reader to actually read what it finds."
        ),
        tools=("web_search", "image_search", "video_search"),
        requires=("BRAVE_API_KEY",),
        icon="Search",
    ),
    PluginManifest(
        slug="answer-engine",
        title="Answer Engine",
        category="search",
        summary="Short, sourced answers to factual questions.",
        description=(
            "Brave's answer endpoint returns a written answer with sources "
            "instead of a list of links. Faster than searching and reading for "
            "questions that have one clear answer."
        ),
        tools=("brave_answers",),
        requires=("BRAVE_ANSWERS_API_KEY",),
        icon="Sparkles",
    ),
    PluginManifest(
        slug="google-suite",
        title="Google & Marketplaces",
        category="search",
        summary="Google, Maps, Amazon, YouTube and social profiles via SerpApi.",
        description=(
            "Reaches the places Brave does not: Google results, Maps entries "
            "with addresses and hours, Amazon listings with prices, YouTube "
            "search plus transcripts, and public social profiles. Six tools "
            "behind one key."
        ),
        tools=(
            "google_search",
            "social_profile",
            "amazon_search",
            "maps_search",
            "youtube_search",
            "youtube_transcript",
        ),
        requires=("SERPAPI_API_KEY",),
        icon="Globe",
    ),
    PluginManifest(
        slug="web-reader",
        title="Web Reader",
        category="web",
        summary="Read pages, APIs and tables from any URL.",
        description=(
            "Fetches a page and hands the model readable text instead of HTML. "
            "Can pull several pages at once, read JSON APIs, extract tables and "
            "specific elements by selector, and list the links on a page. Needs "
            "no key -- it only reads what a browser could."
        ),
        tools=(
            "fetch_page",
            "batch_fetch",
            "fetch_json",
            "extract_selectors",
            "extract_tables",
            "list_links",
        ),
        icon="FileText",
    ),
    PluginManifest(
        slug="image-generation",
        title="Image Generation",
        category="media",
        summary="Create images from a description.",
        description=(
            "The model can draw. Generated images are stored with your uploads "
            "and appear inline in the conversation. Runs on OpenAI, so it needs "
            "that key and costs money per image."
        ),
        tools=("generate_image",),
        requires=("OPENAI_API_KEY", "IMAGE_ENABLED"),
        icon="Image",
    ),
    PluginManifest(
        slug="vision",
        title="Image Understanding",
        category="media",
        summary="Let the model look at images you attach.",
        description=(
            "The main model does not see pictures. This tool does the looking "
            "and reports back in words, so an attached screenshot or photo can "
            "be part of the conversation."
        ),
        tools=("analyze_image",),
        requires=("VISION_ENABLED",),
        icon="Eye",
    ),
    PluginManifest(
        slug="speech",
        title="Read Aloud",
        category="media",
        summary="Speak an answer out loud.",
        description=(
            "Turns text into speech and plays it in the browser. Useful for long "
            "answers you would rather listen to than read."
        ),
        tools=("read_aloud",),
        requires=("TTS_ENABLED",),
        icon="Volume2",
    ),
    PluginManifest(
        slug="object-storage",
        title="Object Storage",
        category="files",
        summary="Put files in the bucket and get them back.",
        description=(
            "Read, write, list and delete objects in the configured S3 bucket. "
            "The model can park a generated file somewhere durable and hand you "
            "a link to it."
        ),
        tools=("storage_get", "storage_put", "storage_list", "storage_delete"),
        requires=("STORAGE_ENABLED", "STORAGE_ALIAS", "STORAGE_PUBLIC_BASE"),
        icon="Database",
    ),
    PluginManifest(
        slug="skills",
        title="Skills",
        category="skills",
        summary="Teach the model routines it can reuse later.",
        description=(
            "A skill is a written procedure the model can save, look up and "
            "follow again in a later chat. It can also import one from a URL. "
            "Skills persist across conversations."
        ),
        tools=("skill_list", "skill_save", "skill_import", "skill_delete", "use_skill"),
        icon="GraduationCap",
    ),
    PluginManifest(
        slug="shell",
        title="Shell Access",
        category="system",
        summary="Run commands on the machine this backend runs on.",
        description=(
            "The most powerful tool here. Commands run with the rights of the "
            "server process, and what runs is decided by the model based on what "
            "someone types into the chat. There is a blocklist for the obvious "
            "cases, but it is a speed bump, not a fence. Only install this if "
            "you are the only one who can sign in."
        ),
        tools=("run_shell",),
        requires=("SHELL_ENABLED",),
        icon="Terminal",
    ),
    PluginManifest(
        slug="system-status",
        title="System & Notifications",
        category="system",
        summary="Check the health of the backend and its model providers.",
        description=(
            "Lets the model report on the state of the backend, the reachable "
            "providers and the local models. Notifications are not part of "
            "this: notify_user is always available and cannot be switched off."
        ),
        tools=("system_check",),
        icon="Activity",
    ),
    PluginManifest(
        slug="location",
        title="Location & Weather",
        category="system",
        summary="Know roughly where you are and what the weather is doing.",
        description=(
            "Supplies the current date, an approximate location derived from the "
            "server's address, and a weather forecast for it. Handy when a "
            "question depends on where or when it is asked."
        ),
        tools=("get_context", "get_weather"),
        icon="MapPin",
    ),
    PluginManifest(
        slug="hackerone",
        title="HackerOne",
        category="security",
        summary="Browse programs, reports and hacktivity.",
        description=(
            "Read access to HackerOne: which programs exist and what they pay, "
            "your own reports, and public hacktivity. It can draft a report, but "
            "submitting one stays behind its own switch (HACKERONE_ALLOW_SUBMIT)."
        ),
        tools=(
            "hackerone_programs",
            "hackerone_program",
            "hackerone_reports",
            "hackerone_hacktivity",
            "hackerone_draft_report",
        ),
        requires=("HACKERONE_API_USERNAME", "HACKERONE_API_TOKEN"),
        icon="ShieldCheck",
    ),
)


def by_slug(slug: str) -> PluginManifest | None:
    for manifest in CATALOG:
        if manifest.slug == slug:
            return manifest
    return None


def mcp_manifest(server: str, tools: Sequence[str]) -> PluginManifest:
    return PluginManifest(
        slug=f"mcp-{server}",
        title=f"{server} (MCP)",
        category="system",
        summary=f"{len(tools)} tool(s) from the MCP server {server!r}.",
        description=(
            f"Provided by the MCP server {server!r}, configured in mcp.json. "
            "Its tools are defined by that server, not by this application."
        ),
        tools=tuple(tools),
        icon="Plug",
    )


def catalog_tools(manifests: Iterable[PluginManifest]) -> set[str]:
    return {tool for m in manifests for tool in m.tools}


def unknown_tools(
    existing: Iterable[str], manifests: Iterable[PluginManifest]
) -> set[str]:
    return set(existing) - catalog_tools(manifests) - ALWAYS_AVAILABLE
