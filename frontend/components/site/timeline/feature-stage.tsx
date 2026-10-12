"use client";

import * as React from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import {
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  FileCodeIcon,
  FileTextIcon,
  FolderIcon,
  MicIcon,
  PhoneOffIcon,
  WrenchIcon,
} from "lucide-react";

import { useGitLit } from "@/components/site/timeline/git-context";
import { useT } from "@/context/i18n-provider";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

const WIDE = "(min-width: 1024px)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function FeatureStage() {
  const wide = React.useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
  return wide ? <Stage /> : null;
}

function Stage() {
  const t = useT();
  const ref = React.useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { margin: "160px 0px" });
  const stream = useGitLit("stream");
  const call = useGitLit("call");
  const workspace = useGitLit("workspace");
  const scene = workspace ? 2 : call ? 1 : 0;
  const titles = ["chat · streaming", "call · live", "workspace · ~/smeeware-chat"];

  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-card/70 shadow-2xl shadow-black/30 backdrop-blur-xl transition-[opacity,border-color] duration-700",
        stream ? "border-(--git)/25 opacity-100" : "opacity-40",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent via-(--git) to-transparent opacity-70"
      />
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        </span>
        <span className="relative h-4 flex-1 overflow-hidden font-mono text-[11px] text-muted-foreground">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={scene}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              transition={{ duration: 0.45, ease }}
              className="absolute inset-0"
            >
              {titles[scene]}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="flex gap-1">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                index === scene ? "w-4 bg-(--git)" : "w-1 bg-muted-foreground/30",
              )}
            />
          ))}
        </span>
      </div>

      <div className="relative h-[21rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={scene}
            initial={{ opacity: 0, scale: 0.97, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.02, filter: "blur(10px)" }}
            transition={{ duration: 0.45, ease }}
            className="absolute inset-0 p-5"
          >
            {!visible ? null : scene === 0 ? (
              <StreamScene t={t} />
            ) : scene === 1 ? (
              <CallScene t={t} />
            ) : (
              <WorkspaceScene t={t} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

type T = ReturnType<typeof useT>;

function appear(delay: number) {
  return {
    initial: { opacity: 0, y: 10, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.5, delay, ease },
  };
}

function StreamScene({ t }: { t: T }) {
  return (
    <div className="flex h-full flex-col gap-3 text-[13px]">
      <motion.div {...appear(0.05)} className="ml-auto max-w-[78%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2">
        {t("landing.stageAsk")}
      </motion.div>
      <motion.div {...appear(0.35)} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <BrainIcon className="size-3.5 motion-safe:animate-pulse text-(--git-hot)" />
        {t("landing.stageThinking")}
      </motion.div>
      <motion.div
        {...appear(0.7)}
        className="flex w-fit items-center gap-2 rounded-lg border bg-background/60 px-2.5 py-1 font-mono text-[11px]"
      >
        <WrenchIcon className="size-3 text-muted-foreground" />
        read_file <span className="text-muted-foreground">TODO.md</span>
        <CheckIcon className="size-3 text-emerald-500" />
      </motion.div>
      <div className="space-y-2 pt-1">
        {[94, 82, 58].map((width, index) => (
          <motion.span
            key={width}
            className="block h-2 rounded-full bg-muted-foreground/20"
            initial={{ width: "0%" }}
            animate={{ width: `${width}%` }}
            transition={{ duration: 0.9, delay: 1 + index * 0.35, ease }}
          />
        ))}
      </div>
      <motion.div {...appear(2.3)} className="mt-auto ml-auto flex max-w-[82%] flex-col items-end gap-1">
        <span className="rounded-md bg-(--git)/12 px-1.5 py-0.5 font-mono text-[10px] text-(--git-hot)">
          {t("landing.stageSteer")}
        </span>
        <span className="rounded-2xl rounded-br-md border border-(--git)/30 bg-(--git)/8 px-3.5 py-2">
          {t("landing.stageInterject")}
        </span>
      </motion.div>
      <motion.div {...appear(2.9)} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckIcon className="size-3.5 text-(--git-hot)" />
        {t("landing.stageNoted")}
      </motion.div>
    </div>
  );
}

function CallScene({ t }: { t: T }) {
  const [seconds, setSeconds] = React.useState(12);
  React.useEffect(() => {
    const id = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = `00:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="relative flex size-24 items-center justify-center">
        {[0, 1, 2].map((ring) => (
          <motion.span
            key={ring}
            className="absolute inset-0 rounded-full border border-(--git)/50"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, delay: ring * 0.8, ease: "easeOut" }}
          />
        ))}
        <span className="relative flex size-16 items-center justify-center rounded-full bg-linear-to-b from-(--git-hot) to-(--git) shadow-[0_0_40px_var(--git-glow)]">
          <MicIcon className="size-6 text-white" />
        </span>
      </div>

      <div className="flex h-10 items-center gap-[3px]">
        {Array.from({ length: 28 }, (_, index) => {
          const peak = 0.25 + Math.abs(Math.sin(index * 1.7)) * 0.75;
          return (
            <motion.span
              key={index}
              className="w-[3px] rounded-full bg-(--git-hot)"
              animate={{ height: ["18%", `${peak * 100}%`, "30%", `${peak * 70}%`, "18%"] }}
              transition={{ duration: 1.2 + (index % 5) * 0.12, repeat: Infinity, ease: "easeInOut", delay: index * 0.04 }}
            />
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium">{t("landing.stageListening")}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{clock}</span>
      </div>

      <span className="flex size-10 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40">
        <PhoneOffIcon className="size-4" />
      </span>
    </div>
  );
}

const TREE: { depth: number; name: string; folder?: boolean; hot?: boolean }[] = [
  { depth: 0, name: "smeeware-chat", folder: true },
  { depth: 1, name: "backend", folder: true },
  { depth: 2, name: "run.py" },
  { depth: 1, name: "frontend", folder: true },
  { depth: 2, name: "app/page.tsx", hot: true },
  { depth: 2, name: "components/", folder: true },
  { depth: 1, name: "README.md", hot: true },
  { depth: 1, name: "start.sh", hot: true },
];

function WorkspaceScene({ t }: { t: T }) {
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 font-mono text-[12px]">
        <motion.span
          aria-hidden
          className="absolute inset-x-0 h-7 rounded-md bg-(--git)/10 ring-1 ring-(--git)/25"
          initial={{ top: 0 }}
          animate={{ top: [4 * 28, 6 * 28, 7 * 28, 4 * 28] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
        />
        {TREE.map((item, index) => {
          const Icon = item.folder ? FolderIcon : item.name.endsWith(".md") ? FileTextIcon : FileCodeIcon;
          return (
            <motion.div
              key={item.name}
              {...appear(0.05 + index * 0.07)}
              className="relative flex h-7 items-center gap-2 px-2"
              style={{ paddingLeft: 8 + item.depth * 16 }}
            >
              {item.folder ? (
                <ChevronDownIcon className="size-3 text-muted-foreground" />
              ) : (
                <span className="size-3" />
              )}
              <Icon className={cn("size-3.5", item.hot ? "text-(--git-hot)" : "text-muted-foreground")} />
              <span className={item.hot ? "text-foreground" : "text-muted-foreground"}>{item.name}</span>
              {item.hot ? (
                <span className="ml-auto size-1.5 rounded-full bg-(--git-hot) shadow-[0_0_8px_var(--git-glow)]" />
              ) : null}
            </motion.div>
          );
        })}
      </div>
      <motion.div
        {...appear(0.9)}
        className="flex items-center gap-2 rounded-xl border bg-background/60 px-3 py-2 text-xs text-muted-foreground"
      >
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {t("landing.stageContext")}
      </motion.div>
    </div>
  );
}
