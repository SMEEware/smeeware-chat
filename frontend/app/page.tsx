import { Hero } from "@/components/site/hero";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import {
  LandingTimeline,
  type LandingEndpoint,
} from "@/components/site/timeline/landing-timeline";
import { docsContent } from "@/lib/docs/content";
import { docsNavigation } from "@/lib/docs/navigation";
import { getI18n } from "@/lib/i18n/server";
import { td } from "@/lib/docs/de";

const quickstartTabs = [
  {
    label: "cURL",
    language: "bash",
    code: `curl -N http://127.0.0.1:8000/api/v1/chat/stream \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "model": "deepseek-v4-flash"
  }'`,
  },
  {
    label: "TypeScript",
    language: "ts",
    code: `const response = await fetch(
  "http://127.0.0.1:8000/api/v1/chat/stream",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Hello!" }],
      model: "deepseek-v4-pro",
    }),
  },
);

// Server-Sent Events: one JSON frame per line, each with a type --
// "reasoning" while it thinks, "content" for the answer itself.
for await (const chunk of response.body!) {
  process.stdout.write(new TextDecoder().decode(chunk));
}`,
  },
  {
    label: "Python",
    language: "py",
    code: `import httpx

with httpx.stream(
    "POST",
    "http://127.0.0.1:8000/api/v1/chat/stream",
    json={
        "messages": [{"role": "user", "content": "Hello!"}],
        "model": "deepseek-v4-flash",
    },
    timeout=None,
) as response:
    for line in response.iter_lines():
        if line.startswith("data: "):
            print(line[6:])`,
  },
];

const endpointPages =
  docsNavigation
    .find((group) => group.title === "Endpoints")
    ?.pages.filter((page) => page.method) ?? [];

function endpointPath(slug: string): string {
  for (const block of docsContent[slug] ?? []) {
    if (block.type === "endpoint") return block.path;
  }
  return `/${slug}`;
}

export default async function LandingPage() {
  const { locale } = await getI18n();

  const endpoints: LandingEndpoint[] = endpointPages.flatMap((page) =>
    page.method
      ? [
          {
            slug: page.slug,
            method: page.method,
            path: endpointPath(page.slug),
            title: td(locale, page.title),
          },
        ]
      : [],
  );

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader autoHide />
      <Hero />
      <LandingTimeline endpoints={endpoints} quickstart={quickstartTabs} />
      <SiteFooter withLinks />
    </div>
  );
}
