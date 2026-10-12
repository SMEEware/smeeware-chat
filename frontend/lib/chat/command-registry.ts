import type { LucideIcon } from "lucide-react";
import {
  AudioLinesIcon,
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
  COMMAND_EVENT,
  dispatchCommand,
  dispatchInsert,
  dispatchNavigate,
} from "@/lib/chat/commands";
import type { CommandEventName } from "@/lib/chat/commands";
import { useSettings } from "@/lib/settings/store";
import type { TranslateFn } from "@/lib/i18n/translate";
import type { Capabilities, Capability } from "@/hooks/use-capabilities";

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
  description: string;
  icon: LucideIcon;
};

const GROUP_ICONS: Record<CommandGroupId, LucideIcon> = {
  chat: MessageCirclePlusIcon,
  compose: SparklesIcon,
  context: FolderGit2Icon,
  input: PaperclipIcon,
  models: CpuIcon,
  personas: DramaIcon,
  preferences: SettingsIcon,
  navigate: CompassIcon,
  access: KeyRoundIcon,
  help: BookOpenIcon,
};

const GROUP_ORDER: CommandGroupId[] = [
  "chat",
  "compose",
  "context",
  "input",
  "models",
  "personas",
  "preferences",
  "navigate",
  "access",
  "help",
];

export function commandGroups(t: TranslateFn): CommandGroup[] {
  return GROUP_ORDER.map((id) => ({
    id,
    label: t(`commands.groups.${id}.label`),
    description: t(`commands.groups.${id}.description`),
    icon: GROUP_ICONS[id],
  }));
}

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

const DYNAMIC_ICONS: Record<DynamicGroupId, LucideIcon> = {
  workspaces: FolderGit2Icon,
  personas: DramaIcon,
  "answer-model": CpuIcon,
  "transcribe-model": MicIcon,
  "tts-model": BellIcon,
  "reference-chat": HistoryIcon,
  chats: HistoryIcon,
};

export function dynamicGroups(t: TranslateFn): Record<DynamicGroupId, DynamicGroup> {
  const build = (id: DynamicGroupId): DynamicGroup => ({
    id,
    label: t(`commands.dynamic.${id}`),
    icon: DYNAMIC_ICONS[id],
  });
  return {
    workspaces: build("workspaces"),
    personas: build("personas"),
    "answer-model": build("answer-model"),
    "transcribe-model": build("transcribe-model"),
    "tts-model": build("tts-model"),
    "reference-chat": build("reference-chat"),
    chats: build("chats"),
  };
}

export type Surface = "palette" | "slash";

export type CommandStatus = "ready" | "soon" | "beta";

export type SlashFlag = {
  name: string;
  label: string;
  placeholder: string;
};

type CommandBase = {
  id: string;
  label: string;
  description: string;
  hint?: string;
  icon: LucideIcon;
  group: CommandGroupId;
  keywords?: string;
  shortcut?: string[];
  status?: CommandStatus;
  surfaces?: Surface[];
  trigger?: string;
  requires?: Capability;
};

export type ActionCommand = CommandBase & {
  kind: "action";
  command: CommandEventName;
};

export type NavigateCommand = CommandBase & {
  kind: "navigate";
  href: string;
};

export type ToggleKey = "thinking" | "tools" | "notifications";
export type ToggleCommand = CommandBase & {
  kind: "toggle";
  setting: ToggleKey;
};

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

export function commands(t: TranslateFn): CommandEntry[] {
  const text = (id: string, hint = false) => ({
    label: t(`commands.items.${id}.label`),
    description: t(`commands.items.${id}.description`),
    keywords: t(`commands.items.${id}.keywords`),
    ...(hint ? { hint: t(`commands.items.${id}.hint`) } : {}),
  });
  const flag = (cmd: string, name: string): SlashFlag => ({
    name,
    label: t(`commands.generate.${cmd}.flags.${name}.label`),
    placeholder: t(`commands.generate.${cmd}.flags.${name}.placeholder`),
  });
  const gen = (id: string) => ({
    title: t(`commands.items.${id}.label`),
    instructions: t(`commands.generate.${id}.instructions`),
  });

  return [
    {
      id: "new-chat",
      kind: "action",
      command: COMMAND_EVENT.newChat,
      trigger: "new",
      icon: PlusIcon,
      group: "chat",
      shortcut: ["⌘", "J"],
      ...text("new-chat", true),
    },
    {
      id: "summarize-chat",
      kind: "action",
      command: COMMAND_EVENT.summarizeChat,
      trigger: "summary",
      icon: WandSparklesIcon,
      group: "chat",
      ...text("summarize-chat", true),
    },
    {
      id: "rename-chat",
      kind: "action",
      command: COMMAND_EVENT.renameChat,
      icon: PencilLineIcon,
      group: "chat",
      surfaces: ["palette"],
      ...text("rename-chat"),
    },
    {
      id: "copy-transcript",
      kind: "action",
      command: COMMAND_EVENT.shareChatHistory,
      icon: CopyIcon,
      group: "chat",
      surfaces: ["palette"],
      ...text("copy-transcript", true),
    },
    {
      id: "copy-link",
      kind: "action",
      command: COMMAND_EVENT.shareLiveChat,
      icon: LinkIcon,
      group: "chat",
      surfaces: ["palette"],
      ...text("copy-link", true),
    },
    {
      id: "delete-chat",
      kind: "action",
      command: COMMAND_EVENT.deleteChat,
      icon: Trash2Icon,
      group: "chat",
      surfaces: ["palette"],
      ...text("delete-chat"),
    },
    {
      id: "prompt",
      kind: "generate",
      trigger: "prompt",
      icon: SparklesIcon,
      group: "compose",
      ...text("prompt", true),
      ...gen("prompt"),
      flags: [
        flag("prompt", "goal"),
        flag("prompt", "context"),
        flag("prompt", "audience"),
        flag("prompt", "tone"),
        flag("prompt", "format"),
        flag("prompt", "length"),
      ],
    },
    {
      id: "spec",
      kind: "generate",
      trigger: "spec",
      icon: FileTextIcon,
      group: "compose",
      ...text("spec", true),
      ...gen("spec"),
      flags: [
        flag("spec", "feature"),
        flag("spec", "in-scope"),
        flag("spec", "out-of-scope"),
        flag("spec", "constraints"),
        flag("spec", "acceptance"),
      ],
    },
    {
      id: "plan",
      kind: "generate",
      trigger: "plan",
      icon: ListChecksIcon,
      group: "compose",
      ...text("plan", true),
      ...gen("plan"),
      flags: [
        flag("plan", "objective"),
        flag("plan", "context"),
        flag("plan", "risks"),
        flag("plan", "timeline"),
      ],
    },
    {
      id: "image",
      kind: "generate",
      trigger: "image",
      requires: "image",
      icon: ImageIcon,
      group: "compose",
      ...text("image", true),
      ...gen("image"),
      flags: [
        flag("image", "subject"),
        flag("image", "style"),
        flag("image", "mood"),
        flag("image", "ratio"),
      ],
    },
    {
      id: "workspaces",
      kind: "action",
      command: COMMAND_EVENT.manageWorkspaces,
      trigger: "workspace",
      icon: FolderGit2Icon,
      group: "context",
      ...text("workspaces", true),
    },
    {
      id: "manage-plugins",
      kind: "action",
      command: COMMAND_EVENT.managePlugins,
      trigger: "plugins",
      icon: WrenchIcon,
      group: "context",
      ...text("manage-plugins", true),
    },
    {
      id: "reference-message",
      kind: "action",
      command: COMMAND_EVENT.referenceMessage,
      trigger: "quote",
      icon: TextQuoteIcon,
      group: "context",
      ...text("reference-message", true),
    },
    {
      id: "attach",
      kind: "action",
      command: COMMAND_EVENT.attachments,
      trigger: "attach",
      icon: PaperclipIcon,
      group: "input",
      shortcut: ["⌘", "O"],
      ...text("attach", true),
    },
    {
      id: "record",
      kind: "action",
      command: COMMAND_EVENT.recordVoice,
      trigger: "record",
      requires: "voice",
      icon: MicIcon,
      group: "input",
      shortcut: ["⌘", "I"],
      ...text("record", true),
    },
    {
      id: "voice-call",
      kind: "action",
      command: COMMAND_EVENT.voiceCall,
      trigger: "call",
      requires: "voice",
      icon: AudioLinesIcon,
      group: "input",
      ...text("voice-call", true),
    },
    {
      id: "comment",
      kind: "action",
      command: COMMAND_EVENT.comment,
      trigger: "comment",
      icon: MessageCirclePlusIcon,
      group: "input",
      ...text("comment", true),
    },
    {
      id: "list-models",
      kind: "navigate",
      href: "/docs/endpoints/models",
      icon: ListIcon,
      group: "models",
      surfaces: ["palette"],
      ...text("list-models"),
    },
    {
      id: "new-persona",
      kind: "action",
      command: COMMAND_EVENT.newSystemPrompt,
      icon: FilePlus2Icon,
      group: "personas",
      surfaces: ["palette"],
      ...text("new-persona", true),
    },
    {
      id: "toggle-thinking",
      kind: "toggle",
      setting: "thinking",
      icon: BrainIcon,
      group: "preferences",
      surfaces: ["palette"],
      ...text("toggle-thinking"),
    },
    {
      id: "toggle-tools",
      kind: "toggle",
      setting: "tools",
      icon: WrenchIcon,
      group: "preferences",
      surfaces: ["palette"],
      ...text("toggle-tools", true),
    },
    {
      id: "toggle-notifications",
      kind: "toggle",
      setting: "notifications",
      icon: BellIcon,
      group: "preferences",
      surfaces: ["palette"],
      ...text("toggle-notifications"),
    },
    {
      id: "toggle-theme",
      kind: "action",
      command: COMMAND_EVENT.themeToggle,
      icon: SunMoonIcon,
      group: "preferences",
      surfaces: ["palette"],
      ...text("toggle-theme"),
    },
    {
      id: "open-docs",
      kind: "action",
      command: COMMAND_EVENT.docs,
      trigger: "docs",
      icon: BookOpenIcon,
      group: "navigate",
      ...text("open-docs"),
    },
    {
      id: "open-endpoints",
      kind: "navigate",
      href: "/docs/endpoints",
      icon: WaypointsIcon,
      group: "navigate",
      surfaces: ["palette"],
      ...text("open-endpoints"),
    },
    {
      id: "open-account",
      kind: "navigate",
      href: "/settings",
      icon: UserIcon,
      group: "navigate",
      surfaces: ["palette"],
      ...text("open-account"),
    },
    {
      id: "open-settings",
      kind: "action",
      command: COMMAND_EVENT.openSettingsDialog,
      icon: SettingsIcon,
      group: "navigate",
      surfaces: ["palette"],
      ...text("open-settings"),
    },
    {
      id: "open-api-keys",
      kind: "navigate",
      href: "/settings?section=keys",
      icon: KeyRoundIcon,
      group: "access",
      surfaces: ["palette"],
      ...text("open-api-keys"),
    },
    {
      id: "start-tour",
      kind: "action",
      command: COMMAND_EVENT.startTour,
      icon: CompassIcon,
      group: "help",
      surfaces: ["palette"],
      ...text("start-tour"),
    },
  ];
}

export type Shortcut = {
  id: string;
  label: string;
  keys: string[];
};

export function shortcuts(t: TranslateFn, caps?: Capabilities): Shortcut[] {
  return [
    { id: "palette", label: t("chat.commandPalette"), keys: ["⌘", "K"] },
    ...commands(t)
      .filter((c) => c.shortcut && (!c.requires || caps?.[c.requires] === true))
      .map((c) => ({ id: c.id, label: c.label, keys: c.shortcut! })),
  ];
}

const isOnSurface = (command: CommandEntry, surface: Surface): boolean => {
  const surfaces = command.surfaces ?? ["palette", "slash"];
  if (!surfaces.includes(surface)) return false;
  if (surface === "slash" && !command.trigger) return false;
  return true;
};

export function commandsFor(
  t: TranslateFn,
  surface: Surface,
  caps?: Capabilities,
): CommandEntry[] {
  return commands(t).filter(
    (c) => isOnSurface(c, surface) && (!c.requires || caps?.[c.requires] === true),
  );
}

const searchText = (command: CommandEntry): string =>
  [
    command.trigger,
    command.label,
    command.description,
    command.hint,
    command.keywords,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export function filterCommands(
  t: TranslateFn,
  query: string,
  surface: Surface,
  caps?: Capabilities,
): CommandEntry[] {
  const items = commandsFor(t, surface, caps);
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((c) => searchText(c).includes(q));
}

export function groupCommands(
  t: TranslateFn,
  list: CommandEntry[],
): { group: CommandGroup; commands: CommandEntry[] }[] {
  return commandGroups(t)
    .map((group) => ({
      group,
      commands: list.filter((c) => c.group === group.id),
    }))
    .filter((entry) => entry.commands.length > 0);
}

export function buildGeneratorTemplate(command: GenerateCommand): string {
  const flags = command.flags
    .map((flag) => `• ${flag.label}: ${flag.placeholder}`)
    .join("\n");
  return `${command.title}\n\n${command.instructions}\n\n${flags}`;
}

export function runCommand(command: CommandEntry): void {
  if (command.status === "soon") return;

  switch (command.kind) {
    case "action":
      dispatchCommand(command.command);
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
