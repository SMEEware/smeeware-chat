"use client";

import * as React from "react";
import { LockIcon } from "lucide-react";
import { motion, useTransform, type MotionValue } from "motion/react";

import { useLitCount } from "@/components/site/timeline/git-context";
import { LaserBurn } from "@/components/site/timeline/laser-burn";
import {
  buildTrace,
  xAt,
  type GitKind,
  type GitLayout,
  type GitPathSpec,
  type GitTrace,
} from "@/components/site/timeline/git-engine";
import { cn } from "@/lib/utils";

const BLEED = 48;

export function GitGraph({
  layout,
  paths,
  litY,
  animated,
}: {
  layout: GitLayout;
  paths: GitPathSpec[];
  litY: MotionValue<number>;
  animated: boolean;
}) {
  const traces = React.useMemo(
    () =>
      paths
        .map((spec) => buildTrace(spec, layout))
        .filter((trace): trace is GitTrace => trace !== null),
    [paths, layout],
  );

  const nodes = React.useMemo(
    () =>
      Object.entries(layout.points)
        .map(([id, point]) => ({ id, ...point }))
        .sort((a, b) => a.y - b.y),
    [layout],
  );
  const nodeYs = React.useMemo(() => nodes.map((node) => node.y), [nodes]);
  const burnNodes = React.useMemo(
    () => nodes.filter((node) => node.kind !== "pass" && node.kind !== "root"),
    [nodes],
  );
  const litCount = useLitCount(nodeYs);
  const lit = animated ? litCount : nodes.length;

  const host = React.useRef<HTMLDivElement>(null);
  const comets = React.useMemo(() => traces.filter((trace) => trace.comet), [traces]);
  const width = layout.width + BLEED * 2;
  const height = layout.height;
  const outerY = useTransform(litY, (y) => Math.min(0, y - height));
  const innerY = useTransform(litY, (y) => Math.max(0, height - y));

  const canvas = (children: React.ReactNode) => (
    <svg
      width={width}
      height={height}
      viewBox={`${-BLEED} 0 ${width} ${height}`}
      className="block"
    >
      {children}
    </svg>
  );

  return (
    <>
      <div
        ref={host}
        aria-hidden
        className="pointer-events-none absolute top-0 z-0"
        style={{ left: -BLEED, width, height }}
      >
        <div className="absolute inset-0">
          {canvas(
            traces.map((trace) => (
              <path
                key={trace.id}
                d={trace.d}
                fill="none"
                stroke="var(--git-track)"
                strokeWidth={trace.tone === "ghost" ? 1 : 1.5}
                strokeDasharray={trace.tone === "ghost" ? "2 6" : undefined}
                strokeLinecap="round"
              />
            )),
          )}
        </div>

        <motion.div
          className="absolute inset-x-0 top-0 overflow-hidden"
          style={{ height, y: animated ? outerY : 0 }}
        >
          <motion.div style={{ y: animated ? innerY : 0 }}>
            {canvas(
              traces.map((trace) => (
                <g key={trace.id} fill="none" strokeLinecap="round">
                  {trace.tone === "main" ? (
                    <>
                      <path d={trace.d} stroke="var(--git)" strokeOpacity={0.08} strokeWidth={18} />
                      <path d={trace.d} stroke="var(--git)" strokeOpacity={0.22} strokeWidth={6} />
                      <path d={trace.d} stroke="var(--git-hot)" strokeWidth={1.8} />
                    </>
                  ) : (
                    <path
                      d={trace.d}
                      stroke="var(--git)"
                      strokeOpacity={0.55}
                      strokeWidth={1.2}
                      strokeDasharray="2 6"
                    />
                  )}
                </g>
              )),
            )}
          </motion.div>
        </motion.div>

        {animated
          ? comets.map((trace) => (
              <Comet key={trace.id} trace={trace} litY={litY} />
            ))
          : null}
      </div>

      {animated ? (
        <LaserBurn traces={comets} nodes={burnNodes} litY={litY} host={host} bleed={BLEED} />
      ) : null}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
      >
        {nodes.map((node, index) => (
          <GitNode
            key={node.id}
            kind={node.kind}
            x={node.x}
            y={node.y}
            lit={index < lit}
          />
        ))}
      </div>
    </>
  );
}

function Comet({ trace, litY }: { trace: GitTrace; litY: MotionValue<number> }) {
  const x = useTransform(litY, (y) => xAt(trace.samples, y) + BLEED);
  const y = useTransform(litY, (v) => Math.min(Math.max(v, trace.start), trace.end));
  const opacity = useTransform(
    litY,
    [trace.start - 40, trace.start + 12, trace.end - 12, trace.end + 80],
    [0, 1, 1, 0],
  );

  return (
    <motion.div className="absolute top-0 left-0" style={{ x, y, opacity }}>
      <span className="absolute size-14 -translate-1/2 rounded-full bg-[radial-gradient(circle,var(--git-glow)_0%,transparent_65%)] opacity-80" />
      <span className="absolute size-2 -translate-1/2 rounded-full bg-white shadow-[0_0_6px_2px_var(--git),0_0_14px_3px_var(--git-glow)]" />
    </motion.div>
  );
}

const nodeSize: Record<GitKind, string> = {
  root: "size-3",
  commit: "size-3",
  fork: "size-3.5",
  merge: "size-3",
  tag: "size-3",
  lock: "size-9",
  head: "size-4",
  card: "size-2.5",
  pass: "size-0",
};

function GitNode({
  kind,
  x,
  y,
  lit,
}: {
  kind: GitKind;
  x: number;
  y: number;
  lit: boolean;
}) {
  if (kind === "pass") return null;
  return (
    <span
      className="absolute -translate-1/2"
      style={{ left: x, top: y }}
    >
      {lit && kind !== "card" && kind !== "root" ? (
        <span
          className={cn(
            "git-node-burst absolute top-1/2 left-1/2 -translate-1/2 rounded-full border border-(--git)",
            kind === "lock" ? "size-14" : "size-8",
          )}
        />
      ) : null}

      <span
        className={cn(
          "relative flex items-center justify-center border-[1.5px] bg-background transition-[border-color,box-shadow,background-color,color] duration-500",
          nodeSize[kind],
          kind === "tag" ? "rotate-45 rounded-[3px]" : "rounded-full",
          lit
            ? "border-(--git) text-(--git-hot) shadow-[0_0_0_4px_color-mix(in_oklab,var(--git)_14%,transparent),0_0_18px_2px_var(--git-glow)]"
            : "border-(--git-track-strong) text-muted-foreground",
          kind === "merge" && "ring-[1.5px] ring-offset-2 ring-offset-background",
          kind === "merge" && (lit ? "ring-(--git)/45" : "ring-(--git-track)"),
          kind === "head" && lit && "bg-(--git)",
        )}
      >
        {kind === "lock" ? <LockIcon className="size-4" /> : null}
        {kind === "commit" || kind === "fork" || kind === "root" ? (
          <span
            className={cn(
              "size-1 rounded-full transition-colors duration-500",
              lit ? "bg-(--git-hot)" : "bg-transparent",
            )}
          />
        ) : null}
        {kind === "head" && lit ? (
          <span className="absolute inset-0 motion-safe:animate-ping rounded-full bg-(--git) opacity-40" />
        ) : null}
      </span>
    </span>
  );
}
