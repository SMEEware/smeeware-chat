"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  CheckIcon,
  CpuIcon,
  FolderGit2Icon,
  HistoryIcon,
  MessageSquareIcon,
  MicIcon,
  Volume2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { activeChatId } from "@/components/chat/chat-sidebar";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useChats, useNewChat } from "@/hooks/use-chats";
import { useModels } from "@/hooks/use-models";
import { usePrompts } from "@/hooks/use-prompts";
import { useSttModels } from "@/hooks/use-stt-models";
import { useTtsModels } from "@/hooks/use-tts-models";
import {
  COMMAND_EVENT,
  dispatchInsert,
  isShortcut,
  onCommand,
  onNavigate,
} from "@/lib/chat/commands";
import {
  commandGroups,
  commandsFor,
  dynamicGroups,
  runCommand,
} from "@/lib/chat/command-registry";
import type { CommandEntry } from "@/lib/chat/command-registry";
import { stripToolScaffolding } from "@/lib/chat/sanitize";
import { useModelOverride } from "@/lib/chat/model-store";
import { promptLabel, useSettings } from "@/lib/settings/store";
import { selectActiveWorkspace, useWorkspaces } from "@/lib/workspaces/store";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";

export function ChatCommand() {
  const t = useT();
  const groups = commandGroups(t);
  const dynamic = dynamicGroups(t);
  const router = useRouter();
  const pathname = usePathname();
  const currentChat = activeChatId(pathname);
  const { data: chats } = useChats();
  const { data: prompts } = usePrompts();
  const newChat = useNewChat();
  const { resolvedTheme, setTheme } = useTheme();

  const settings = useSettings();
  const activePrompt = settings.prompt;

  const workspaces = useWorkspaces((z) => z.workspaces);
  const activeWorkspace = useWorkspaces(selectActiveWorkspace);
  const setActiveWorkspace = useWorkspaces((z) => z.setActive);
  const setPrompt = settings.setPrompt;

  const { data: modelList } = useModels();
  const { data: sttList } = useSttModels();
  const { data: ttsList } = useTtsModels();
  const caps = useCapabilities();
  const answerModel = useModelOverride((z) => z.model);
  const setAnswerModel = useModelOverride((z) => z.setModel);

  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isShortcut(event, "k")) {
        event.preventDefault();
        setOpen((previous) => !previous);
        return;
      }
      if (isShortcut(event, "j")) {
        event.preventDefault();
        setOpen(false);
        newChat();
      }
    };

    window.addEventListener("keydown", onKey);
    const unsub = onCommand(COMMAND_EVENT.palette, () => setOpen(true));
    const unsubNew = onCommand(COMMAND_EVENT.newChat, () => {
      setOpen(false);
      newChat();
    });
    const unsubDocs = onCommand(COMMAND_EVENT.docs, () => {
      setOpen(false);
      router.push("/docs");
    });
    const unsubTheme = onCommand(COMMAND_EVENT.themeToggle, () => {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    });
    const unsubNav = onNavigate((href) => {
      setOpen(false);
      router.push(href);
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      unsub();
      unsubNew();
      unsubDocs();
      unsubTheme();
      unsubNav();
    };
  }, [newChat, router, resolvedTheme, setTheme]);

  const jump = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const execute = (command: CommandEntry) => {
    if (command.status === "soon") return;
    setOpen(false);
    runCommand(command);
  };

  const paletteItems = commandsFor(t, "palette", caps);

  const answerActive = answerModel ?? modelList?.default ?? "";
  const sttActive = settings.transcribeModel ?? sttList?.default ?? "";
  const ttsActive = settings.ttsModel ?? ttsList?.default ?? "";

  const referenceChat = async (id: string, title: string) => {
    setOpen(false);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const detail = (await res.json()) as {
        messages?: { role: string; content: string }[];
      };
      const lines = (detail.messages ?? [])
        .map((m) => {
          const speaker = m.role === "user" ? "User" : "Assistant";
          const text =
            m.role === "assistant"
              ? stripToolScaffolding(m.content)
              : m.content;
          return `${speaker}: ${text}`;
        })
        .join("\n\n");
      const block = `[referenced chat: ${title}]\n${lines}`.slice(0, 6000);
      dispatchInsert(block);
      toast.success(t("chat.referencedToast", { title }));
    } catch {
      toast.error(t("chat.referenceLoadError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        aria-label={t("chat.commandPalette")}
      >
        <Command
          className="bg-transparent"
        >
          <CommandInput placeholder={t("chat.searchPlaceholder")} />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>{t("chat.nothingMatches")}</CommandEmpty>

            {groups.map((group) => {
              const items = paletteItems.filter((c) => c.group === group.id);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={group.id} heading={group.label}>
                  {items.map((command) => (
                    <CatalogRow
                      key={command.id}
                      command={command}
                      t={t}
                      isOn={
                        command.kind === "toggle"
                          ? settings[command.setting]
                          : undefined
                      }
                      onSelect={() => execute(command)}
                    />
                  ))}
                </CommandGroup>
              );
            })}

            {workspaces.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={dynamic.workspaces.label}>
                  {workspaces.map((ws) => {
                    const active = ws.id === activeWorkspace?.id;
                    return (
                      <CommandItem
                        key={ws.id}
                        value={`workspace ${ws.name} ${ws.path} ${ws.id}`}
                        onSelect={() => {
                          setOpen(false);
                          setActiveWorkspace(ws.id);
                        }}
                      >
                        <FolderGit2Icon
                          className={active ? "text-primary" : undefined}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{ws.name}</span>
                          {ws.path ? (
                            <span className="truncate text-xs text-muted-foreground/70">
                              {ws.path}
                            </span>
                          ) : null}
                        </span>
                        {active ? (
                          <CheckIcon className="size-4 text-primary" />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            ) : null}

            {prompts && prompts.prompts.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={dynamic.personas.label}>
                  <CommandItem
                    value="persona default backend"
                    onSelect={() => {
                      setOpen(false);
                      setPrompt(null);
                    }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{t("chat.defaultPersona")}</span>
                      <span className="truncate text-xs text-muted-foreground/70">
                        {t("chat.defaultPersonaSub")}
                      </span>
                    </span>
                    {activePrompt === null ? (
                      <CheckIcon className="size-4 text-primary" />
                    ) : null}
                  </CommandItem>
                  {prompts.prompts.map((p) => {
                    const active = activePrompt === p.name;
                    return (
                      <CommandItem
                        key={p.name}
                        value={`persona ${p.title} ${p.name}`}
                        onSelect={() => {
                          setOpen(false);
                          setPrompt(p.name);
                        }}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">
                            {promptLabel(p.name)}
                          </span>
                          <span className="truncate text-xs text-muted-foreground/70">
                            {p.title}
                          </span>
                        </span>
                        {active ? (
                          <CheckIcon className="size-4 text-primary" />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            ) : null}

            {modelList && modelList.models.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={dynamic["answer-model"].label}>
                  {modelList.models.map((m) => (
                    <ModelRow
                      key={m.id}
                      kind="answer"
                      id={m.id}
                      name={m.name}
                      subtitle={`${m.group} · ${m.description}`}
                      active={m.id === answerActive}
                      icon={CpuIcon}
                      onSelect={() => {
                        setOpen(false);
                        setAnswerModel(m.id);
                        toast.success(t("chat.answeringWith", { name: m.name }));
                      }}
                    />
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {sttList && sttList.models.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={dynamic["transcribe-model"].label}>
                  {sttList.models.map((m) => (
                    <ModelRow
                      key={m.id}
                      kind="transcription"
                      id={m.id}
                      name={m.name}
                      subtitle={`${m.group} · ${m.description}`}
                      active={m.id === sttActive}
                      icon={MicIcon}
                      onSelect={() => {
                        setOpen(false);
                        settings.setTranscribeModel(m.id);
                        toast.success(t("chat.transcribingWith", { name: m.name }));
                      }}
                    />
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {ttsList && ttsList.models.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={dynamic["tts-model"].label}>
                  {ttsList.models.map((m) => (
                    <ModelRow
                      key={m.id}
                      kind="read aloud voice tts"
                      id={m.id}
                      name={m.name}
                      subtitle={`${m.group} · ${m.description}`}
                      active={m.id === ttsActive}
                      icon={Volume2Icon}
                      onSelect={() => {
                        setOpen(false);
                        settings.setTtsModel(m.id);
                        toast.success(t("chat.readingAloudWith", { name: m.name }));
                      }}
                    />
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {chats && chats.filter((c) => c.id !== currentChat).length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={dynamic["reference-chat"].label}>
                  {chats
                    .filter((c) => c.id !== currentChat)
                    .slice(0, 8)
                    .map((chat) => (
                      <CommandItem
                        key={chat.id}
                        value={`reference chat context ${chat.title} ${chat.id}`}
                        onSelect={() => void referenceChat(chat.id, chat.title)}
                      >
                        <HistoryIcon className="text-muted-foreground" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{chat.title}</span>
                          <span className="truncate text-xs text-muted-foreground/70">
                            {t("chat.referenceSub")}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </>
            ) : null}

            {chats && chats.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={dynamic.chats.label}>
                  {chats.map((chat) => (
                    <CommandItem
                      key={chat.id}
                      value={`chat ${chat.title} ${chat.id}`}
                      onSelect={() => jump(`/chat/${chat.id}`)}
                    >
                      <MessageSquareIcon className="text-muted-foreground" />
                      <span className="truncate">{chat.title}</span>
                      <CommandShortcut
                        aria-label={t("chat.messagesCount", {
                          count: chat.message_count,
                        })}
                        className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-normal tracking-wide tabular-nums ring-1 ring-border/70 ring-inset group-data-selected/command-item:ring-border"
                      >
                        {chat.message_count}
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CatalogRow({
  command,
  t,
  isOn,
  onSelect,
}: {
  command: CommandEntry;
  t: TranslateFn;
  isOn?: boolean;
  onSelect: () => void;
}) {
  const Icon = command.icon;
  const soon = command.status === "soon";
  const value = [
    command.label,
    command.trigger,
    command.description,
    command.keywords,
    command.id,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <CommandItem
      value={value}
      disabled={soon}
      onSelect={onSelect}
      className={cn(soon && "opacity-60")}
    >
      <Icon className={cn(isOn && "text-primary")} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{command.label}</span>
        {command.description ? (
          <span className="truncate text-xs text-muted-foreground/70">
            {command.description}
          </span>
        ) : null}
      </span>

      {soon ? (
        <Badge
          variant="secondary"
          className="shrink-0 rounded-md px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
        >
          {t("chat.badgeSoon")}
        </Badge>
      ) : command.kind === "toggle" ? (
        <CommandShortcut
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
            isOn
              ? "bg-primary/10 text-primary ring-primary/30"
              : "text-muted-foreground/60 ring-border/70",
          )}
        >
          {isOn ? t("chat.on") : t("chat.off")}
        </CommandShortcut>
      ) : command.kind === "generate" ? (
        <Badge
          variant="secondary"
          className="shrink-0 rounded-md px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
        >
          {t("chat.badgeTemplate")}
        </Badge>
      ) : command.shortcut ? (
        <span className="flex shrink-0 items-center gap-0.5">
          {command.shortcut.map((key) => (
            <kbd
              key={key}
              className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted-foreground ring-1 ring-border/70 ring-inset"
            >
              {key}
            </kbd>
          ))}
        </span>
      ) : null}
    </CommandItem>
  );
}

function ModelRow({
  kind,
  id,
  name,
  subtitle,
  active,
  icon: Icon,
  onSelect,
}: {
  kind: string;
  id: string;
  name: string;
  subtitle: string;
  active: boolean;
  icon: LucideIcon;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={`${kind} model ${name} ${id}`} onSelect={onSelect}>
      <Icon className={active ? "text-primary" : "text-muted-foreground"} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{name}</span>
        <span className="truncate text-xs text-muted-foreground/70">
          {subtitle}
        </span>
      </span>
      {active ? <CheckIcon className="size-4 text-primary" /> : null}
    </CommandItem>
  );
}
