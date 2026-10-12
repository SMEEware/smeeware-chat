"use client";

import * as React from "react";
import type { MotionValue } from "motion/react";

import {
  countBelow,
  type GitKind,
  type GitLayout,
  type GitPoint,
} from "@/components/site/timeline/git-engine";
import { cn } from "@/lib/utils";

type GitState = {
  layout: GitLayout | null;
  litY: MotionValue<number>;
  animated: boolean;
};

export const GitContext = React.createContext<GitState | null>(null);

function useGit(): GitState {
  const value = React.useContext(GitContext);
  if (!value) throw new Error("Git timeline parts need <LandingTimeline>");
  return value;
}

export function useLitValue<T>(read: (y: number) => T, fallback: T): T {
  const { litY } = useGit();
  const subscribe = React.useCallback(
    (notify: () => void) => litY.on("change", notify),
    [litY],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => read(litY.get()),
    () => fallback,
  );
}

export function useGitPoint(id: string): GitPoint | undefined {
  return useGit().layout?.points[id];
}

export function useGitLit(id: string): boolean {
  const { animated } = useGit();
  const point = useGitPoint(id);
  const lit = useLitValue((y) => (point ? y >= point.y - 6 : false), false);
  return !animated || lit;
}

export function useLitCount(sorted: number[]): number {
  return useLitValue((y) => countBelow(sorted, y + 6), 0);
}

export function useGitLayout(ref: React.RefObject<HTMLElement | null>) {
  const [layout, setLayout] = React.useState<GitLayout | null>(null);

  React.useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = root.getBoundingClientRect();
        const points: Record<string, GitPoint> = {};
        root.querySelectorAll<HTMLElement>("[data-git]").forEach((node) => {
          if (node.getClientRects().length === 0) return;
          const rect = node.getBoundingClientRect();
          points[node.dataset.git as string] = {
            x: rect.left + rect.width / 2 - box.left,
            y: rect.top + rect.height / 2 - box.top,
            kind: (node.dataset.kind as GitKind) ?? "commit",
          };
        });
        setLayout({ width: box.width, height: box.height, points });
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref]);

  return layout;
}

const laneOffset = {
  0: "left-[calc(var(--lane-0)-var(--rail))]",
  1: "left-[calc(var(--lane-1)-var(--rail))]",
  2: "left-[calc(var(--lane-2)-var(--rail))]",
} as const;

export function GitAnchor({
  id,
  kind,
  lane,
  className,
  style,
}: {
  id: string;
  kind: GitKind;
  lane?: 0 | 1 | 2;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      data-git={id}
      data-kind={kind}
      style={style}
      className={cn(
        "pointer-events-none absolute block size-0",
        lane !== undefined && laneOffset[lane],
        className,
      )}
    />
  );
}
