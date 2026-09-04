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
import { useChats, useNewChat } from "@/hooks/use-chats";
import { useModels } from "@/hooks/use-models";
import { usePrompts } from "@/hooks/use-prompts";
import { useSttModels } from "@/hooks/use-stt-models";
import { useTtsModels } from "@/hooks/use-tts-models";
import {
  BEFEHL,
  dispatchInsert,
  istKuerzel,
  onBefehl,
  onNavigate,
} from "@/lib/chat/commands";
import {
  COMMAND_GROUPS,
  commandsFor,
  runCommand,
} from "@/lib/chat/command-registry";
import type { CommandEntry } from "@/lib/chat/command-registry";
import { stripToolScaffolding } from "@/lib/chat/sanitize";
import { useModelOverride } from "@/lib/chat/model-store";
import { promptLabel, useSettings } from "@/lib/settings/store";
import { aktiverWorkspace, useWorkspaces } from "@/lib/workspaces/store";
import { cn } from "@/lib/utils";

/**
 * Die Schnellwahl ueber ``⌘K`` -- ein Fenster auf den ganzen Katalog.
 *
 * Sie liest denselben Katalog wie das Slash-Menue und zeigt zusaetzlich die
 * dynamischen Gruppen: die offenen Chats, die Workspaces, die Personas.
 * Ausgefuehrt wird ueber ``runCommand`` -- die Palette weiss nicht, was ein
 * Kommando tut, nur dass sie es weiterreicht und sich dann schliesst.
 */
export function ChatCommand() {
  const router = useRouter();
  const pathname = usePathname();
  const aktuellerChat = activeChatId(pathname);
  const { data: chats } = useChats();
  const { data: prompts } = usePrompts();
  const neuerChat = useNewChat();
  const { resolvedTheme, setTheme } = useTheme();

  const settings = useSettings();
  const aktivPrompt = settings.prompt;

  const workspaces = useWorkspaces((z) => z.workspaces);
  const aktivWorkspace = useWorkspaces(aktiverWorkspace);
  const workspaceAktivSetzen = useWorkspaces((z) => z.aktivSetzen);
  const promptSetzen = settings.setPrompt;

  // Modelle -- fuer die drei dynamischen Wechsel-Gruppen. Das Antwort-Modell
  // liegt im geteilten Store (Composer liest denselben), die beiden anderen
  // in den Einstellungen.
  const { data: modelList } = useModels();
  const { data: sttList } = useSttModels();
  const { data: ttsList } = useTtsModels();
  const antwortModell = useModelOverride((z) => z.model);
  const antwortModellSetzen = useModelOverride((z) => z.setModel);

  const [offen, setOffen] = React.useState(false);

  React.useEffect(() => {
    const aufTaste = (event: KeyboardEvent) => {
      if (istKuerzel(event, "k")) {
        event.preventDefault();
        setOffen((vorher) => !vorher);
        return;
      }
      if (istKuerzel(event, "j")) {
        event.preventDefault();
        setOffen(false);
        neuerChat();
      }
    };

    window.addEventListener("keydown", aufTaste);
    const ab = onBefehl(BEFEHL.palette, () => setOffen(true));
    // "Neuer Chat" und "Doku" haben keine Composer-Seite -- sie landen hier.
    const abNeu = onBefehl(BEFEHL.newChat, () => {
      setOffen(false);
      neuerChat();
    });
    const abDocs = onBefehl(BEFEHL.docs, () => {
      setOffen(false);
      router.push("/docs");
    });
    // Das Thema kennt nur diese Komponente (sie haelt ``next-themes``), also
    // schaltet sie es auch -- die Palette feuert nur das Signal.
    const abTheme = onBefehl(BEFEHL.themeToggle, () => {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    });
    // "Geh dorthin" -- egal ob aus Palette oder Slash-Menue: hier ist der
    // Router.
    const abNav = onNavigate((href) => {
      setOffen(false);
      router.push(href);
    });
    return () => {
      window.removeEventListener("keydown", aufTaste);
      ab();
      abNeu();
      abDocs();
      abTheme();
      abNav();
    };
  }, [neuerChat, router, resolvedTheme, setTheme]);

  const springen = (href: string) => {
    setOffen(false);
    router.push(href);
  };

  /** Ein Katalog-Kommando ausfuehren -- erst schliessen, dann handeln. */
  const ausfuehren = (command: CommandEntry) => {
    if (command.status === "soon") return;
    setOffen(false);
    runCommand(command);
  };

  const paletteItems = commandsFor("palette");

  const antwortAktiv = antwortModell ?? modelList?.default ?? "";
  const sttAktiv = settings.transcribeModel ?? sttList?.default ?? "";
  const ttsAktiv = settings.ttsModel ?? ttsList?.default ?? "";

  /** Einen anderen Chat als Kontext ins Feld holen -- Verlauf gekuerzt. */
  const referenziereChat = async (id: string, title: string) => {
    setOffen(false);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const detail = (await res.json()) as {
        messages?: { role: string; content: string }[];
      };
      const zeilen = (detail.messages ?? [])
        .map((m) => {
          const wer = m.role === "user" ? "User" : "Assistant";
          const text =
            m.role === "assistant"
              ? stripToolScaffolding(m.content)
              : m.content;
          return `${wer}: ${text}`;
        })
        .join("\n\n");
      // Auf ein handliches Mass kuerzen -- der Verlauf soll die Nachricht
      // nicht sprengen.
      const block = `[referenced chat: ${title}]\n${zeilen}`.slice(0, 6000);
      dispatchInsert(block);
      toast.success(`Referenced “${title}”`);
    } catch {
      toast.error("Could not load that chat.");
    }
  };

  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        aria-label="Command palette"
      >
        <Command
          // Der Katalog bringt seine eigene Sucheordnung mit; cmdk filtert
          // ueber den ``value``, in dem Beschriftung, Ausloese-Wort und
          // Stichworte zusammenstehen.
          className="bg-transparent"
        >
          <CommandInput placeholder="Search commands and chats..." />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>Nothing matches.</CommandEmpty>

            {/* --- Statische Gruppen aus dem Katalog ---------------------- */}
            {COMMAND_GROUPS.map((group) => {
              const items = paletteItems.filter((c) => c.group === group.id);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={group.id} heading={group.label}>
                  {items.map((command) => (
                    <KatalogZeile
                      key={command.id}
                      command={command}
                      istAn={
                        command.kind === "toggle"
                          ? settings[command.setting]
                          : undefined
                      }
                      onSelect={() => ausfuehren(command)}
                    />
                  ))}
                </CommandGroup>
              );
            })}

            {/* --- Workspaces (dynamisch) -------------------------------- */}
            {workspaces.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Switch workspace">
                  {workspaces.map((ws) => {
                    const aktiv = ws.id === aktivWorkspace?.id;
                    return (
                      <CommandItem
                        key={ws.id}
                        value={`workspace ${ws.name} ${ws.pfad} ${ws.id}`}
                        onSelect={() => {
                          setOffen(false);
                          workspaceAktivSetzen(ws.id);
                        }}
                      >
                        <FolderGit2Icon
                          className={aktiv ? "text-primary" : undefined}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{ws.name}</span>
                          {ws.pfad ? (
                            <span className="truncate text-xs text-muted-foreground/70">
                              {ws.pfad}
                            </span>
                          ) : null}
                        </span>
                        {aktiv ? (
                          <CheckIcon className="size-4 text-primary" />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            ) : null}

            {/* --- Personas (dynamisch) ---------------------------------- */}
            {prompts && prompts.prompts.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Switch persona">
                  <CommandItem
                    value="persona default backend"
                    onSelect={() => {
                      setOffen(false);
                      promptSetzen(null);
                    }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">Default</span>
                      <span className="truncate text-xs text-muted-foreground/70">
                        The backend&apos;s own system prompt
                      </span>
                    </span>
                    {aktivPrompt === null ? (
                      <CheckIcon className="size-4 text-primary" />
                    ) : null}
                  </CommandItem>
                  {prompts.prompts.map((p) => {
                    const aktiv = aktivPrompt === p.name;
                    return (
                      <CommandItem
                        key={p.name}
                        value={`persona ${p.title} ${p.name}`}
                        onSelect={() => {
                          setOffen(false);
                          promptSetzen(p.name);
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
                        {aktiv ? (
                          <CheckIcon className="size-4 text-primary" />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            ) : null}

            {/* --- Antwort-Modell (dynamisch) ---------------------------- */}
            {modelList && modelList.models.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Answer model">
                  {modelList.models.map((m) => (
                    <ModellZeile
                      key={m.id}
                      kind="answer"
                      id={m.id}
                      name={m.name}
                      unterzeile={`${m.group} · ${m.description}`}
                      aktiv={m.id === antwortAktiv}
                      icon={CpuIcon}
                      onSelect={() => {
                        setOffen(false);
                        antwortModellSetzen(m.id);
                        toast.success(`Answering with ${m.name}`);
                      }}
                    />
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {/* --- Transkription (dynamisch) ----------------------------- */}
            {sttList && sttList.models.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Transcription model">
                  {sttList.models.map((m) => (
                    <ModellZeile
                      key={m.id}
                      kind="transcription"
                      id={m.id}
                      name={m.name}
                      unterzeile={`${m.group} · ${m.description}`}
                      aktiv={m.id === sttAktiv}
                      icon={MicIcon}
                      onSelect={() => {
                        setOffen(false);
                        settings.setTranscribeModel(m.id);
                        toast.success(`Transcribing with ${m.name}`);
                      }}
                    />
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {/* --- Read-aloud (dynamisch) -------------------------------- */}
            {ttsList && ttsList.models.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Read-aloud model">
                  {ttsList.models.map((m) => (
                    <ModellZeile
                      key={m.id}
                      kind="read aloud voice tts"
                      id={m.id}
                      name={m.name}
                      unterzeile={`${m.group} · ${m.description}`}
                      aktiv={m.id === ttsAktiv}
                      icon={Volume2Icon}
                      onSelect={() => {
                        setOffen(false);
                        settings.setTtsModel(m.id);
                        toast.success(`Reading aloud with ${m.name}`);
                      }}
                    />
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {/* --- Referenz auf einen anderen Chat (dynamisch) ----------- */}
            {chats && chats.filter((c) => c.id !== aktuellerChat).length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Reference a chat">
                  {chats
                    .filter((c) => c.id !== aktuellerChat)
                    .slice(0, 8)
                    .map((chat) => (
                      <CommandItem
                        key={chat.id}
                        value={`reference chat context ${chat.title} ${chat.id}`}
                        onSelect={() => void referenziereChat(chat.id, chat.title)}
                      >
                        <HistoryIcon className="text-muted-foreground" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{chat.title}</span>
                          <span className="truncate text-xs text-muted-foreground/70">
                            Pull its transcript into the message as context
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </>
            ) : null}

            {/* --- Chats (dynamisch) ------------------------------------- */}
            {chats && chats.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Chats">
                  {chats.map((chat) => (
                    <CommandItem
                      key={chat.id}
                      value={`chat ${chat.title} ${chat.id}`}
                      onSelect={() => springen(`/chat/${chat.id}`)}
                    >
                      <MessageSquareIcon className="text-muted-foreground" />
                      <span className="truncate">{chat.title}</span>
                      <CommandShortcut
                        aria-label={`${chat.message_count} messages`}
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

/**
 * Eine Zeile fuer ein Katalog-Kommando -- Symbol, Beschriftung samt
 * Kurztext und rechts die passende Beigabe: Kuerzel, Schalterstand, ein
 * "Soon"-Merker oder das Vorlagen-Zeichen.
 */
function KatalogZeile({
  command,
  istAn,
  onSelect,
}: {
  command: CommandEntry;
  /** Nur bei Schaltern gesetzt. */
  istAn?: boolean;
  onSelect: () => void;
}) {
  const Icon = command.icon;
  const soon = command.status === "soon";
  const value = [
    command.label,
    command.trigger,
    command.description,
    ...(command.keywords ?? []),
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
      <Icon className={cn(istAn && "text-primary")} />
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
          Soon
        </Badge>
      ) : command.kind === "toggle" ? (
        <CommandShortcut
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
            istAn
              ? "bg-primary/10 text-primary ring-primary/30"
              : "text-muted-foreground/60 ring-border/70",
          )}
        >
          {istAn ? "On" : "Off"}
        </CommandShortcut>
      ) : command.kind === "generate" ? (
        <Badge
          variant="secondary"
          className="shrink-0 rounded-md px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
        >
          Template
        </Badge>
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
    </CommandItem>
  );
}

/**
 * Eine Zeile fuer ein Modell in den dynamischen Wechsel-Gruppen -- Symbol,
 * Name samt Herkunft und rechts das Haekchen, wenn es gerade laeuft.
 */
function ModellZeile({
  kind,
  id,
  name,
  unterzeile,
  aktiv,
  icon: Icon,
  onSelect,
}: {
  /** Fliesst in den Suchwert -- "answer" / "transcription" / "tts". */
  kind: string;
  id: string;
  name: string;
  unterzeile: string;
  aktiv: boolean;
  icon: LucideIcon;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={`${kind} model ${name} ${id}`} onSelect={onSelect}>
      <Icon className={aktiv ? "text-primary" : "text-muted-foreground"} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{name}</span>
        <span className="truncate text-xs text-muted-foreground/70">
          {unterzeile}
        </span>
      </span>
      {aktiv ? <CheckIcon className="size-4 text-primary" /> : null}
    </CommandItem>
  );
}
