import type { LucideIcon } from "lucide-react";
import {
  BookOpenIcon,
  CommandIcon,
  KeyRoundIcon,
  RocketIcon,
  TerminalIcon,
  WaypointsIcon,
} from "lucide-react";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type DocPage = {
  slug: string;
  title: string;
  description: string;
  method?: HttpMethod;
};

export type DocGroup = {
  title: string;
  icon: LucideIcon;
  pages: DocPage[];
};

export const docsNavigation: DocGroup[] = [
  {
    title: "Getting started",
    icon: BookOpenIcon,
    pages: [
      {
        slug: "",
        title: "Overview",
        description:
          "What the Smeeware API does and how the docs are organized.",
      },
      {
        slug: "getting-started",
        title: "Quickstart",
        description:
          "From an empty project to your first answer in a few minutes.",
      },
      {
        slug: "installation",
        title: "Installation",
        description: "SDKs, CLI, and configuring your environment.",
      },
    ],
  },
  {
    title: "Basics",
    icon: KeyRoundIcon,
    pages: [
      {
        slug: "authentication",
        title: "Authentication",
        description: "Create, rotate, and safely store API keys.",
      },
      {
        slug: "requests",
        title: "Requests & responses",
        description: "Request shape, content types, and the response format.",
      },
      {
        slug: "streaming",
        title: "Streaming",
        description: "Receive answers token by token over Server-Sent Events.",
      },
      {
        slug: "attachments",
        title: "Attachments",
        description: "Hang files on a prompt — text inline, images by path.",
      },
      {
        slug: "errors",
        title: "Error handling",
        description: "Error codes, retries, and what to do when things break.",
      },
      {
        slug: "rate-limits",
        title: "Rate limits",
        description: "Per-key quotas and the related headers.",
      },
    ],
  },
  {
    title: "Endpoints",
    icon: WaypointsIcon,
    pages: [
      {
        slug: "endpoints",
        title: "Overview",
        description: "Every endpoint of the API at a glance.",
      },
      {
        slug: "endpoints/health",
        title: "Health",
        description: "Liveness — is the process running?",
        method: "GET",
      },
      {
        slug: "endpoints/ready",
        title: "Ready",
        description: "Readiness — is the LLM provider reachable?",
        method: "GET",
      },
      {
        slug: "endpoints/chat",
        title: "Chat",
        description: "Answer in one piece as JSON.",
        method: "POST",
      },
      {
        slug: "endpoints/chat-stream",
        title: "Chat Stream",
        description: "Answer as SSE — including thinking and tools.",
        method: "POST",
      },
      {
        slug: "endpoints/models",
        title: "Models",
        description: "List the models that /chat accepts.",
        method: "GET",
      },
      {
        slug: "endpoints/tools",
        title: "Tools",
        description: "Every registered tool with its schema.",
        method: "GET",
      },
      {
        slug: "endpoints/vision",
        title: "Vision",
        description: "Look at images by address (JSON).",
        method: "POST",
      },
      {
        slug: "endpoints/vision-upload",
        title: "Vision Upload",
        description: "Look at uploaded image files (multipart).",
        method: "POST",
      },
      {
        slug: "endpoints/uploads",
        title: "Uploads",
        description: "Store attachments and get an address back (multipart).",
        method: "POST",
      },
      {
        slug: "endpoints/upload",
        title: "Upload",
        description: "Fetch one stored attachment by id.",
        method: "GET",
      },
      {
        slug: "endpoints/transcribe",
        title: "Transcribe",
        description: "Turn a recording into text (multipart).",
        method: "POST",
      },
      {
        slug: "endpoints/transcribe-models",
        title: "Transcribe Models",
        description: "The transcription models you can pick.",
        method: "GET",
      },
      {
        slug: "endpoints/tts",
        title: "Read Aloud",
        description: "Is read-aloud usable, and who speaks?",
        method: "GET",
      },
      {
        slug: "endpoints/tts-models",
        title: "Speech Models",
        description: "The speech models you can pick.",
        method: "GET",
      },
      {
        slug: "endpoints/prompts",
        title: "Prompts",
        description: "List the available system prompts.",
        method: "GET",
      },
      {
        slug: "endpoints/prompt",
        title: "Prompt",
        description: "Fetch one system prompt verbatim.",
        method: "GET",
      },
    ],
  },
  {
    title: "Chat app",
    icon: CommandIcon,
    pages: [
      {
        slug: "chat/commands",
        title: "Commands & shortcuts",
        description:
          "The command palette, the slash menu, and every shortcut.",
      },
      {
        slug: "chat/workspaces",
        title: "Workspaces",
        description: "Give the model a project and path to work from.",
      },
    ],
  },
  {
    title: "Tooling",
    icon: TerminalIcon,
    pages: [
      {
        slug: "sdks",
        title: "SDKs",
        description: "Official clients for TypeScript, Python, and Go.",
      },
      {
        slug: "changelog",
        title: "Changelog",
        description: "What changed in the latest versions.",
      },
    ],
  },
];

export const docsHighlightIcon = RocketIcon;

export const hrefForSlug = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

export const flatDocPages: (DocPage & { href: string; group: string })[] =
  docsNavigation.flatMap((group) =>
    group.pages.map((page) => ({
      ...page,
      href: hrefForSlug(page.slug),
      group: group.title,
    })),
  );

export const findDocPage = (slug: string) =>
  flatDocPages.find((page) => page.slug === slug);

export function docNeighbours(slug: string) {
  const index = flatDocPages.findIndex((page) => page.slug === slug);
  if (index === -1) return { previous: undefined, next: undefined };
  return {
    previous: index > 0 ? flatDocPages[index - 1] : undefined,
    next: index < flatDocPages.length - 1 ? flatDocPages[index + 1] : undefined,
  };
}

export function docBreadcrumb(slug: string) {
  const group = docsNavigation.find((candidate) =>
    candidate.pages.some((page) => page.slug === slug),
  );
  return { group: group?.title, page: findDocPage(slug) };
}
