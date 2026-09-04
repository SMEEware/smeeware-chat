import type { LucideIcon } from "lucide-react";
import {
  BellIcon,
  BookOpenIcon,
  BrainIcon,
  CompassIcon,
  CopyIcon,
  CpuIcon,
  DramaIcon,
  FilePlus2Icon,
  FileTextIcon,
  FolderGit2Icon,
  HistoryIcon,
  ImageIcon,
  KeyRoundIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  MessageCirclePlusIcon,
  MicIcon,
  PaperclipIcon,
  PencilLineIcon,
  PlusIcon,
  QuoteIcon,
  SparklesIcon,
  SunMoonIcon,
  SettingsIcon,
  TextQuoteIcon,
  Trash2Icon,
  UserIcon,
  WandSparklesIcon,
  WaypointsIcon,
  WrenchIcon,
} from "lucide-react";

import {
  BEFEHL,
  dispatchCommand,
  dispatchInsert,
  dispatchNavigate,
} from "@/lib/chat/commands";
import type { BefehlName } from "@/lib/chat/commands";
import { useSettings } from "@/lib/settings/store";

/**
 * Der Katalog -- die eine Stelle, an der jedes Kommando beschrieben ist.
 *
 * Zwei Oberflaechen lesen ihn: die Schnellwahl (``⌘K``) und das
 * Slash-Menue ueber dem Eingabefeld. Beide zeigen dieselben Eintraege,
 * gruppiert und mit Symbol, Kurztext und -- wo es einen gibt -- Kuerzel.
 * Ein Eintrag traegt alles, was die Oberflaeche zum Darstellen und
 * Ausfuehren braucht; keine Zeile Darstellung liegt doppelt vor.
 *
 * Ausgefuehrt wird ueber ``runCommand``. Der Eintrag sagt nur, WAS er ist
 * (feuere ein Signal, geh dorthin, dreh einen Schalter, leg eine Vorlage
 * ins Feld) -- die Verkabelung dahinter kennt er nicht. Jeder Eintrag hier
 * tut etwas Echtes; die eigentliche Arbeit sitzt in den Hoerern (Chat-Panel,
 * Sidebar, Palette, Composer), die auf die Signale reagieren.
 *
 * Modellwechsel und "einen anderen Chat referenzieren" stehen NICHT hier:
 * sie brauchen Live-Daten und erscheinen als dynamische Gruppen in der
 * Palette.
 */

// ------------------------------------------------------------------ //
// Gruppen                                                             //
// ------------------------------------------------------------------ //

export type CommandGroupId =
  | "chat"
  | "compose"
  | "context"
  | "input"
  | "models"
  | "personas"
  | "preferences"
  | "navigate"
  | "access"
  | "help";

export type CommandGroup = {
  id: CommandGroupId;
  label: string;
  /** Ein Satz, der sagt, wozu die Gruppe da ist. */
  description: string;
  icon: LucideIcon;
};

/** Reihenfolge der statischen Gruppen -- treibt die Ueberschriften. */
export const COMMAND_GROUPS: CommandGroup[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Start, share and manage conversations.",
    icon: MessageCirclePlusIcon,
  },
  {
    id: "compose",
    label: "Compose",
    description: "Drop a ready-made template into the message.",
    icon: SparklesIcon,
  },
  {
    id: "context",
    label: "Context",
    description: "The workspace and references the model works from.",
    icon: FolderGit2Icon,
  },
  {
    id: "input",
    label: "Input",
    description: "Bring files and voice into the message.",
    icon: PaperclipIcon,
  },
  {
    id: "models",
    label: "Models",
    description: "Pick what answers, transcribes and speaks.",
    icon: CpuIcon,
  },
  {
    id: "personas",
    label: "Personas",
    description: "Swap the system prompt behind the answers.",
    icon: DramaIcon,
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "Thinking, tools, notifications and theme.",
    icon: SettingsIcon,
  },
  {
    id: "navigate",
    label: "Go to",
    description: "Jump to the docs, account and settings.",
    icon: CompassIcon,
  },
  {
    id: "access",
    label: "Access",
    description: "Keys for the API.",
    icon: KeyRoundIcon,
  },
  {
    id: "help",
    label: "Help",
    description: "Find your way around.",
    icon: BookOpenIcon,
  },
];

export const groupById = (id: CommandGroupId): CommandGroup =>
  COMMAND_GROUPS.find((g) => g.id === id)!;

/**
 * Dynamische Gruppen: ihre Eintraege stehen nicht im Katalog, sondern
 * entstehen erst zur Laufzeit -- die offenen Chats, die Workspaces, die
 * Personas, die Modelle. Die Palette fuellt sie mit lebenden Daten; hier
 * steht nur, wie sie heissen.
 */
export type DynamicGroupId =
  | "chats"
  | "workspaces"
  | "personas"
  | "answer-model"
  | "transcribe-model"
  | "tts-model"
  | "reference-chat";

export type DynamicGroup = {
  id: DynamicGroupId;
  label: string;
  icon: LucideIcon;
};

export const DYNAMIC_GROUPS: Record<DynamicGroupId, DynamicGroup> = {
  workspaces: { id: "workspaces", label: "Switch workspace", icon: FolderGit2Icon },
  personas: { id: "personas", label: "Switch persona", icon: DramaIcon },
  "answer-model": { id: "answer-model", label: "Answer model", icon: CpuIcon },
  "transcribe-model": { id: "transcribe-model", label: "Transcription model", icon: MicIcon },
  "tts-model": { id: "tts-model", label: "Read-aloud model", icon: BellIcon },
  "reference-chat": { id: "reference-chat", label: "Reference a chat", icon: HistoryIcon },
  chats: { id: "chats", label: "Chats", icon: HistoryIcon },
};

// ------------------------------------------------------------------ //
// Eintraege                                                           //
// ------------------------------------------------------------------ //

/** Wo ein Eintrag erscheint. */
export type Surface = "palette" | "slash";

/** Alle Eintraege sind ``ready`` -- der Wert bleibt fuer kuenftige Werkzeuge. */
export type CommandStatus = "ready" | "soon" | "beta";

/** Ein Feld einer Vorlage, das der Nutzer ausfuellt. */
export type SlashFlag = {
  name: string;
  label: string;
  placeholder: string;
};

type CommandBase = {
  id: string;
  label: string;
  /** Einzeiler in den Menues. */
  description: string;
  /** Laengerer Nutzen -- fuer den Merker, die ausfuehrliche Zeile. */
  hint?: string;
  icon: LucideIcon;
  group: CommandGroupId;
  /** Zusaetzliche Begriffe, die beim Suchen greifen. */
  keywords?: string[];
  /** Tastenkappen, falls es ein Kuerzel gibt. */
  shortcut?: string[];
  /** Fehlt = ``ready``. */
  status?: CommandStatus;
  /** Wo der Eintrag auftaucht. Fehlt = beide. */
  surfaces?: Surface[];
  /** Das Wort nach dem Slash. Nur mit ihm erscheint der Eintrag im Slash-Menue. */
  trigger?: string;
};

/** Feuert ein signalfreies Kommando. */
export type ActionCommand = CommandBase & {
  kind: "action";
  befehl: BefehlName;
};

/** Springt an eine Adresse. */
export type NavigateCommand = CommandBase & {
  kind: "navigate";
  href: string;
};

/** Legt einen Schalter aus den Einstellungen um. */
export type ToggleKey = "thinking" | "tools" | "notifications";
export type ToggleCommand = CommandBase & {
  kind: "toggle";
  setting: ToggleKey;
};

/** Legt eine Ausfuell-Vorlage ins Eingabefeld. */
export type GenerateCommand = CommandBase & {
  kind: "generate";
  title: string;
  instructions: string;
  flags: SlashFlag[];
};

export type CommandEntry =
  | ActionCommand
  | NavigateCommand
  | ToggleCommand
  | GenerateCommand;

export const COMMANDS: CommandEntry[] = [
  // --- Chat ------------------------------------------------------------
  {
    id: "new-chat",
    kind: "action",
    befehl: BEFEHL.newChat,
    trigger: "new",
    label: "New chat",
    description: "Start a fresh conversation",
    hint: "A clean thread with its own address, ready to link and return to.",
    icon: PlusIcon,
    group: "chat",
    shortcut: ["⌘", "J"],
    keywords: ["start", "blank", "fresh"],
  },
  {
    id: "summarize-chat",
    kind: "action",
    befehl: BEFEHL.summarizeChat,
    trigger: "summary",
    label: "Summarize chat",
    description: "Ask for the key points of this conversation",
    hint: "Sends a request for a concise recap — decisions, facts, open questions.",
    icon: WandSparklesIcon,
    group: "chat",
    keywords: ["tldr", "recap", "digest"],
  },
  {
    id: "rename-chat",
    kind: "action",
    befehl: BEFEHL.renameChat,
    label: "Rename chat",
    description: "Give this conversation a clearer title",
    icon: PencilLineIcon,
    group: "chat",
    surfaces: ["palette"],
    keywords: ["title", "name"],
  },
  {
    id: "copy-transcript",
    kind: "action",
    befehl: BEFEHL.shareChatHistory,
    label: "Copy transcript",
    description: "Copy this conversation as Markdown",
    hint: "The whole exchange as clean Markdown on your clipboard — paste it anywhere.",
    icon: CopyIcon,
    group: "chat",
    surfaces: ["palette"],
    keywords: ["share", "export", "clipboard", "markdown"],
  },
  {
    id: "copy-link",
    kind: "action",
    befehl: BEFEHL.shareLiveChat,
    label: "Copy link",
    description: "Copy this chat's address",
    hint: "The URL of this conversation, so you can jump back to it or bookmark it.",
    icon: LinkIcon,
    group: "chat",
    surfaces: ["palette"],
    keywords: ["share", "url", "clipboard"],
  },
  {
    id: "delete-chat",
    kind: "action",
    befehl: BEFEHL.deleteChat,
    label: "Delete chat",
    description: "Remove this conversation for good",
    icon: Trash2Icon,
    group: "chat",
    surfaces: ["palette"],
    keywords: ["remove", "trash"],
  },

  // --- Compose ---------------------------------------------------------
  {
    id: "prompt",
    kind: "generate",
    trigger: "prompt",
    label: "Build a prompt",
    description: "Turn a rough idea into a polished prompt",
    hint: "Fill in the blanks; the model returns a self-contained prompt to reuse.",
    icon: SparklesIcon,
    group: "compose",
    keywords: ["template", "engineer", "write", "meta"],
    title: "Build a prompt",
    instructions:
      "Turn the notes below into a polished, comprehensive prompt. Ask one clarifying question only if something essential is missing; otherwise write the final prompt directly -- self-contained and ready to paste.",
    flags: [
      { name: "goal", label: "Goal", placeholder: "what the prompt should accomplish" },
      { name: "context", label: "Context", placeholder: "background the model needs" },
      { name: "audience", label: "Audience", placeholder: "who the output is for" },
      { name: "tone", label: "Tone", placeholder: "formal / casual / technical" },
      { name: "format", label: "Format", placeholder: "markdown / code / list" },
      { name: "length", label: "Length", placeholder: "short / detailed" },
    ],
  },
  {
    id: "spec",
    kind: "generate",
    trigger: "spec",
    label: "Write a spec",
    description: "Produce a structured specification from loose notes",
    hint: "Problem, scope, constraints and acceptance criteria -- the what, not the how.",
    icon: FileTextIcon,
    group: "compose",
    keywords: ["specification", "document", "requirements"],
    title: "Write a spec",
    instructions:
      "Turn the notes below into a clear, structured specification: problem, scope, constraints and acceptance criteria. Stay at the what/why level -- no implementation details.",
    flags: [
      { name: "feature", label: "Feature", placeholder: "what is being specified" },
      { name: "in-scope", label: "In scope", placeholder: "what is included" },
      { name: "out-of-scope", label: "Out of scope", placeholder: "what is excluded" },
      { name: "constraints", label: "Constraints", placeholder: "limits, tech, non-goals" },
      { name: "acceptance", label: "Acceptance criteria", placeholder: "how to know it is done" },
    ],
  },
  {
    id: "plan",
    kind: "generate",
    trigger: "plan",
    label: "Write a plan",
    description: "Turn a goal into a step-by-step plan",
    hint: "Ordered steps, milestones, risks and a rough timeline.",
    icon: ListChecksIcon,
    group: "compose",
    keywords: ["steps", "roadmap", "milestones"],
    title: "Write a plan",
    instructions:
      "Turn the notes below into a step-by-step implementation plan with milestones, risks and a rough timeline. Break the work into concrete, ordered steps.",
    flags: [
      { name: "objective", label: "Objective", placeholder: "the end goal" },
      { name: "context", label: "Context", placeholder: "current state / existing work" },
      { name: "risks", label: "Risks", placeholder: "what could go wrong" },
      { name: "timeline", label: "Timeline", placeholder: "deadline or phases" },
    ],
  },
  {
    id: "image",
    kind: "generate",
    trigger: "image",
    label: "Create an image",
    description: "Describe a picture for the model to generate",
    hint: "Spell out subject, style and mood; the model draws it with its image tool.",
    icon: ImageIcon,
    group: "compose",
    keywords: ["picture", "draw", "art", "generate", "render"],
    title: "Create an image",
    instructions:
      "Generate an image from the description below using the image tool. If a detail is missing, choose a tasteful default rather than asking.",
    flags: [
      { name: "subject", label: "Subject", placeholder: "what is in the picture" },
      { name: "style", label: "Style", placeholder: "photo / illustration / 3d / ..." },
      { name: "mood", label: "Mood", placeholder: "lighting, colour, feeling" },
      { name: "ratio", label: "Aspect", placeholder: "square / wide / tall" },
    ],
  },

  // --- Context ---------------------------------------------------------
  {
    id: "workspaces",
    kind: "action",
    befehl: BEFEHL.manageWorkspaces,
    trigger: "workspace",
    label: "Workspaces",
    description: "Set the project the model works from",
    hint: "A saved path and notes the model gets as context on every turn.",
    icon: FolderGit2Icon,
    group: "context",
    keywords: ["folder", "project", "path", "directory", "cwd", "context"],
  },
  {
    id: "reference-message",
    kind: "action",
    befehl: BEFEHL.referenceMessage,
    trigger: "quote",
    label: "Quote last answer",
    description: "Drop the last reply into the box as a quote",
    hint: "Blockquotes the model's last answer so you can reply to a specific part.",
    icon: TextQuoteIcon,
    group: "context",
    keywords: ["reference", "cite", "refer", "message"],
  },
  {
    id: "reference-content",
    kind: "action",
    befehl: BEFEHL.referenceContent,
    label: "Quote selection",
    description: "Quote whatever text you have selected",
    hint: "Select any text on the page, then run this to quote it into the box.",
    icon: QuoteIcon,
    group: "context",
    surfaces: ["palette"],
    keywords: ["snippet", "excerpt", "selection", "reference"],
  },

  // --- Input -----------------------------------------------------------
  {
    id: "attach",
    kind: "action",
    befehl: BEFEHL.attachments,
    trigger: "attach",
    label: "Attach files",
    description: "Add images or text files",
    hint: "Drop them on the box too. Text folds into the prompt; images travel by path.",
    icon: PaperclipIcon,
    group: "input",
    shortcut: ["⌘", "O"],
    keywords: ["file", "upload", "image", "document"],
  },
  {
    id: "record",
    kind: "action",
    befehl: BEFEHL.recordVoice,
    trigger: "record",
    label: "Start recording",
    description: "Dictate a message with your voice",
    hint: "Speak in any language -- you never pick one first.",
    icon: MicIcon,
    group: "input",
    shortcut: ["⌘", "I"],
    keywords: ["voice", "dictate", "speech", "transcribe"],
  },
  {
    id: "comment",
    kind: "action",
    befehl: BEFEHL.comment,
    trigger: "comment",
    label: "Comment on last message",
    description: "Add a private note to the last reply",
    hint: "A note only you see -- it never reaches the model.",
    icon: MessageCirclePlusIcon,
    group: "input",
    keywords: ["note", "annotate"],
  },

  // --- Models ----------------------------------------------------------
  // Umschalten passiert ueber die dynamischen Gruppen der Palette (mit
  // Live-Modell-Listen); hier steht der Verweis auf die volle Uebersicht.
  {
    id: "list-models",
    kind: "navigate",
    href: "/docs/endpoints/models",
    label: "List models",
    description: "See every model the API accepts",
    icon: ListIcon,
    group: "models",
    surfaces: ["palette"],
    keywords: ["catalog", "available", "model"],
  },

  // --- Personas --------------------------------------------------------
  {
    id: "new-persona",
    kind: "action",
    befehl: BEFEHL.newSystemPrompt,
    label: "New persona",
    description: "Write a system prompt of your own",
    hint: "A saved personality the model wears -- opens the persona editor.",
    icon: FilePlus2Icon,
    group: "personas",
    surfaces: ["palette"],
    keywords: ["system prompt", "persona", "character", "role"],
  },

  // --- Preferences -----------------------------------------------------
  {
    id: "toggle-thinking",
    kind: "toggle",
    setting: "thinking",
    label: "Thinking",
    description: "Show or hide the model's reasoning",
    icon: BrainIcon,
    group: "preferences",
    surfaces: ["palette"],
    keywords: ["reasoning", "chain of thought", "cot"],
  },
  {
    id: "toggle-tools",
    kind: "toggle",
    setting: "tools",
    label: "Tools",
    description: "Let the model use its tools",
    hint: "Web, images, weather, shell and the rest -- on or off for the next turn.",
    icon: WrenchIcon,
    group: "preferences",
    surfaces: ["palette"],
    keywords: ["functions", "abilities"],
  },
  {
    id: "toggle-notifications",
    kind: "toggle",
    setting: "notifications",
    label: "Notifications",
    description: "Show notices from the backend",
    icon: BellIcon,
    group: "preferences",
    surfaces: ["palette"],
    keywords: ["alerts", "toasts"],
  },
  {
    id: "toggle-theme",
    kind: "action",
    befehl: BEFEHL.themeToggle,
    label: "Toggle theme",
    description: "Switch between light and dark",
    icon: SunMoonIcon,
    group: "preferences",
    surfaces: ["palette"],
    keywords: ["dark", "light", "appearance", "colour"],
  },

  // --- Go to -----------------------------------------------------------
  {
    id: "open-docs",
    kind: "action",
    befehl: BEFEHL.docs,
    trigger: "docs",
    label: "Open docs",
    description: "Read the documentation",
    icon: BookOpenIcon,
    group: "navigate",
    keywords: ["help", "reference", "guide"],
  },
  {
    id: "open-endpoints",
    kind: "navigate",
    href: "/docs/endpoints",
    label: "API endpoints",
    description: "Every route at a glance",
    icon: WaypointsIcon,
    group: "navigate",
    surfaces: ["palette"],
    keywords: ["api", "routes", "reference"],
  },
  {
    id: "open-account",
    kind: "navigate",
    href: "/settings",
    label: "Account",
    description: "Your profile and sign-in",
    icon: UserIcon,
    group: "navigate",
    surfaces: ["palette"],
    keywords: ["profile", "username", "password", "avatar"],
  },
  {
    id: "open-settings",
    kind: "action",
    befehl: BEFEHL.openSettingsDialog,
    label: "Chat settings",
    description: "Thinking, tools, personas and voices",
    icon: SettingsIcon,
    group: "navigate",
    surfaces: ["palette"],
    keywords: ["preferences", "options", "gear"],
  },

  // --- Access ----------------------------------------------------------
  {
    id: "open-api-keys",
    kind: "navigate",
    href: "/settings?section=keys",
    label: "API keys",
    description: "Create and revoke Smeeware keys",
    icon: KeyRoundIcon,
    group: "access",
    surfaces: ["palette"],
    keywords: ["token", "secret", "bearer"],
  },

  // --- Help ------------------------------------------------------------
  {
    id: "start-tour",
    kind: "action",
    befehl: BEFEHL.startTour,
    label: "Take the tour",
    description: "Walk through the chat again",
    icon: CompassIcon,
    group: "help",
    surfaces: ["palette"],
    keywords: ["walkthrough", "onboarding", "guide", "intro"],
  },
];

// ------------------------------------------------------------------ //
// Kuerzel -- aus dem Katalog abgeleitet, nie doppelt gepflegt         //
// ------------------------------------------------------------------ //

export type Kuerzel = {
  id: string;
  label: string;
  tasten: string[];
};

/** Die Kuerzel, wie beide Oberflaechen sie zeigen. Palette zuerst, dann
 *  alles aus dem Katalog, das eins traegt -- in Katalogreihenfolge. */
export const KUERZEL: Kuerzel[] = [
  { id: "palette", label: "Command palette", tasten: ["⌘", "K"] },
  ...COMMANDS.filter((c) => c.shortcut).map((c) => ({
    id: c.id,
    label: c.label,
    tasten: c.shortcut!,
  })),
];

// ------------------------------------------------------------------ //
// Auswahl und Ausfuehrung                                             //
// ------------------------------------------------------------------ //

const zeigtAuf = (command: CommandEntry, surface: Surface): boolean => {
  const surfaces = command.surfaces ?? ["palette", "slash"];
  if (!surfaces.includes(surface)) return false;
  // Im Slash-Menue nur Eintraege mit Ausloese-Wort.
  if (surface === "slash" && !command.trigger) return false;
  return true;
};

/** Alle Eintraege einer Oberflaeche, in Katalogreihenfolge. */
export function commandsFor(surface: Surface): CommandEntry[] {
  return COMMANDS.filter((c) => zeigtAuf(c, surface));
}

const suchtext = (command: CommandEntry): string =>
  [
    command.trigger,
    command.label,
    command.description,
    command.hint,
    ...(command.keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/** Eintraege einer Oberflaeche gegen die Sucheingabe filtern. */
export function filterCommands(query: string, surface: Surface): CommandEntry[] {
  const items = commandsFor(surface);
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((c) => suchtext(c).includes(q));
}

/** Eine (gefilterte) Liste nach den statischen Gruppen ordnen. */
export function groupCommands(
  commands: CommandEntry[],
): { group: CommandGroup; commands: CommandEntry[] }[] {
  return COMMAND_GROUPS.map((group) => ({
    group,
    commands: commands.filter((c) => c.group === group.id),
  })).filter((entry) => entry.commands.length > 0);
}

/**
 * Eine Vorlage als Ausfuell-Text rendern.
 *
 * Landet im Eingabefeld, der Nutzer ersetzt die Platzhalter und schickt es
 * ab -- die eigentliche Arbeit macht das Modell.
 */
export function buildGeneratorTemplate(command: GenerateCommand): string {
  const flags = command.flags
    .map((flag) => `• ${flag.label}: ${flag.placeholder}`)
    .join("\n");
  return `${command.title}\n\n${command.instructions}\n\n${flags}`;
}

/**
 * Ein Kommando ausfuehren. Die eine Stelle, die weiss, was jede Sorte
 * bedeutet -- beide Oberflaechen rufen sie.
 */
export function runCommand(command: CommandEntry): void {
  if (command.status === "soon") return;

  switch (command.kind) {
    case "action":
      dispatchCommand(command.befehl);
      return;
    case "navigate":
      dispatchNavigate(command.href);
      return;
    case "toggle": {
      const s = useSettings.getState();
      if (command.setting === "thinking") s.setThinking(!s.thinking);
      else if (command.setting === "tools") s.setTools(!s.tools);
      else if (command.setting === "notifications")
        s.setNotifications(!s.notifications);
      return;
    }
    case "generate":
      dispatchInsert(buildGeneratorTemplate(command));
      return;
  }
}
