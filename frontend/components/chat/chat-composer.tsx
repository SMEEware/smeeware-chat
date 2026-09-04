"use client";

import * as React from "react";
import {
  ArrowBigUpIcon,
  ArrowUpIcon,
  CheckIcon,
  CornerDownLeftIcon,
  FolderGit2Icon,
  Loader2Icon,
  MicIcon,
  PaperclipIcon,
  SquareIcon,
  WrenchIcon,
  TextQuoteIcon,
  XIcon,
} from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { AttachmentChips } from "@/components/chat/attachment-chips";
import { VoiceLevel } from "@/components/chat/voice-level";
import { ModelSelector } from "@/components/chat/model-selector";
import { SlashMenu } from "@/components/chat/slash-menu";
import { toast } from "sonner";

import { usePlugins, useSetPluginInstalled } from "@/hooks/use-plugins";
import { alsPluginBefehl } from "@/lib/chat/plugin-commands";
import { useSound } from "@/hooks/use-sound";
import { useTranscribe } from "@/hooks/use-transcribe";
import {
  BEFEHL,
  dispatchCommand,
  istKuerzel,
  onBefehl,
  onInsert,
  onQuote,
} from "@/lib/chat/commands";
import type { Zitat } from "@/lib/chat/commands";
import {
  buildGeneratorTemplate,
  filterCommands,
  runCommand,
} from "@/lib/chat/command-registry";
import type { CommandEntry } from "@/lib/chat/command-registry";
import { aktiverWorkspace, useWorkspaces } from "@/lib/workspaces/store";
import {
  DATEI_ACCEPT,
  IMAGE_MAX_BYTES,
  MAX_ATTACHMENTS,
  bilderHochladen,
  einordnen,
  groesse,
  textLesen,
} from "@/lib/chat/attachments";
import type { Attachment, Model } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

const MAX_HEIGHT = 200;
const SEND_SOUND = "/assets/sounds/send_message.mp3";

type ChatComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  models: Model[];
  modelGroups?: string[];
  model: string;
  onModelChange: (id: string) => void;
  attachments: Attachment[];
  onAttachmentsChange: React.Dispatch<React.SetStateAction<Attachment[]>>;
};

function alsBlockzitat({ text, role }: Zitat): string {
  const wer = role === "assistant" ? "Quoting your earlier answer" : "Quoting my earlier message";
  return [`> **${wer}:**`, ">", ...text.split("\n").map((zeile) => `> ${zeile}`)]
    .join("\n");
}

export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  models,
  modelGroups,
  model,
  onModelChange,
  attachments,
  onAttachmentsChange,
}: ChatComposerProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const dateiRef = React.useRef<HTMLInputElement>(null);
  const playSend = useSound(SEND_SOUND);

  const [laedt, setLaedt] = React.useState(false);
  const [fehler, setFehler] = React.useState<string | null>(null);
  const [ueberzogen, setUeberzogen] = React.useState(false);

  const tiefeRef = React.useRef(0);

  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const [slashQuery, setSlashQuery] = React.useState<string | null>(null);
  const [slashIndex, setSlashIndex] = React.useState(0);

  const closeSlash = React.useCallback(() => {
    setSlashQuery(null);
    setSlashIndex(0);
  }, []);

  const runSlash = React.useCallback(
    (command: CommandEntry) => {
      const base = valueRef.current.replace(/\/\S*$/, "").trimEnd();

      if (command.kind === "generate") {
        const template = buildGeneratorTemplate(command);
        onValueChange(base ? `${base}\n\n${template}` : template);
        closeSlash();
        textareaRef.current?.focus();
        return;
      }

      onValueChange(base);
      closeSlash();
      runCommand(command);
    },
    [onValueChange, closeSlash],
  );

  React.useEffect(
    () =>
      onInsert((text) => {
        const vorher = valueRef.current;
        onValueChange(vorher ? `${vorher}\n\n${text}` : text);
        textareaRef.current?.focus();
      }),
    [onValueChange],
  );

  const [zitat, setZitat] = React.useState<Zitat | null>(null);

  React.useEffect(
    () =>
      onQuote((neu) => {
        setZitat(neu);
        textareaRef.current?.focus();
      }),
    [],
  );

  const textEinfuegen = React.useCallback(
    (text: string) => {
      const vorher = valueRef.current;
      const fuge = vorher && !/\s$/.test(vorher) ? " " : "";
      onValueChange(vorher + fuge + text);
      textareaRef.current?.focus();
    },
    [onValueChange],
  );

  const stimme = useTranscribe(textEinfuegen);
  const nimmtAuf = stimme.zustand !== "idle";

  const workspace = useWorkspaces(aktiverWorkspace);

  const plugins = usePlugins();
  const pluginSchalten = useSetPluginInstalled();
  const aktivePlugins = plugins.data?.installed_count ?? 0;

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  React.useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus();
  }, [isStreaming]);

  const dateiwahl = React.useCallback(() => dateiRef.current?.click(), []);

  React.useEffect(() => {
    if (disabled || laedt) return;

    const aufTaste = (event: KeyboardEvent) => {
      if (istKuerzel(event, "o")) {
        event.preventDefault();
        dateiwahl();
        return;
      }
      if (istKuerzel(event, "i")) {
        event.preventDefault();
        void stimme.starten();
      }
    };

    window.addEventListener("keydown", aufTaste);
    const abDatei = onBefehl(BEFEHL.attachments, dateiwahl);
    const abAufnahme = onBefehl(
      BEFEHL.recordVoice,
      () => void stimme.starten(),
    );
    return () => {
      window.removeEventListener("keydown", aufTaste);
      abDatei();
      abAufnahme();
    };
  }, [dateiwahl, disabled, laedt, stimme]);

  React.useEffect(() => {
    if (stimme.zustand !== "recording") return;

    const aufTaste = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        stimme.beenden();
      } else if (event.key === "Escape") {
        event.preventDefault();
        stimme.abbrechen();
      }
    };

    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [stimme]);

  const canSend =
    value.trim().length > 0 && !isStreaming && !disabled && !laedt && !nimmtAuf;

  const annehmen = React.useCallback(
    async (dateien: File[]) => {
      if (dateien.length === 0) return;
      setFehler(null);

      const platz = MAX_ATTACHMENTS - attachments.length;
      if (platz <= 0) {
        setFehler(`At most ${MAX_ATTACHMENTS} files per message.`);
        return;
      }

      const beanstandet: string[] = [];
      if (dateien.length > platz) {
        beanstandet.push(`only the first ${platz} were taken`);
      }

      const texte: File[] = [];
      const bilder: File[] = [];

      for (const datei of dateien.slice(0, platz)) {
        const sorte = einordnen(datei);
        if (sorte === "image") {
          if (datei.size > IMAGE_MAX_BYTES) {
            beanstandet.push(
              `${datei.name} is larger than ${groesse(IMAGE_MAX_BYTES)}`,
            );
          } else {
            bilder.push(datei);
          }
        } else if (sorte === "text") {
          texte.push(datei);
        } else {
          beanstandet.push(`${datei.name} is not a supported type`);
        }
      }

      if (texte.length === 0 && bilder.length === 0) {
        setFehler(beanstandet.join(" · ") || "Nothing to attach.");
        return;
      }

      setLaedt(true);
      try {
        const gelesen = await Promise.all(texte.map(textLesen));
        const hochgeladen =
          bilder.length > 0 ? await bilderHochladen(bilder) : [];
        onAttachmentsChange((vorher) => [
          ...vorher,
          ...gelesen,
          ...hochgeladen,
        ]);
        if (beanstandet.length > 0) setFehler(beanstandet.join(" · "));
      } catch (ausnahme) {
        setFehler(
          ausnahme instanceof Error ? ausnahme.message : "Upload failed.",
        );
      } finally {
        setLaedt(false);
      }
    },
    [attachments.length, onAttachmentsChange],
  );

  const entfernen = React.useCallback(
    (id: string) => {
      setFehler(null);
      onAttachmentsChange((vorher) => vorher.filter((a) => a.id !== id));
    },
    [onAttachmentsChange],
  );

  const pluginBefehlAusfuehren = (eingabe: string): boolean => {
    const befehl = alsPluginBefehl(eingabe);
    if (!befehl) return false;

    const treffer = plugins.data?.plugins.find((p) => p.slug === befehl.slug);
    if (!treffer) {
      const nah = (plugins.data?.plugins ?? [])
        .filter(
          (p) => p.slug.includes(befehl.slug) || befehl.slug.includes(p.slug),
        )
        .slice(0, 3)
        .map((p) => p.slug);
      toast.error(
        nah.length > 0
          ? `No plugin \u201c${befehl.slug}\u201d. Did you mean ${nah.join(", ")}?`
          : `No plugin \u201c${befehl.slug}\u201d.`,
      );
      onValueChange("");
      return true;
    }

    const installieren = befehl.aktion === "install";
    if (installieren && !treffer.available) {
      toast.error(
        `${treffer.title} needs ${treffer.missing_requirements.join(", ") || "tools that are not loaded"}.`,
      );
      onValueChange("");
      return true;
    }

    pluginSchalten.mutate(
      { slug: treffer.slug, installed: installieren },
      {
        onSuccess: () =>
          toast.success(
            installieren
              ? `${treffer.title} installed.`
              : `${treffer.title} deactivated.`,
          ),
        onError: (fehler) => toast.error(fehler.message),
      },
    );
    onValueChange("");
    return true;
  };

  const submit = () => {
    if (!canSend) return;
    if (pluginBefehlAusfuehren(value)) return;
    playSend();
    onSubmit(zitat ? `${alsBlockzitat(zitat)}\n\n${value}` : value);
    setZitat(null);
  };

  const traegtDateien = (event: React.DragEvent) =>
    event.dataTransfer.types.includes("Files");

  const meldung = fehler ?? stimme.fehler;
  const zeigtEtwas =
    attachments.length > 0 || laedt || meldung !== null || zitat !== null;

  const slashMatches =
    slashQuery !== null ? filterCommands(slashQuery, "slash") : [];
  const slashOpen = slashQuery !== null && !nimmtAuf;

  return (
    <form
      data-tour="composer"
      className="group/composer relative isolate"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDragEnter={(event) => {
        if (!traegtDateien(event)) return;
        event.preventDefault();
        tiefeRef.current += 1;
        setUeberzogen(true);
      }}
      onDragOver={(event) => {
        if (traegtDateien(event)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!traegtDateien(event)) return;
        tiefeRef.current -= 1;
        if (tiefeRef.current <= 0) {
          tiefeRef.current = 0;
          setUeberzogen(false);
        }
      }}
      onDrop={(event) => {
        if (!traegtDateien(event)) return;
        event.preventDefault();
        tiefeRef.current = 0;
        setUeberzogen(false);
        void annehmen(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={dateiRef}
        type="file"
        multiple
        accept={DATEI_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const dateien = Array.from(event.target.files ?? []);
          event.target.value = "";
          void annehmen(dateien);
        }}
      />

      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-4 -z-10 rounded-[2.5rem] blur-2xl",
          "bg-primary/10 opacity-0 transition-opacity duration-500 dark:bg-primary/20",
          "group-focus-within/composer:opacity-100",
          nimmtAuf && "opacity-100",
        )}
      />

      <InputGroup
        data-aufnahme={nimmtAuf}
        className={cn(
          "composer-rahmen isolate overflow-hidden rounded-3xl",
          "bg-card/75 backdrop-blur-xl supports-backdrop-filter:bg-card/60",
          "shadow-xl shadow-black/5 ring-1 ring-border/70 dark:shadow-black/30",
          "transition-[box-shadow,background-color] duration-300",
          "group-focus-within/composer:shadow-2xl group-focus-within/composer:shadow-primary/10",
          "has-[[data-slot=input-group-control]:focus-visible]:border-transparent",
          "has-[[data-slot=input-group-control]:focus-visible]:ring-1",
          "has-[[data-slot=input-group-control]:focus-visible]:ring-border/70",
          ueberzogen && "ring-primary/60",
        )}
      >
        {zeigtEtwas ? (
          <InputGroupAddon
            align="block-start"
            className="flex-col items-start gap-2"
          >
            {zitat ? (
              <div className="group/zitat relative flex w-full gap-2.5 rounded-xl border border-border/60 bg-muted/40 py-2 pe-9 ps-3">
                <span
                  aria-hidden
                  className="absolute inset-y-2 inset-s-0 w-0.5 rounded-full bg-primary/50"
                />
                <TextQuoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium text-muted-foreground/80">
                    {zitat.role === "assistant" ? "Answer" : "Your message"}
                  </span>
                  <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {zitat.text}
                  </p>
                </div>
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove quote"
                  className="absolute inset-e-1.5 top-1.5 text-muted-foreground/60 hover:text-foreground"
                  onClick={() => setZitat(null)}
                >
                  <XIcon />
                </InputGroupButton>
              </div>
            ) : null}

            <AttachmentChips anhaenge={attachments} onEntfernen={entfernen} />

            {laedt ? (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <Loader2Icon className="size-3 animate-spin" />
                Attaching…
              </span>
            ) : null}

            {meldung ? (
              <span className="text-[11px] text-destructive">{meldung}</span>
            ) : null}
          </InputGroupAddon>
        ) : null}

        <InputGroupTextarea
          ref={textareaRef}
          value={value}
          rows={1}
          placeholder={
            stimme.zustand === "recording"
              ? "Listening…"
              : stimme.zustand === "transcribing"
                ? "Writing it down…"
                : attachments.length > 0
                  ? "Ask about the attached file…"
                  : "Ask anything…"
          }
          disabled={disabled}
          className={cn(
            "max-h-50 min-h-0 px-4 pt-4 text-base leading-relaxed md:text-[15px]",
            "placeholder:text-muted-foreground/45 placeholder:transition-colors",
            "group-focus-within/composer:placeholder:text-muted-foreground/60",
          )}
          onChange={(event) => {
            const next = event.target.value;
            onValueChange(next);
            setSlashQuery(nimmtAuf ? null : slashQueryOf(next));
            setSlashIndex(0);
          }}
          onPaste={(event) => {
            const dateien = Array.from(event.clipboardData.files);
            if (dateien.length === 0) return;
            event.preventDefault();
            void annehmen(dateien);
          }}
          onKeyDown={(event) => {
            if (nimmtAuf) return;

            if (slashOpen) {
              if (slashMatches.length === 0) {
                if (event.key === "Enter" || event.key === "Escape") {
                  event.preventDefault();
                  closeSlash();
                }
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSlashIndex((i) => (i + 1) % slashMatches.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSlashIndex(
                  (i) => (i - 1 + slashMatches.length) % slashMatches.length,
                );
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                runSlash(
                  slashMatches[Math.min(slashIndex, slashMatches.length - 1)],
                );
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeSlash();
                return;
              }
              return;
            }

            if (event.key === "Escape" && zitat) {
              event.preventDefault();
              setZitat(null);
              return;
            }

            if (event.key !== "Enter" || event.shiftKey) return;
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            submit();
          }}
          onBlur={closeSlash}
        />

        <InputGroupAddon align="block-end" className="gap-1.5 px-3 pb-3">
          {nimmtAuf ? (
            <>
              <span className="flex shrink-0 items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                {stimme.zustand === "recording" ? (
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
                    <span className="relative size-2 rounded-full bg-primary" />
                  </span>
                ) : (
                  <Loader2Icon className="size-3 shrink-0 animate-spin" />
                )}
                <span className="tabular-nums">
                  {stimme.zustand === "recording"
                    ? zeit(stimme.ms)
                    : "Transcribing…"}
                </span>
              </span>

              <VoiceLevel
                analyser={stimme.analyser}
                className={cn(
                  "mx-1 min-w-0 flex-1 justify-center transition-opacity",
                  stimme.zustand === "transcribing" && "opacity-30",
                )}
              />

              {stimme.zustand === "recording" ? (
                <>
                  <InputGroupButton
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Discard recording"
                    title="Discard recording"
                    className="cursor-pointer rounded-full text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive active:scale-90"
                    onClick={stimme.abbrechen}
                  >
                    <XIcon />
                  </InputGroupButton>
                  <InputGroupButton
                    type="button"
                    size="icon-sm"
                    variant="default"
                    aria-label="Stop and transcribe"
                    title="Stop and transcribe"
                    className="size-8 shrink-0 cursor-pointer rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 active:scale-90"
                    onClick={stimme.beenden}
                  >
                    <CheckIcon />
                  </InputGroupButton>
                </>
              ) : null}
            </>
          ) : (
            <>
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={disabled || laedt}
                data-tour="anhang"
                aria-label="Attach files"
                title="Attach files (Ctrl/Cmd+O)"
                className="cursor-pointer rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-90"
                onClick={dateiwahl}
              >
                <PaperclipIcon />
              </InputGroupButton>

              {stimme.verfuegbar ? (
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled}
                  data-tour="stimme"
                  aria-label="Record a message"
                  title="Record a message"
                  className="cursor-pointer rounded-full text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-90"
                  onClick={() => void stimme.starten()}
                >
                  <MicIcon />
                </InputGroupButton>
              ) : null}

              <InputGroupButton
                type="button"
                size={workspace ? "sm" : "icon-sm"}
                variant="ghost"
                data-tour="workspace"
                aria-label={
                  workspace
                    ? `Workspace: ${workspace.name}`
                    : "Choose a workspace"
                }
                title={
                  workspace
                    ? `Workspace: ${workspace.name}`
                    : "Choose a workspace"
                }
                className={cn(
                  "cursor-pointer rounded-full transition-all active:scale-90",
                  workspace
                    ? "max-w-40 gap-1.5 bg-primary/10 px-2.5 text-primary hover:bg-primary/15"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => dispatchCommand(BEFEHL.manageWorkspaces)}
              >
                <FolderGit2Icon />
                {workspace ? (
                  <span className="truncate text-[11px] font-medium">
                    {workspace.name}
                  </span>
                ) : null}
              </InputGroupButton>

              <InputGroupButton
                type="button"
                variant="ghost"
                size="xs"
                aria-label="Manage plugins"
                title="Plugins — which tools the model may use"
                className={cn(
                  "gap-1.5 rounded-full",
                  aktivePlugins > 0
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => dispatchCommand(BEFEHL.managePlugins)}
              >
                <WrenchIcon />
                {aktivePlugins > 0 ? (
                  <span className="text-[11px] font-medium">
                    {aktivePlugins}
                  </span>
                ) : null}
              </InputGroupButton>

              <div
                aria-hidden
                className={cn(
                  "hidden items-center text-[11px] font-medium text-muted-foreground/70 sm:flex",
                  "translate-x-1 opacity-0 transition-all duration-300",
                  "group-focus-within/composer:translate-x-0 group-focus-within/composer:opacity-100",
                )}
              >
                <span className="inline-flex items-center gap-1.5 pr-1">
                  <Kbd aria-label="Enter">
                    <CornerDownLeftIcon />
                  </Kbd>
                  <span className="tracking-tight">send</span>
                </span>

                <span
                  aria-hidden
                  className="mx-2 h-3 w-px rounded-full bg-current opacity-40"
                />

                <span className="inline-flex items-center gap-1.5 pl-1">
                  <KbdGroup>
                    <Kbd aria-label="Shift">
                      <ArrowBigUpIcon />
                    </Kbd>
                    <Kbd aria-label="Enter">
                      <CornerDownLeftIcon />
                    </Kbd>
                  </KbdGroup>
                  <span className="tracking-tight">new line</span>
                </span>
              </div>

              <span className="ml-auto">
                <ModelSelector
                  models={models}
                  groups={modelGroups}
                  value={model}
                  onChange={onModelChange}
                  disabled={disabled}
                />
              </span>

              <InputGroupButton
                type={isStreaming ? "button" : "submit"}
                size="icon-sm"
                variant={isStreaming ? "secondary" : "default"}
                disabled={!isStreaming && !canSend}
                aria-label={isStreaming ? "Stop response" : "Send message"}
                className={cn(
                  "relative ml-0.5 size-8 shrink-0 cursor-pointer rounded-full",
                  "transition-all duration-200 active:scale-90",
                  "disabled:opacity-100",
                  isStreaming
                    ? "bg-muted text-foreground hover:bg-muted/80"
                    : canSend
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110"
                      : "bg-muted/60 text-muted-foreground/40",
                )}
                onClick={isStreaming ? onStop : undefined}
              >
                {isStreaming ? (
                  <SquareIcon className="size-3 fill-current" />
                ) : (
                  <ArrowUpIcon className="size-4" />
                )}
              </InputGroupButton>
            </>
          )}
        </InputGroupAddon>
      </InputGroup>

      {slashOpen ? (
        <SlashMenu
          items={slashMatches}
          selectedIndex={Math.min(
            slashIndex,
            Math.max(0, slashMatches.length - 1),
          )}
          onSelect={runSlash}
          onHover={setSlashIndex}
        />
      ) : null}

      {ueberzogen ? (
        <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2.5 rounded-3xl bg-background/80 text-[13px] font-medium backdrop-blur-sm animate-in fade-in zoom-in-98 duration-150">
          <span className="flex items-center gap-2.5 rounded-full bg-primary/10 px-4 py-2 text-primary ring-1 ring-primary/30 ring-inset">
            <PaperclipIcon className="size-4" />
            Drop to attach
          </span>
        </span>
      ) : null}
    </form>
  );
}

function slashQueryOf(value: string): string | null {
  const last = value.split(/\s+/).pop() ?? "";
  return last.startsWith("/") ? last.slice(1) : null;
}

function zeit(ms: number): string {
  const gesamt = Math.floor(ms / 1000);
  return `${Math.floor(gesamt / 60)}:${String(gesamt % 60).padStart(2, "0")}`;
}
