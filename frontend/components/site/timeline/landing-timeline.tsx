"use client";

import * as React from "react";
import Link from "next/link";
import {
  animate,
  motion,
  MotionConfig,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  AudioLinesIcon,
  BrainIcon,
  CheckIcon,
  CloudIcon,
  CopyIcon,
  CpuIcon,
  FolderGit2Icon,
  KeyRoundIcon,
} from "lucide-react";

import { CodeTabs } from "@/components/docs/code-tabs";
import { MethodBadge } from "@/components/docs/docs-blocks";
import { HeroActions } from "@/components/site/hero-parts/hero-actions";
import { FeatureStage } from "@/components/site/timeline/feature-stage";
import { UnderlineSmoke } from "@/components/site/timeline/underline-smoke";
import {
  ChapterHead,
  CommitRow,
  MergeRow,
  RefPill,
  Row,
} from "@/components/site/timeline/git-blocks";
import {
  GitAnchor,
  GitContext,
  useGitLayout,
  useGitLit,
} from "@/components/site/timeline/git-context";
import type { GitPathSpec } from "@/components/site/timeline/git-engine";
import { GitGraph } from "@/components/site/timeline/git-graph";
import { GitHud, type GitChapter } from "@/components/site/timeline/git-hud";
import { useT } from "@/context/i18n-provider";
import type { HttpMethod } from "@/lib/docs/navigation";
import { cn } from "@/lib/utils";

export type LandingEndpoint = {
  slug: string;
  method: HttpMethod;
  path: string;
  title: string;
};

type CodeTab = { label: string; language: string; code: string };

const PATHS: GitPathSpec[] = [
  {
    id: "story",
    tone: "main",
    comet: true,
    ids: [
      "root",
      "chat",
      "stream",
      "call",
      "workspace",
      "chat-merge",
      "run",
      "run-fork",
      "run-a",
      "run-a-end",
      "run-merge",
      "lock",
      "start",
      "clone",
      "boot",
      "open",
      "start-merge",
      "deploy",
      "keys",
      "deploy-merge",
      "api",
      "head",
    ],
  },
  {
    id: "cloud",
    tone: "main",
    comet: true,
    ids: ["run-fork", "run-b", "run-b-end", "run-merge"],
  },
  { id: "chat-main", tone: "ghost", ids: ["chat", "chat-merge"] },
  { id: "run-main", tone: "ghost", ids: ["run-fork", "run-merge"] },
  { id: "start-main", tone: "ghost", ids: ["start", "start-merge"] },
  { id: "deploy-main", tone: "ghost", ids: ["deploy", "deploy-merge"] },
];

const REPO = "https://github.com/SMEEware/smeeware-chat.git";

export function LandingTimeline({
  endpoints,
  quickstart,
}: {
  endpoints: LandingEndpoint[];
  quickstart: CodeTab[];
}) {
  const t = useT();
  const ref = React.useRef<HTMLDivElement>(null);
  const layout = useGitLayout(ref);
  const animated = !useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 62%", "end 62%"],
  });
  const height = useMotionValue(0);
  React.useEffect(() => {
    if (layout) height.set(layout.height);
  }, [layout, height]);
  const raw = useTransform(() => scrollYProgress.get() * height.get());
  const smooth = useSpring(raw, { stiffness: 190, damping: 30, mass: 0.5 });
  const litY = animated ? smooth : raw;

  const context = React.useMemo(
    () => ({ layout, litY, animated }),
    [layout, litY, animated],
  );

  const chapters: GitChapter[] = [
    { anchor: "chat", refName: "feat/chat", label: t("landing.chatTitle") },
    { anchor: "run", refName: "local ‖ cloud", label: t("landing.localTitle") },
    { anchor: "lock", refName: "main", label: t("landing.encryptTitle") },
    { anchor: "start", refName: "v1.0", label: t("landing.startTitle") },
    { anchor: "deploy", refName: "deploy", label: t("landing.deployTitle") },
    { anchor: "api", refName: "api/v1", label: t("landing.apiTitle") },
    { anchor: "head", refName: "HEAD", label: t("landing.endTitle") },
  ];

  const jump = (anchor: string) => {
    const root = ref.current;
    const point = layout?.points[anchor];
    if (!root || !point) return;
    const top =
      root.getBoundingClientRect().top +
      window.scrollY +
      point.y -
      window.innerHeight * 0.62 +
      24;
    window.scrollTo({ top, behavior: animated ? "smooth" : "auto" });
  };

  return (
    <GitContext.Provider value={context}>
      <MotionConfig reducedMotion="user">
        <section className="relative isolate overflow-hidden border-b">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
          >
            <div className="absolute -top-56 -left-40 size-[42rem] rounded-full bg-(--git)/8 blur-[150px]" />
            <div className="absolute top-[45%] -right-60 size-[36rem] rounded-full bg-(--git)/6 blur-[150px]" />
            <div className="git-grid absolute inset-0" />
          </div>

          <div className="mx-auto w-full max-w-6xl px-5 sm:px-6">
            <div
              ref={ref}
              className="relative pb-24 [--lane-0:12px] [--lane-1:27px] [--lane-2:42px] [--rail:52px] md:pb-32 md:[--lane-0:22px] md:[--lane-1:50px] md:[--lane-2:78px] md:[--rail:116px]"
            >
              {layout ? (
                <GitGraph
                  layout={layout}
                  paths={PATHS}
                  litY={litY}
                  animated={animated}
                />
              ) : null}

              <div className="relative z-10">
                <Intro />
                <ChatChapter />
                <RuntimeChapter />
                <EncryptChapter />
                <StartChapter quickstart={quickstart} />
                <DeployChapter />
                <ApiChapter endpoints={endpoints} />
                <Finale />
              </div>
            </div>
          </div>

          {layout ? (
            <GitHud chapters={chapters} layout={layout} onJump={jump} />
          ) : null}
        </section>
      </MotionConfig>
    </GitContext.Provider>
  );
}

function Intro() {
  const t = useT();
  return (
    <Row className="pt-16 md:pt-24">
      <div className="relative">
        <GitAnchor id="root" kind="root" lane={0} className="top-3" />
        <p className="flex h-6 min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="text-(--git-hot)">~/smeeware-chat</span>
          <span className="truncate">git log --graph</span>
          <span className="git-caret inline-block h-3.5 w-[7px] shrink-0 bg-(--git)" />
        </p>
        <p className="mt-2 max-w-md text-sm text-pretty text-muted-foreground/80">
          {t("landing.introHint")}
        </p>
      </div>
    </Row>
  );
}

function ChatChapter() {
  const t = useT();
  const how = t("common.howItWorks");
  return (
    <>
      <ChapterHead
        anchor="chat"
        kind="fork"
        hash="2f7c0d4"
        gitRef={{ kind: "branch", name: "feat/chat" }}
        title={t("landing.chatTitle")}
        lead={t("landing.chatLead")}
      />
      <Row>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-14">
          <div className="min-w-0">
            <CommitRow
              anchor="stream"
              hash="a1c9f02"
              title={
                <FeatureTitle icon={BrainIcon}>
                  {t("landing.streamTitle")}
                </FeatureTitle>
              }
              text={t("landing.streamText")}
              href="/docs/chat/steering"
              linkLabel={how}
            />
            <CommitRow
              anchor="call"
              hash="7e3b5d1"
              title={
                <FeatureTitle icon={AudioLinesIcon}>
                  {t("landing.callTitle")}
                </FeatureTitle>
              }
              text={t("landing.callText")}
              href="/docs/chat/voice-call"
              linkLabel={how}
            />
            <CommitRow
              anchor="workspace"
              hash="c84f2aa"
              title={
                <FeatureTitle icon={FolderGit2Icon}>
                  {t("landing.workspaceTitle")}
                </FeatureTitle>
              }
              text={t("landing.workspaceText")}
              href="/docs/chat/workspaces"
              linkLabel={how}
            />
          </div>
          <div className="hidden self-center pt-9 lg:block">
            <FeatureStage />
          </div>
        </div>
        <MergeRow anchor="chat-merge" label="Merge branch 'feat/chat'" />
      </Row>
    </>
  );
}

function FeatureTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {children}
      <Icon className="size-3.5 shrink-0 text-(--git-hot) opacity-80" />
    </span>
  );
}

function RuntimeChapter() {
  const t = useT();
  return (
    <>
      <ChapterHead
        anchor="run"
        kind="commit"
        hash="3d0e9b7"
        title={t("landing.runtimeTitle")}
        lead={t("landing.runtimeLead")}
      />
      <Row>
        <div className="relative h-10">
          <GitAnchor id="run-fork" kind="fork" lane={0} className="top-full" />
        </div>
        <div className="mt-12 grid gap-6 lg:mt-36 lg:grid-cols-2 lg:gap-8">
          <RuntimeCard
            anchor="run-a"
            end="run-a-end"
            lane={1}
            refName="local"
            icon={CpuIcon}
            title={t("landing.localTitle")}
            text={t("landing.localText")}
            chips={["qwen3:8b", "whisper.cpp", "Ollama"]}
          />
          <RuntimeCard
            anchor="run-b"
            end="run-b-end"
            lane={2}
            refName="cloud"
            icon={CloudIcon}
            title={t("landing.cloudTitle")}
            text={t("landing.cloudText")}
            chips={["DeepSeek V4 Flash", "GPT-5.6 Terra"]}
          />
        </div>
        <MergeRow
          anchor="run-merge"
          label={t("landing.runtimeMerge")}
          className="pt-14 lg:pt-36"
        />
      </Row>
    </>
  );
}

function RuntimeCard({
  anchor,
  end,
  lane,
  refName,
  icon: Icon,
  title,
  text,
  chips,
}: {
  anchor: string;
  end: string;
  lane: 1 | 2;
  refName: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  chips: string[];
}) {
  const lit = useGitLit(anchor);
  return (
    <div className="relative h-full">
      <GitAnchor
        id={anchor}
        kind="card"
        className="top-0 left-1/2 hidden lg:block"
      />
      <GitAnchor
        id={end}
        kind="card"
        className="bottom-0 left-1/2 hidden lg:block"
      />
      <GitAnchor
        id={anchor}
        kind="commit"
        lane={lane}
        className="top-[2.25rem] lg:hidden"
      />
      <GitAnchor
        id={end}
        kind="pass"
        lane={lane}
        className="bottom-0 lg:hidden"
      />

      <div
        className={cn(
          "relative h-full overflow-hidden rounded-2xl border bg-card/90 p-5 lg:bg-card/70 lg:backdrop-blur-md transition-[border-color,box-shadow,opacity,translate] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] sm:p-6",
          lit
            ? "border-(--git)/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--git)_12%,transparent),0_24px_80px_-24px_var(--git-glow)]"
            : "translate-y-2 opacity-40",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-(--git) to-transparent transition-opacity duration-700",
            lit ? "opacity-90" : "opacity-0",
          )}
        />
        <div className="flex items-center justify-between gap-3">
          <RefPill gitRef={{ kind: "branch", name: refName }} lit={lit} />
          <Icon
            className={cn(
              "size-4 transition-colors duration-500",
              lit ? "text-(--git-hot)" : "text-muted-foreground",
            )}
          />
        </div>
        <h3 className="mt-5 font-heading text-xl font-semibold tracking-tight">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground sm:text-[15px]">
          {text}
        </p>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-md border bg-background/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function EncryptChapter() {
  const t = useT();
  return (
    <ChapterHead
      anchor="lock"
      kind="lock"
      hash="9b2d4e0"
      gitRef={{ kind: "branch", name: "main" }}
      title={t("landing.encryptTitle")}
      lead={t("landing.encryptText")}
      aside={<CipherPanel />}
    />
  );
}

const GLYPHS = "abcdefABCDEF0123456789+/=";

function useCipher(plain: string, cipher: string, run: boolean, delay: number) {
  const [text, setText] = React.useState(plain);

  React.useEffect(() => {
    if (!run) return;
    let frame = 0;
    const begin = performance.now() + delay;
    const duration = 1100;
    const length = Math.max(plain.length, cipher.length);
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - begin) / duration));
      const done = Math.floor(progress * length);
      let next = "";
      for (let i = 0; i < length; i++) {
        if (i < done) next += cipher[i] ?? "";
        else if (i < done + 4 && progress > 0)
          next += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        else next += plain[i] ?? "";
      }
      setText(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [plain, cipher, run, delay]);

  return run ? text : plain;
}

function CipherPanel() {
  const t = useT();
  const lit = useGitLit("lock");
  const title = useCipher(
    t("landing.cipherTitle"),
    "enc:v1:R7uTSvBgseDFa7ZcXC9q…",
    lit,
    450,
  );
  const message = useCipher(
    t("landing.cipherMessage"),
    "enc:v1:snrFDft8MdqCAe1E9Oasq…",
    lit,
    750,
  );
  const rows = [
    { label: "title", value: title, sealed: title.startsWith("enc:") },
    { label: "message", value: message, sealed: message.startsWith("enc:") },
  ];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card/60 font-mono text-xs lg:backdrop-blur-md transition-[border-color,box-shadow] duration-700",
        lit && "border-(--git)/25 shadow-[0_24px_80px_-30px_var(--git-glow)]",
      )}
    >
      {lit ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-24 bg-linear-to-r from-transparent via-(--git)/15 to-transparent"
          initial={{ left: "-6rem" }}
          animate={{ left: "110%" }}
          transition={{ duration: 1.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        />
      ) : null}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-[11px] text-muted-foreground">
        <span>chats.db</span>
        <span className="text-(--git-hot)/90">AES-GCM · scrypt</span>
      </div>
      <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-4">
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <dt className="text-muted-foreground/60">{row.label}</dt>
            <dd
              className={cn(
                "truncate transition-colors duration-700",
                row.sealed ? "text-(--git-hot)" : "text-foreground",
              )}
            >
              {row.value}
            </dd>
          </React.Fragment>
        ))}
        <dt className="text-muted-foreground/60">key</dt>
        <dd className="flex items-center gap-2 text-foreground/85">
          <span className="relative flex size-1.5">
            <span className="absolute inset-0 motion-safe:animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative size-1.5 rounded-full bg-emerald-500" />
          </span>
          {t("landing.encryptKey")}
        </dd>
      </dl>
    </div>
  );
}

function StartChapter({ quickstart }: { quickstart: CodeTab[] }) {
  const t = useT();
  return (
    <>
      <ChapterHead
        anchor="start"
        kind="tag"
        hash="e7a13f5"
        gitRef={{ kind: "tag", name: "v1.0" }}
        title={t("landing.startTitle")}
        lead={t("landing.startLead")}
      />
      <Row>
        <div className="grid gap-x-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="min-w-0">
            <CommitRow
              anchor="clone"
              hash="41c8d2b"
              title={t("landing.stepClone")}
            >
              <Command value={`git clone ${REPO}`} />
            </CommitRow>
            <CommitRow
              anchor="boot"
              hash="0f9e6a3"
              title={t("landing.stepStart")}
            >
              <Command value="cd smeeware-chat && ./start.sh" />
            </CommitRow>
            <CommitRow
              anchor="open"
              hash="c2b7e18"
              title={t("landing.stepOpen")}
            >
              <Command value="open http://localhost:3000" />
            </CommitRow>
          </div>
          <ApiNow quickstart={quickstart} />
        </div>
        <MergeRow anchor="start-merge" label="Merge branch 'setup'" />
      </Row>
    </>
  );
}

function Command({ value }: { value: string }) {
  const t = useT();
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="group/cmd mt-3 flex max-w-full items-center gap-2 rounded-xl border bg-background/80 py-1.5 pr-1.5 pl-3 font-mono text-[12px] transition-colors hover:border-(--git)/30">
      <span className="text-(--git-hot) select-none">$</span>
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-foreground/90 [scrollbar-width:none]">
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t("landing.copied") : t("landing.copy")}
        title={copied ? t("landing.copied") : t("landing.copy")}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {copied ? (
          <CheckIcon className="size-3.5 text-emerald-500" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </button>
    </div>
  );
}

function ApiNow({ quickstart }: { quickstart: CodeTab[] }) {
  const t = useT();
  const lit = useGitLit("clone");
  return (
    <div
      className={cn(
        "min-w-0 pt-12 transition-[opacity,translate] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] lg:pt-9",
        lit ? "opacity-100" : "translate-y-2 opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{t("landing.apiNow")}</span>
        <Link
          href="/docs/getting-started"
          className="group/link inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary-text"
        >
          {t("landing.fullQuickstart")}
          <ArrowRightIcon className="size-3.5 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      </div>
      <div className="mt-3">
        <CodeTabs tabs={quickstart} />
      </div>
    </div>
  );
}

function DeployChapter() {
  const t = useT();
  return (
    <>
      <ChapterHead
        anchor="deploy"
        kind="fork"
        hash="b6d71c4"
        gitRef={{ kind: "branch", name: "deploy" }}
        title={t("landing.deployTitle")}
      />
      <Row>
        <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
          <CommitRow
            anchor="keys"
            hash="5e0a9d3"
            title={
              <span className="inline-flex items-center gap-2">
                {t("landing.keysCommit")}
                <KeyRoundIcon className="size-3.5 text-(--git-hot) opacity-80" />
              </span>
            }
            text={t("landing.deployText")}
          >
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                href="/settings?section=keys"
                className="group/link inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground"
              >
                <KeyRoundIcon className="size-3.5 text-(--git-hot)" />
                {t("landing.manageKeys")}
                <ArrowRightIcon className="size-3.5 transition-transform group-hover/link:translate-x-0.5" />
              </Link>
              <Link
                href="/docs/authentication"
                className="group/link inline-flex items-center gap-1 text-[13px] font-medium text-primary-text"
              >
                {t("landing.howAuthWorks")}
                <ArrowRightIcon className="size-3.5 transition-transform group-hover/link:translate-x-0.5" />
              </Link>
            </div>
          </CommitRow>
          <KeyCard />
        </div>
        <MergeRow anchor="deploy-merge" label="Merge branch 'deploy'" />
      </Row>
    </>
  );
}

function KeyCard() {
  const t = useT();
  const lit = useGitLit("keys");
  return (
    <div
      className={cn(
        "mt-8 min-w-0 self-center overflow-hidden rounded-2xl border bg-card/70 font-mono text-xs lg:backdrop-blur-md transition-[opacity,translate,border-color,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] lg:mt-9",
        lit
          ? "border-(--git)/30 shadow-[0_24px_80px_-28px_var(--git-glow)]"
          : "translate-y-2 opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2 font-sans text-xs font-medium text-foreground">
          <KeyRoundIcon className="size-3.5 text-(--git-hot)" />
          {t("landing.keyNew")}
        </span>
        <span>{t("landing.keyJust")}</span>
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2 rounded-lg border border-(--git)/25 bg-(--git)/6 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-foreground">
            sk_smee_
            <span className={cn("git-key", lit && "git-key-live")}>
              7Hq2vN9xKcR4mT8bWz
            </span>
          </span>
          <CopyIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </div>
        <p className="font-sans text-[12px] text-muted-foreground">
          {t("landing.keyOnce")}
        </p>
        <div className="overflow-x-auto rounded-lg bg-background/70 px-3 py-2 whitespace-nowrap text-muted-foreground [scrollbar-width:none]">
          <span className="text-foreground/85">Authorization:</span> Bearer{" "}
          <span className="text-(--git-hot)">sk_smee_••••</span>
        </div>
      </div>
    </div>
  );
}

function shortHash(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

function ApiChapter({ endpoints }: { endpoints: LandingEndpoint[] }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const lit = useGitLit("api");
  const count = String(endpoints.length);
  return (
    <ChapterHead
      anchor="api"
      kind="commit"
      hash="5a8e2f9"
      gitRef={{ kind: "branch", name: "api/v1" }}
      title={t("landing.apiTitle")}
      lead={t("landing.apiLead").replace("{count}", count)}
    >
      <div className="mt-8 overflow-hidden rounded-2xl border bg-card/60 lg:backdrop-blur-md">
        <div className="flex items-center gap-3 border-b px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
          <span className="flex gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
          </span>
          <span className="truncate">git log --oneline -- api/v1</span>
        </div>
        <ul className="grid md:grid-cols-2">
          {endpoints.map((endpoint, index) => (
            <li
              key={endpoint.slug}
              style={{ transitionDelay: lit ? `${index * 45}ms` : "0ms" }}
              className={cn(
                "border-b border-border/60 transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:odd:border-r",
                lit ? "opacity-100" : "-translate-x-2 opacity-0",
                index >= 6 && !open && "hidden md:block",
              )}
            >
              <Link
                href={`/docs/${endpoint.slug}`}
                title={endpoint.title}
                className="group/ep flex items-center gap-3 px-4 py-2.5 font-mono text-[12px] transition-colors hover:bg-accent/60"
              >
                <span className="hidden text-muted-foreground/45 sm:inline">
                  {shortHash(endpoint.slug)}
                </span>
                <MethodBadge method={endpoint.method} />
                <span className="min-w-0 truncate text-foreground/85">
                  {endpoint.path}
                </span>
                <ArrowUpRightIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/ep:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
          {endpoints.length > 6 && !open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="cursor-pointer font-medium text-foreground/85 hover:text-foreground md:hidden"
            >
              {t("landing.showAll").replace("{count}", count)}
            </button>
          ) : (
            <span className="md:hidden" />
          )}
          <span className="hidden md:block" />
          <Link
            href="/docs/endpoints"
            className="group/link inline-flex items-center gap-1 font-medium text-primary-text"
          >
            {t("landing.allEndpoints")}
            <ArrowRightIcon className="size-3.5 transition-transform group-hover/link:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </ChapterHead>
  );
}

function Finale() {
  const t = useT();
  const lit = useGitLit("head");
  const reduced = useReducedMotion();
  const reveal = useMotionValue(0);
  const line = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (reduced) {
      reveal.set(lit ? 1 : 0);
      return;
    }
    const controls = animate(reveal, lit ? 1 : 0, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      delay: lit ? 0.2 : 0,
    });
    return () => controls.stop();
  }, [lit, reduced, reveal]);

  return (
    <ChapterHead
      anchor="head"
      kind="head"
      hash="f00dcaf"
      gitRef={{ kind: "head", name: "main" }}
      title={
        <span className="relative isolate inline-block">
          {t("landing.endTitle")}
          <motion.span
            ref={line}
            aria-hidden
            style={{ scaleX: reveal }}
            className="absolute -bottom-1 left-0 h-[3px] w-full origin-left rounded-full bg-linear-to-r from-(--git) via-(--git-hot) to-transparent"
          />
          {reduced ? null : <UnderlineSmoke progress={reveal} line={line} />}
        </span>
      }
      lead={t("landing.endLead")}
    >
      <div className="mt-9 max-w-md">
        <HeroActions />
      </div>
    </ChapterHead>
  );
}
