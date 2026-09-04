import Link from "next/link";
import {
  ArrowRightIcon,
  KeyRoundIcon,
  LockIcon,
  MicIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

import { CodeTabs } from "@/components/docs/code-tabs";
import { MethodBadge } from "@/components/docs/docs-blocks";
import { Hero } from "@/components/site/hero";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import { docsNavigation } from "@/lib/docs/navigation";

const features = [
  {
    icon: SparklesIcon,
    title: "Streaming built in",
    text: "Reasoning, tool calls and the answer arrive as they happen — not in one lump at the end.",
  },
  {
    icon: ServerIcon,
    title: "Local or hosted",
    text: "Run a model on your own machine through Ollama, or a hosted one. Same chat, same tools — you pick per message.",
  },
  {
    icon: LockIcon,
    title: "Encrypted at rest",
    text: "Chats and notices are encrypted with a key derived from your password. The key lives in memory only, never on disk.",
  },
  {
    icon: MicIcon,
    title: "Files, voice, tools",
    text: "Attach a file, speak your question in any language, and let the model search, fetch and look at things itself.",
  },
];

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

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <Hero />

      <section className="border-b">
        <div className="mx-auto grid w-full max-w-6xl gap-px overflow-hidden px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.title} className="flex flex-col gap-3 p-6">
              <feature.icon className="size-5 text-primary" />
              <h2 className="font-medium">{feature.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance">
Nothing to sign up for
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              The backend runs next to you on localhost. Start it, point a
              request at it, and read the answer as it comes in. No key, no
              account, no SDK to install.
            </p>
            <Link
              href="/docs/getting-started"
              className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              To the quickstart
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>

          <CodeTabs tabs={quickstartTabs} />
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="relative overflow-hidden rounded-3xl border bg-card/40 p-8 sm:p-12">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-primary/20 opacity-40 blur-3xl"
            />
            <div className="relative grid items-center gap-10 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <span className="flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <ShieldCheckIcon className="size-3.5" />
                  API keys
                </span>
                <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance">
                  Ready to put it online?
                </h2>
                <p className="leading-relaxed text-muted-foreground">
                  Local stays keyless. When you expose the backend, an API key
                  becomes the ticket in — created against your account, shown
                  once, sent as a bearer token. Turn on{" "}
                  <code className="rounded bg-muted/70 px-1 py-px font-mono text-[13px]">
                    REQUIRE_API_KEY
                  </code>{" "}
                  and every request needs one.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    nativeButton={false}
                    render={
                      <Link href="/settings?section=keys">
                        <KeyRoundIcon className="size-4" />
                        Manage API keys
                      </Link>
                    }
                  />
                  <Link
                    href="/docs/authentication"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    How authentication works
                    <ArrowRightIcon className="size-3.5" />
                  </Link>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border bg-background/60 p-5 font-mono text-[12px] leading-relaxed text-muted-foreground">
                <pre>{`curl -N https://your-host/api/v1/chat/stream \\
  -H "Authorization: Bearer sk_smee_…" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user",
                  "content":"Hello!"}]}'`}</pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-20">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">
              The whole API
            </h2>
            <p className="text-muted-foreground">
              Just a handful of endpoints — nothing more to learn.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border">
            {endpointPages.map((page, index) => (
              <Link
                key={page.slug}
                href={`/docs/${page.slug}`}
                className={`group/row flex flex-wrap items-center gap-4 p-4 transition-colors hover:bg-accent ${
                  index > 0 ? "border-t" : ""
                }`}
              >
                {page.method ? <MethodBadge method={page.method} /> : null}
                <span className="font-medium">{page.title}</span>
                <span className="hidden text-sm text-muted-foreground sm:block">
                  {page.description}
                </span>
                <ArrowRightIcon className="ml-auto size-4 text-muted-foreground transition-transform group-hover/row:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl">
Open a chat and see
          </h2>
          <p className="max-w-md text-pretty text-muted-foreground">
            Everything stays on this machine unless you send it somewhere.
          </p>
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/chat">Start chatting</Link>}
          />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
