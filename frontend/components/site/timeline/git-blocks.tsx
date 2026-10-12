"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon, GitBranchIcon, GitMergeIcon, TagIcon } from "lucide-react";

import { GitAnchor, useGitLit } from "@/components/site/timeline/git-context";
import type { GitKind } from "@/components/site/timeline/git-engine";
import { cn } from "@/lib/utils";

export type GitRef = { kind: "branch" | "tag" | "head" | "merge"; name: string };

export function Row({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={cn("relative ml-(--rail)", className)}>
      {children}
    </div>
  );
}

export function Lit({
  anchor,
  children,
  className,
}: {
  anchor: string;
  children: React.ReactNode;
  className?: string;
}) {
  const lit = useGitLit(anchor);
  return (
    <div
      className={cn(
        "transition-[opacity,translate,filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
        lit ? "opacity-100" : "translate-y-2 opacity-35 saturate-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

const refIcon = {
  branch: GitBranchIcon,
  tag: TagIcon,
  head: GitBranchIcon,
  merge: GitMergeIcon,
};

export function RefPill({ gitRef, lit }: { gitRef: GitRef; lit?: boolean }) {
  const Icon = refIcon[gitRef.kind];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md border px-1.5 font-mono text-[11px] leading-none whitespace-nowrap transition-colors duration-500",
        lit
          ? "border-(--git)/35 bg-(--git)/10 text-(--git-hot)"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      {gitRef.kind === "head" ? (
        <>
          HEAD <span className="opacity-60">→</span> {gitRef.name}
        </>
      ) : gitRef.kind === "tag" ? (
        <>tag: {gitRef.name}</>
      ) : (
        gitRef.name
      )}
    </span>
  );
}

function Hash({ value, lit }: { value: string; lit: boolean }) {
  return (
    <span
      className={cn(
        "font-mono text-xs transition-colors duration-500",
        lit ? "text-(--git-hot)" : "text-muted-foreground/60",
      )}
    >
      {value}
    </span>
  );
}

export function ChapterHead({
  anchor,
  kind,
  hash,
  gitRef,
  title,
  lead,
  aside,
  className,
  children,
}: {
  anchor: string;
  kind: GitKind;
  hash: string;
  gitRef?: GitRef;
  title: React.ReactNode;
  lead?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const lit = useGitLit(anchor);
  const body = (
    <div className="relative min-w-0">
      <GitAnchor id={anchor} kind={kind} lane={0} className="top-3" />
      <Lit anchor={anchor}>
        <span className="flex h-6 items-center gap-2">
          <Hash value={hash} lit={lit} />
          {gitRef ? <RefPill gitRef={gitRef} lit={lit} /> : null}
        </span>
        <h2 className="mt-4 max-w-2xl font-heading text-[1.75rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl md:text-[2.75rem]">
          {title}
        </h2>
        {lead ? (
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-pretty text-muted-foreground sm:text-base">
            {lead}
          </p>
        ) : null}
        {children}
      </Lit>
    </div>
  );

  return (
    <Row className={cn("pt-24 md:pt-32", className)}>
      {aside ? (
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-14">
          {body}
          <div className="min-w-0">{aside}</div>
        </div>
      ) : (
        body
      )}
    </Row>
  );
}

export function CommitRow({
  anchor,
  lane = 1,
  hash,
  title,
  text,
  href,
  linkLabel,
  children,
  className,
}: {
  anchor: string;
  lane?: 0 | 1 | 2;
  hash: string;
  title: React.ReactNode;
  text?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const lit = useGitLit(anchor);
  return (
    <div className={cn("pt-9", className)}>
      <div className="relative">
        <GitAnchor id={anchor} kind="commit" lane={lane} className="top-3" />
        <Lit anchor={anchor}>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3">
            <Hash value={hash} lit={lit} />
            <span className="text-[15px] leading-6 font-medium text-foreground sm:text-base">
              {title}
            </span>
            <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
              {text ? (
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground sm:text-[15px]">
                  {text}
                </p>
              ) : null}
              {href && linkLabel ? (
                <Link
                  href={href}
                  className="group/link mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-primary-text"
                >
                  {linkLabel}
                  <ArrowRightIcon className="size-3.5 transition-transform group-hover/link:translate-x-0.5" />
                </Link>
              ) : null}
              {children}
            </div>
          </div>
        </Lit>
      </div>
    </div>
  );
}

export function MergeRow({
  anchor,
  label,
  className,
}: {
  anchor: string;
  label: React.ReactNode;
  className?: string;
}) {
  const lit = useGitLit(anchor);
  return (
    <div className={cn("pt-10", className)}>
      <div className="relative">
        <GitAnchor id={anchor} kind="merge" lane={0} className="top-3" />
        <Lit anchor={anchor}>
          <span
            className={cn(
              "flex h-6 items-center gap-2 font-mono text-xs transition-colors duration-500",
              lit ? "text-muted-foreground" : "text-muted-foreground/60",
            )}
          >
            <GitMergeIcon className={cn("size-3.5", lit && "text-(--git-hot)")} />
            {label}
          </span>
        </Lit>
      </div>
    </div>
  );
}
