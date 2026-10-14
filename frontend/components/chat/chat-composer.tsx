"use client";

import * as React from "react";
import {
  AudioLinesIcon,
  ArrowUpIcon,
  CheckIcon,
  CornerDownRightIcon,
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
import { AttachmentChips } from "@/components/chat/attachment-chips";
import { VoiceLevel } from "@/components/chat/voice-level";
import { ModelSelector } from "@/components/chat/model-selector";
import { SlashMenu } from "@/components/chat/slash-menu";
import { toast } from "sonner";

import { usePlugins, useSetPluginInstalled } from "@/hooks/use-plugins";
import { asPluginCommand } from "@/lib/chat/plugin-commands";
import { useSound } from "@/hooks/use-sound";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useTranscribe } from "@/hooks/use-transcribe";
import {
  COMMAND_EVENT,
  dispatchCommand,
  isShortcut,
  onCommand,
  onInsert,
  onQuote,
} from "@/lib/chat/commands";
import type { Quote } from "@/lib/chat/commands";
import {
  buildGeneratorTemplate,
  filterCommands,
  runCommand,
} from "@/lib/chat/command-registry";
import type { CommandEntry } from "@/lib/chat/command-registry";
import { selectActiveWorkspace, useWorkspaces } from "@/lib/workspaces/store";
import {
  prepareUploads,
  uploadFiles,
  uploadErrorMessage,
} from "@/lib/chat/attachments";
import type { Attachment, Model } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";

const MAX_HEIGHT = 200;
const SEND_SOUND = "/assets/sounds/send_message.mp3";

type ChatComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  callActive?: boolean;
  disabled?: boolean;
  models: Model[];
  modelGroups?: string[];
  model: string;
  onModelChange: (id: string) => void;
  attachments: Attachment[];
  onAttachmentsChange: React.Dispatch<React.SetStateAction<Attachment[]>>;
};

function asBlockquote({ text, role }: Quote, t: TranslateFn): string {
  const speaker =
    role === "assistant"
      ? t("chat.composer.quoteYourAnswer")
      : t("chat.composer.quoteMyMessage");
  return [`> **${speaker}:**`, ">", ...text.split("\n").map((line) => `> ${line}`)]
    .join("\n");
}

export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  isStreaming,
  callActive = false,
  disabled,
  models,
  modelGroups,
  model,
  onModelChange,
  attachments,
  onAttachmentsChange,
}: ChatComposerProps) {
  const t = useT();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const playSend = useSound(SEND_SOUND);

  const [loading, setLoading] = React.useState(false);
  const uploadingRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const depthRef = React.useRef(0);

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
        const previous = valueRef.current;
        onValueChange(previous ? `${previous}\n\n${text}` : text);
        textareaRef.current?.focus();
      }),
    [onValueChange],
  );

  const [quote, setQuote] = React.useState<Quote | null>(null);

  React.useEffect(
    () =>
      onQuote((next) => {
        setQuote(next);
        textareaRef.current?.focus();
      }),
    [],
  );

  const insertText = React.useCallback(
    (text: string) => {
      const previous = valueRef.current;
      const separator = previous && !/\s$/.test(previous) ? " " : "";
      onValueChange(previous + separator + text);
      textareaRef.current?.focus();
    },
    [onValueChange],
  );

  const voice = useTranscribe(insertText);
  const isRecording = voice.state !== "idle";
  const caps = useCapabilities();

  const workspace = useWorkspaces(selectActiveWorkspace);

  const plugins = usePlugins();
  const togglePlugin = useSetPluginInstalled();
  const activePlugins = plugins.data?.installed_count ?? 0;

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  React.useEffect(() => {
    if (isStreaming || callActive) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    textareaRef.current?.focus();
  }, [isStreaming, callActive]);

  const pickFiles = React.useCallback(() => {
    if (disabled || uploadingRef.current) return;
    if (!caps.uploads) {
      setError(t("chat.composer.uploadUnavailable"));
      return;
    }
    fileInputRef.current?.click();
  }, [disabled, caps.uploads, t]);

  React.useEffect(() => {
    if (disabled || loading) return;

    const onKey = (event: KeyboardEvent) => {
      if (isShortcut(event, "o")) {
        event.preventDefault();
        pickFiles();
        return;
      }
      if (isShortcut(event, "i") && voice.available) {
        event.preventDefault();
        void voice.start();
      }
    };

    window.addEventListener("keydown", onKey);
    const unsubFile = onCommand(COMMAND_EVENT.attachments, pickFiles);
    const unsubRecording = onCommand(COMMAND_EVENT.recordVoice, () => {
      if (voice.available) void voice.start();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      unsubFile();
      unsubRecording();
    };
  }, [pickFiles, disabled, loading, voice]);

  React.useEffect(() => {
    if (voice.state !== "recording") return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        voice.end();
      } else if (event.key === "Escape") {
        event.preventDefault();
        voice.cancel();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voice]);

  const canSend =
    value.trim().length > 0 && !disabled && !loading && !isRecording &&
    attachments.length <= caps.uploadsMaxFiles;

  const accept = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0 || disabled || uploadingRef.current) return;
      setError(null);
      if (!caps.uploads) {
        setError(t("chat.composer.uploadUnavailable"));
        return;
      }
      const limits = { maxBytes: caps.uploadsMaxBytes, maxFiles: caps.uploadsMaxFiles };
      const prepared = prepareUploads(files, limits, attachments.length);
      const rejected = prepared.errors.map((error) => uploadErrorMessage(error, t, limits));
      if (prepared.files.length === 0) {
        setError(rejected.join(" · ") || t("chat.composer.nothingToAttach"));
        return;
      }

      uploadingRef.current = true;
      setLoading(true);
      try {
        const uploaded = await uploadFiles(prepared.files);
        onAttachmentsChange((previous) => [
          ...previous,
          ...uploaded,
        ].slice(0, limits.maxFiles));
        if (rejected.length > 0) setError(rejected.join(" · "));
      } catch (err) {
        setError(uploadErrorMessage(err, t, limits));
      } finally {
        uploadingRef.current = false;
        setLoading(false);
      }
    },
    [attachments.length, onAttachmentsChange, disabled, caps.uploads, caps.uploadsMaxBytes, caps.uploadsMaxFiles, t],
  );

  const remove = React.useCallback(
    (id: string) => {
      setError(null);
      onAttachmentsChange((previous) => previous.filter((a) => a.id !== id));
    },
    [onAttachmentsChange],
  );

  const runPluginCommand = (input: string): boolean => {
    const command = asPluginCommand(input);
    if (!command) return false;

    const match = plugins.data?.plugins.find((p) => p.slug === command.slug);
    if (!match) {
      const similar = (plugins.data?.plugins ?? [])
        .filter(
          (p) => p.slug.includes(command.slug) || command.slug.includes(p.slug),
        )
        .slice(0, 3)
        .map((p) => p.slug);
      toast.error(
        similar.length > 0
          ? t("chat.composer.noPluginDidYouMean", { slug: command.slug, list: similar.join(", ") })
          : t("chat.composer.noPlugin", { slug: command.slug }),
      );
      onValueChange("");
      return true;
    }

    const install = command.action === "install";
    if (install && !match.available) {
      toast.error(
        t("chat.composer.pluginNeeds", { title: match.title, requirements: match.missing_requirements.join(", ") || t("chat.composer.pluginNeedsFallback") }),
      );
      onValueChange("");
      return true;
    }

    togglePlugin.mutate(
      { slug: match.slug, installed: install },
      {
        onSuccess: () =>
          toast.success(
            install
              ? t("chat.composer.pluginInstalled", { title: match.title })
              : t("chat.composer.pluginDeactivated", { title: match.title }),
          ),
        onError: (error) => toast.error(error.message),
      },
    );
    onValueChange("");
    return true;
  };

  const submit = () => {
    if (!canSend) return;
    if (runPluginCommand(value)) return;
    playSend();
    onSubmit(quote ? `${asBlockquote(quote, t)}\n\n${value}` : value);
    setQuote(null);
  };

  const hasFiles = (event: React.DragEvent) =>
    event.dataTransfer.types.includes("Files");

  const statusMessage = attachments.length > caps.uploadsMaxFiles
    ? t("chat.composer.atMostFiles", { max: caps.uploadsMaxFiles })
    : error ?? voice.error;
  const hasVisibleContent =
    attachments.length > 0 || loading || statusMessage !== null || quote !== null;

  const slashMatches =
    slashQuery !== null ? filterCommands(t, slashQuery, "slash", caps) : [];
  const slashOpen = slashQuery !== null && !isRecording;

  return (
    <form
      data-tour="composer"
      className="group/composer relative isolate"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depthRef.current += 1;
        setDragOver(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return;
        depthRef.current -= 1;
        if (depthRef.current <= 0) {
          depthRef.current = 0;
          setDragOver(false);
        }
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depthRef.current = 0;
        setDragOver(false);
        void accept(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        disabled={disabled || loading || !caps.uploads}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void accept(files);
        }}
      />

      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-4 -z-10 rounded-[2.5rem] blur-2xl",
          "bg-primary/10 opacity-0 transition-opacity duration-500 dark:bg-primary/20",
          "group-focus-within/composer:opacity-100",
          isRecording && "opacity-100",
        )}
      />

      {models.length > 0 ? (
        <div className="mb-2.5 flex min-w-0 md:hidden">
          <ModelSelector
            variant="chip"
            models={models}
            groups={modelGroups}
            value={model}
            onChange={onModelChange}
            disabled={disabled || isRecording}
          />
        </div>
      ) : null}

      <InputGroup
        data-recording={isRecording}
        className={cn(
          "composer-frame isolate overflow-hidden rounded-3xl",
          "bg-card/75 backdrop-blur-xl supports-backdrop-filter:bg-card/60",
          "shadow-xl shadow-black/5 ring-1 ring-border/70 dark:shadow-black/30",
          "transition-[box-shadow,background-color] duration-300",
          "group-focus-within/composer:shadow-2xl group-focus-within/composer:shadow-primary/10",
          "has-[[data-slot=input-group-control]:focus-visible]:border-transparent",
          "has-[[data-slot=input-group-control]:focus-visible]:ring-1",
          "has-[[data-slot=input-group-control]:focus-visible]:ring-border/70",
          dragOver && "ring-primary/60",
        )}
      >
        {hasVisibleContent ? (
          <InputGroupAddon
            align="block-start"
            className="flex-col items-start gap-2"
          >
            {quote ? (
              <div className="group/zitat relative flex w-full gap-2.5 rounded-xl border border-border/60 bg-muted/40 py-2 pe-9 ps-3">
                <span
                  aria-hidden
                  className="absolute inset-y-2 inset-s-0 w-0.5 rounded-full bg-primary/50"
                />
                <TextQuoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium text-muted-foreground/80">
                    {quote.role === "assistant" ? t("chat.composer.quoteAnswer") : t("chat.composer.quoteYourMessage")}
                  </span>
                  <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {quote.text}
                  </p>
                </div>
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("chat.composer.removeQuote")}
                  className="absolute inset-e-1.5 top-1.5 text-muted-foreground/60 hover:text-foreground"
                  onClick={() => setQuote(null)}
                >
                  <XIcon />
                </InputGroupButton>
              </div>
            ) : null}

            <AttachmentChips attachmentList={attachments} onRemove={remove} />

            {loading ? (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <Loader2Icon className="size-3 animate-spin" />
                {t("chat.composer.attaching")}
              </span>
            ) : null}

            {statusMessage ? (
              <span className="text-[11px] text-destructive">{statusMessage}</span>
            ) : null}
          </InputGroupAddon>
        ) : null}

        <InputGroupTextarea
          ref={textareaRef}
          value={value}
          rows={1}
          placeholder={
            voice.state === "recording"
              ? t("chat.composer.placeholderListening")
              : voice.state === "transcribing"
                ? t("chat.composer.placeholderWriting")
                : isStreaming
                  ? t("chat.composer.placeholderSteer")
                  : attachments.length > 0
                    ? t("chat.composer.placeholderAttached")
                    : t("chat.composer.placeholderDefault")
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
            setSlashQuery(isRecording ? null : slashQueryOf(next));
            setSlashIndex(0);
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length === 0) return;
            event.preventDefault();
            void accept(files);
          }}
          onKeyDown={(event) => {
            if (isRecording) return;

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

            if (event.key === "Escape" && quote) {
              event.preventDefault();
              setQuote(null);
              return;
            }

            if (event.key !== "Enter" || event.shiftKey) return;
            if (event.nativeEvent.isComposing) return;
            if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
            event.preventDefault();
            submit();
          }}
          onBlur={closeSlash}
        />

        <InputGroupAddon align="block-end" className="gap-1.5 px-3 pb-3">
          {isRecording ? (
            <>
              <span className="flex shrink-0 items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                {voice.state === "recording" ? (
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
                    <span className="relative size-2 rounded-full bg-primary" />
                  </span>
                ) : (
                  <Loader2Icon className="size-3 shrink-0 animate-spin" />
                )}
                <span className="tabular-nums">
                  {voice.state === "recording"
                    ? time(voice.ms)
                    : t("chat.composer.transcribing")}
                </span>
              </span>

              <VoiceLevel
                analyser={voice.analyser}
                className={cn(
                  "mx-1 min-w-0 flex-1 justify-center transition-opacity",
                  voice.state === "transcribing" && "opacity-30",
                )}
              />

              {voice.state === "recording" ? (
                <>
                  <InputGroupButton
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("chat.composer.discardRecording")}
                    title={t("chat.composer.discardRecording")}
                    className="cursor-pointer rounded-full text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive active:scale-90"
                    onClick={voice.cancel}
                  >
                    <XIcon />
                  </InputGroupButton>
                  <InputGroupButton
                    type="button"
                    size="icon-sm"
                    variant="default"
                    aria-label={t("chat.composer.stopTranscribe")}
                    title={t("chat.composer.stopTranscribe")}
                    className="size-8 shrink-0 cursor-pointer rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 active:scale-90"
                    onClick={voice.end}
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
                disabled={disabled || loading}
                data-tour="attach"
                aria-label={t("chat.composer.attachFiles")}
                title={t("chat.composer.attachFilesTitle")}
                className="cursor-pointer rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-90"
                onClick={pickFiles}
              >
                <PaperclipIcon />
              </InputGroupButton>

              {voice.available ? (
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled}
                  data-tour="voice"
                  aria-label={t("chat.composer.recordMessage")}
                  title={t("chat.composer.recordMessageTitle")}
                  className="cursor-pointer rounded-full text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-90"
                  onClick={() => void voice.start()}
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
                    ? t("chat.composer.workspaceLabel", { name: workspace.name })
                    : t("chat.composer.chooseWorkspace")
                }
                title={
                  workspace
                    ? t("chat.composer.workspaceLabel", { name: workspace.name })
                    : t("chat.composer.chooseWorkspace")
                }
                className={cn(
                  "cursor-pointer rounded-full transition-all active:scale-90",
                  workspace
                    ? "max-w-40 gap-1.5 bg-primary/10 px-2.5 text-primary hover:bg-primary/15"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => dispatchCommand(COMMAND_EVENT.manageWorkspaces)}
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
                aria-label={t("chat.composer.managePlugins")}
                title={t("chat.composer.pluginsTitle")}
                className={cn(
                  "cursor-pointer gap-1.5 rounded-full transition-all active:scale-90",
                  activePlugins > 0
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => dispatchCommand(COMMAND_EVENT.managePlugins)}
              >
                <WrenchIcon />
                {activePlugins > 0 ? (
                  <span className="text-[11px] font-medium">
                    {activePlugins}
                  </span>
                ) : null}
              </InputGroupButton>

              <span className="ml-auto flex">
                <span className="hidden md:inline-flex">
                  <ModelSelector
                    models={models}
                    groups={modelGroups}
                    value={model}
                    onChange={onModelChange}
                    disabled={disabled}
                  />
                </span>
              </span>

              {isStreaming ? (
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  aria-label={t("chat.composer.stopResponse")}
                  title={t("chat.composer.stopResponse")}
                  className="relative ml-0.5 size-8 max-md:size-9 shrink-0 cursor-pointer rounded-full bg-muted text-foreground transition-all duration-200 hover:bg-muted/80 active:scale-90"
                  onClick={onStop}
                >
                  <SquareIcon className="size-3 fill-current" />
                </InputGroupButton>
              ) : null}

              {!isStreaming && !canSend && voice.available && !disabled ? (
                <InputGroupButton
                  key="call"
                  type="button"
                  size="icon-sm"
                  variant="default"
                  data-tour="call"
                  aria-label={t("chat.composer.startVoiceCall")}
                  title={t("chat.composer.voiceCallTitle")}
                  className="relative ml-0.5 size-8 max-md:size-9 shrink-0 cursor-pointer rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-200 animate-in fade-in zoom-in-75 hover:brightness-110 active:scale-90"
                  onClick={() => dispatchCommand(COMMAND_EVENT.voiceCall)}
                >
                  <AudioLinesIcon className="size-4" />
                </InputGroupButton>
              ) : !isStreaming || canSend ? (
                <InputGroupButton
                  key="send"
                  type="submit"
                  size="icon-sm"
                  variant="default"
                  disabled={!canSend}
                  aria-label={
                    isStreaming ? t("chat.composer.addToRunning") : t("chat.composer.sendMessage")
                  }
                  title={
                    isStreaming
                      ? t("chat.composer.addToRunningTitle")
                      : t("chat.composer.sendTitle")
                  }
                  className={cn(
                    "relative ml-0.5 size-8 shrink-0 cursor-pointer rounded-full max-md:size-9",
                    "transition-all duration-200 active:scale-90",
                    "disabled:opacity-100",
                    canSend
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110"
                      : "bg-muted/60 text-muted-foreground/40",
                    "animate-in fade-in zoom-in-75 duration-150",
                  )}
                >
                  {isStreaming ? (
                    <CornerDownRightIcon className="size-4" />
                  ) : (
                    <ArrowUpIcon className="size-4" />
                  )}
                </InputGroupButton>
              ) : null}
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

      {dragOver ? (
        <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2.5 rounded-3xl bg-background/80 text-[13px] font-medium backdrop-blur-sm animate-in fade-in zoom-in-98 duration-150">
          <span className="flex items-center gap-2.5 rounded-full bg-primary/10 px-4 py-2 text-primary ring-1 ring-primary/30 ring-inset">
            <PaperclipIcon className="size-4" />
            {t("chat.composer.dropToAttach")}
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

function time(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
