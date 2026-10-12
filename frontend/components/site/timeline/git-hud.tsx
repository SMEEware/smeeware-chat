"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { GitBranchIcon } from "lucide-react";

import { useLitValue } from "@/components/site/timeline/git-context";
import { countBelow, type GitLayout } from "@/components/site/timeline/git-engine";
import { useT } from "@/context/i18n-provider";
import { cn } from "@/lib/utils";

export type GitChapter = { anchor: string; refName: string; label: string };

export function GitHud({
  chapters,
  layout,
  onJump,
}: {
  chapters: GitChapter[];
  layout: GitLayout;
  onJump: (anchor: string) => void;
}) {
  const t = useT();
  const ys = React.useMemo(
    () => chapters.map((chapter) => layout.points[chapter.anchor]?.y ?? Infinity),
    [chapters, layout],
  );
  const first = ys[0] ?? 0;
  const last = Math.max(...ys.filter(Number.isFinite), 0);

  const state = useLitValue((y) => {
    if (y < first - 24 || y > last + 220) return -1;
    return Math.max(0, countBelow(ys, y + 40) - 1);
  }, -1);

  const active = chapters[Math.max(0, state)];

  return (
    <AnimatePresence>
      {state >= 0 ? (
        <motion.nav
          key="hud"
          aria-label={t("landing.hudLabel")}
          initial={{ opacity: 0, y: 24, scale: 0.94, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 24, scale: 0.94, filter: "blur(8px)" }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2"
        >
          <div className="flex items-center gap-3 rounded-full border bg-background/75 py-1.5 pr-2 pl-3 shadow-2xl shadow-black/25 ring-1 ring-white/5 backdrop-blur-xl">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <GitBranchIcon className="size-3.5 text-(--git)" />
              <span className="relative flex h-4 min-w-[5.5rem] items-center overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={active.refName}
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="whitespace-nowrap text-foreground"
                  >
                    {active.refName}
                  </motion.span>
                </AnimatePresence>
              </span>
            </span>

            <span className="h-4 w-px bg-border" />

            <span className="flex items-center">
              {chapters.map((chapter, index) => (
                <button
                  key={chapter.anchor}
                  type="button"
                  title={chapter.label}
                  aria-label={chapter.label}
                  aria-current={index === state ? "step" : undefined}
                  onClick={() => onJump(chapter.anchor)}
                  className="group/dot flex h-7 cursor-pointer items-center justify-center px-[5px]"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      index === state
                        ? "w-5 bg-(--git) shadow-[0_0_10px_var(--git-glow)]"
                        : index < state
                          ? "w-1.5 bg-(--git)/55 group-hover/dot:bg-(--git)"
                          : "w-1.5 bg-muted-foreground/30 group-hover/dot:bg-muted-foreground/70",
                    )}
                  />
                </button>
              ))}
            </span>
          </div>
        </motion.nav>
      ) : null}
    </AnimatePresence>
  );
}
