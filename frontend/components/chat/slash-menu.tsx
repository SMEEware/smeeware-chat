"use client";

import * as React from "react";
import { CornerDownLeftIcon } from "lucide-react";

import { groupCommands } from "@/lib/chat/command-registry";
import type { CommandEntry } from "@/lib/chat/command-registry";
import { cn } from "@/lib/utils";

export function SlashMenu({
  items,
  selectedIndex,
  onSelect,
  onHover,
}: {
  items: CommandEntry[];
  selectedIndex: number;
  onSelect: (command: CommandEntry) => void;
  onHover: (index: number) => void;
}) {
  const grouped = groupCommands(items);
  const flatIndex = new Map(items.map((command, index) => [command.id, index]));

  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm origin-bottom-left overflow-hidden rounded-2xl border border-border/70 bg-popover/95 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
    >
      {items.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground/70">
          No matching command.
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          {grouped.map(({ group, commands }) => {
            const GroupIcon = group.icon;
            return (
              <div key={group.id} className="mb-1 last:mb-0">
                <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  <GroupIcon className="size-3" />
                  {group.label}
                </p>
                <ul>
                  {commands.map((command) => {
                    const Icon = command.icon;
                    const selected =
                      flatIndex.get(command.id) === selectedIndex;
                    return (
                      <li key={command.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            onSelect(command);
                          }}
                          onMouseEnter={() =>
                            onHover(flatIndex.get(command.id)!)
                          }
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                            selected ? "bg-primary/10" : "hover:bg-muted/60",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                              selected
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            <Icon className="size-4" />
                          </span>

                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium text-foreground">
                              {command.label}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              <span className="font-mono">
                                /{command.trigger}
                              </span>
                              {command.description
                                ? ` · ${command.description}`
                                : null}
                            </span>
                          </span>

                          {command.kind === "generate" ? (
                            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                              template
                            </span>
                          ) : command.shortcut ? (
                            <span className="flex shrink-0 items-center gap-0.5">
                              {command.shortcut.map((taste) => (
                                <kbd
                                  key={taste}
                                  className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted-foreground ring-1 ring-border/70 ring-inset"
                                >
                                  {taste}
                                </kbd>
                              ))}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-1 flex items-center gap-3 border-t border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground/60">
        <span className="inline-flex items-center gap-1">↑↓ navigate</span>
        <span className="inline-flex items-center gap-1">
          <CornerDownLeftIcon className="size-3" /> run
        </span>
        <span>esc close</span>
      </div>
    </div>
  );
}
