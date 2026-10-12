"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  BellIcon,
  BrainIcon,
  CheckIcon,
  CompassIcon,
  HardDriveIcon,
  MicIcon,
  Volume2Icon,
  Loader2Icon,
  PencilLineIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  usePromptActions,
  usePromptText,
  usePrompts,
} from "@/hooks/use-prompts";
import { useSttModels } from "@/hooks/use-stt-models";
import { useTtsModels } from "@/hooks/use-tts-models";
import { promptLabel, useSettings } from "@/lib/settings/store";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/context/i18n-provider";
import { languageName } from "@/lib/i18n/language-name";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-2xl bg-background/95 p-0 shadow-2xl shadow-black/20 ring-1 ring-border/70 backdrop-blur-xl ring-inset sm:max-w-2xl dark:shadow-black/50">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/20 opacity-40 blur-3xl"
        />

        <DialogHeader className="relative flex-row items-start gap-3 space-y-0 px-5 pt-5 pb-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SettingsIcon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <DialogTitle className="font-heading text-[15px] font-semibold tracking-tight">
              {t("settingsDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground/60">
              {t("settingsDialog.desc")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <Tabs defaultValue="general" className="relative gap-0">
          <TabsList
            variant="line"
            className="relative w-full justify-start gap-1 border-b border-border/60 px-5 pb-2 **:data-[slot=tabs-trigger]:after:hidden"
          >
            <TabsTrigger value="general">{t("settingsDialog.tabGeneral")}</TabsTrigger>
            <TabsTrigger value="prompts">{t("settingsDialog.tabPrompts")}</TabsTrigger>
            <TabsIndicator />
          </TabsList>

          <AutoHeight>
            <TabsContent value="general">
              <GeneralTab />
            </TabsContent>
            <TabsContent value="prompts">
              <Prompts />
            </TabsContent>
          </AutoHeight>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function AutoHeight({ children }: { children: React.ReactNode }) {
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number>();
  const [maxPx, setMaxPx] = React.useState(448);
  const firstRef = React.useRef(true);
  const [transition, setTransition] = React.useState(false);

  React.useEffect(() => {
    const compute = () =>
      setMaxPx(Math.min(448, Math.round(window.innerHeight * 0.65)));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    if (height === undefined || !firstRef.current) return;
    firstRef.current = false;
    const id = requestAnimationFrame(() => setTransition(true));
    return () => cancelAnimationFrame(id);
  }, [height]);

  return (
    <div
      style={{ height: height === undefined ? undefined : Math.min(height, maxPx) }}
      className={cn(
        "overflow-y-auto overscroll-contain",
        transition &&
          "transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
      )}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

function GeneralTab() {
  const t = useT();
  const {
    thinking,
    tools,
    notifications,
    setThinking,
    setTools,
    setNotifications,
  } = useSettings();

  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      <ToggleRow
        icon={<BrainIcon className="size-4" />}
        title={t("settingsDialog.showThinking")}
        text={t("settingsDialog.showThinkingText")}
        enabled={thinking}
        onChange={setThinking}
      />
      <ToggleRow
        icon={<WrenchIcon className="size-4" />}
        title={t("settingsDialog.tools")}
        text={t("settingsDialog.toolsText")}
        enabled={tools}
        onChange={setTools}
      />
      <ToggleRow
        icon={<BellIcon className="size-4" />}
        title={t("settingsDialog.notifications")}
        text={t("settingsDialog.notificationsText")}
        enabled={notifications}
        onChange={setNotifications}
      />

      <SpeechInputSection />

      <ReadAloudSection />

      <IntroSection />

      <AccountLink />
    </div>
  );
}

function AccountLink() {
  const t = useT();
  return (
    <Link
      href="/settings"
      className="group flex items-center gap-3 rounded-lg px-1 py-1"
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary">
        <UserIcon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">{t("settingsDialog.accountKeys")}</span>
        <span className="text-[11px] leading-relaxed text-muted-foreground/60">
          {t("settingsDialog.accountKeysText")}
        </span>
      </span>
      <ArrowUpRightIcon className="ms-auto size-4 shrink-0 text-muted-foreground/40 transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
    </Link>
  );
}

function IntroSection() {
  const t = useT();
  const { tourSeen, setTourSeen } = useSettings();

  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tourSeen ? "text-muted-foreground/50" : "text-primary",
        )}
      >
        <CompassIcon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">{t("settingsDialog.gettingStarted")}</span>
        <span className="text-[11px] leading-relaxed text-muted-foreground/60">
          {tourSeen
            ? t("settingsDialog.introSeen")
            : t("settingsDialog.introQueued")}
        </span>
      </span>
      <button
        type="button"
        disabled={!tourSeen}
        onClick={() => setTourSeen(false)}
        className="ms-auto mt-0.5 flex h-8 shrink-0 cursor-pointer items-center rounded-lg px-2.5 text-[12px] font-medium text-foreground/80 ring-1 ring-border/70 transition-colors ring-inset hover:text-primary hover:ring-primary/45 disabled:pointer-events-none disabled:opacity-40"
      >
        {t("settingsDialog.showAgain")}
      </button>
    </div>
  );
}

function useModelText() {
  const t = useT();
  return (id: string, fallback: string) => {
    const key = `settingsDialog.models.${id}`;
    const text = t(key);
    return text === key ? fallback : text;
  };
}

function SpeechInputSection() {
  const t = useT();
  const describe = useModelText();
  const models = useSttModels();
  const { transcribeModel, setTranscribeModel } = useSettings();

  const list = models.data?.models ?? [];
  const standard = models.data?.default ?? "";
  const active = list.some((e) => e.id === transcribeModel) ? transcribeModel! : standard;

  if (models.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <SectionHeading />
        <p className="text-[11px] text-muted-foreground/60">{t("common.loading")}</p>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <SectionHeading />
        <p className="text-[11px] leading-relaxed text-muted-foreground/60">
          {t("settingsDialog.sttNothingPre")}{" "}
          <span className="font-mono">OPENAI_API_KEY</span>{" "}
          {t("settingsDialog.sttNothingMid")}{" "}
          <span className="font-mono">backend/.env</span>
          {t("settingsDialog.sttNothingPost")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionHeading />
      <ul className="flex flex-col gap-px">
        {list.map((entry) => {
          const selected = entry.id === active;
          const local = entry.runtime === "local";
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() =>
                  setTranscribeModel(entry.id === standard ? null : entry.id)
                }
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                  selected
                    ? "bg-primary/[0.07] ring-1 ring-primary/25 ring-inset"
                    : "hover:bg-sidebar-accent/40",
                )}
              >
                <CheckIcon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0 transition-opacity",
                    selected ? "text-primary opacity-100" : "opacity-0",
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    {entry.name}
                    {local ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-px text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                        <HardDriveIcon className="size-2.5" />
                        {t("settingsDialog.staysHere")}
                      </span>
                    ) : null}
                    {entry.id === standard ? (
                      <span className="text-[10px] font-normal text-muted-foreground/50">
                        {t("settingsDialog.default")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground/60">
                    {describe(entry.id, entry.description)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SectionHeading() {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <MicIcon className="size-4 text-muted-foreground/50" />
      <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
        {t("settingsDialog.voiceInput")}
      </h3>
    </div>
  );
}

function ReadAloudSection() {
  const t = useT();
  const locale = useLocale();
  const describe = useModelText();
  const models = useTtsModels();
  const { ttsModel, setTtsModel, voiceId, setVoiceId } = useSettings();

  const list = models.data?.models ?? [];
  const standard = models.data?.default ?? "";
  const active = list.some((e) => e.id === ttsModel) ? ttsModel! : standard;
  const defaultVoice = models.data?.default_voice ?? "";
  const activeEntry = list.find((e) => e.id === active);
  const isElevenlabs = activeEntry?.runtime === "elevenlabs";
  const onlyFree = list.length > 0 && list.every((e) => e.runtime === "free");

  const header = (
    <div className="flex items-center gap-2">
      <Volume2Icon className="size-4 text-muted-foreground/50" />
      <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
        {t("settingsDialog.readAloud")}
      </h3>
    </div>
  );

  if (models.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <p className="text-[11px] text-muted-foreground/60">{t("common.loading")}</p>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <p className="text-[11px] leading-relaxed text-muted-foreground/60">
          {t("settingsDialog.readAloudOff")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {header}
      <ul className="flex flex-col gap-px">
        {list.map((entry) => {
          const selected = entry.id === active;
          const free = entry.runtime === "free";
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setTtsModel(entry.id)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                  selected
                    ? "bg-primary/[0.07] ring-1 ring-primary/25 ring-inset"
                    : "hover:bg-sidebar-accent/40",
                )}
              >
                <CheckIcon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0 transition-opacity",
                    selected ? "text-primary opacity-100" : "opacity-0",
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    {free ? t("settingsDialog.freeVoiceName") : entry.name}
                    {free ? (
                      <span className="inline-flex items-center rounded-full bg-muted/70 px-1.5 py-px text-[9px] font-medium text-muted-foreground/70">
                        {t("settingsDialog.freeOnly", {
                          language: languageName(locale, entry.language ?? "en"),
                        })}
                      </span>
                    ) : null}
                    {entry.id === standard ? (
                      <span className="text-[10px] font-normal text-muted-foreground/50">
                        {t("settingsDialog.default")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground/60">
                    {describe(entry.id, entry.description)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {onlyFree ? (
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground/60">
          {t("settingsDialog.upgradePre")}{" "}
          <span className="font-mono">ELEVENLABS_API_KEY</span>{" "}
          {t("settingsDialog.upgradeMid")}{" "}
          <span className="font-mono">backend/.env</span>
          {t("settingsDialog.upgradePost")}
        </p>
      ) : null}

      {isElevenlabs ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <label className="text-[11px] text-muted-foreground/70">
            {t("settingsDialog.elevenVoiceId")}
          </label>
          <input
            value={voiceId}
            onChange={(event) => setVoiceId(event.target.value.trim())}
            placeholder={defaultVoice || t("settingsDialog.defaultVoice")}
            spellCheck={false}
            className="h-9 rounded-lg bg-muted/40 px-3 font-mono text-[12px] outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
          />
          <p className="text-[10px] leading-relaxed text-muted-foreground/50">
            {t("settingsDialog.voiceIdHelp")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  text,
  enabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span
        className={cn(
          "mt-0.5 shrink-0 transition-colors",
          enabled ? "text-primary" : "text-muted-foreground/50",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="text-[11px] leading-relaxed text-muted-foreground/60">
          {text}
        </span>
      </span>
      <Switch checked={enabled} onCheckedChange={onChange} className="ms-auto mt-1" />
    </label>
  );
}

function Prompts() {
  const t = useT();
  const prompts = usePrompts();
  const { save, pendingDelete } = usePromptActions();
  const { prompt, setPrompt } = useSettings();

  const [edited, setEdited] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");

  const loaded = usePromptText(edited || null);

  const [draft, setDraft] = React.useState<string | null>(null);
  const text = draft ?? loaded.data?.text ?? "";
  const setText = setDraft;

  const list = prompts.data?.prompts ?? [];
  const standard = prompts.data?.default ?? "default";
  const active = prompt ?? standard;

  const openPrompt = (promptName: string) => {
    setEdited(promptName);
    setName(promptName);
    setDraft(promptName === "" ? "" : null);
  };

  const cancel = () => {
    setEdited(null);
    setName("");
    setDraft(null);
    save.reset();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await save.mutateAsync({ name: name.trim(), text });
    cancel();
  };

  if (edited !== null) {
    const next = edited === "";
    return (
      <form onSubmit={submit} className="flex flex-col gap-3 px-5 py-5">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
            {next ? t("settingsDialog.newPrompt") : t("settingsDialog.editing", { name: promptLabel(edited) })}
          </h3>
        </div>

        {next ? (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("settingsDialog.fileNamePlaceholder")}
            autoFocus
            className="h-9 rounded-lg bg-muted/40 px-3 font-mono text-[12px] outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
          />
        ) : null}

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            loaded.isLoading ? t("common.loading") : t("settingsDialog.personaPlaceholder")
          }
          rows={12}
          className="resize-y rounded-lg bg-muted/40 p-3 font-mono text-[12px] leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
        />

        <p className="text-[11px] leading-relaxed text-muted-foreground/50">
          {t("settingsDialog.savedAsPre")}{" "}
          <span className="font-mono">{(name || "…").trim()}.md</span>{" "}
          {t("settingsDialog.savedAsMid")}{" "}
          <span className="font-mono">{"{{SECRET}}"}</span>{" "}
          {t("settingsDialog.savedAsPost")}
        </p>

        {save.error ? (
          <p className="text-[11px] text-destructive">
            {save.error.message}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!name.trim() || !text.trim() || save.isPending}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            {save.isPending ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            {t("settingsDialog.save")}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="h-8 cursor-pointer rounded-lg px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("settingsDialog.cancel")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-5">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
          {t("settingsDialog.personas")}
        </h3>
        <button
          type="button"
          onClick={() => openPrompt("")}
          className="ms-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground/70 ring-1 ring-border/70 transition-colors ring-inset hover:text-primary hover:ring-primary/40"
        >
          <PlusIcon className="size-3.5" />
          {t("settingsDialog.new")}
        </button>
      </div>

      <p className="-mt-1 text-[11px] leading-relaxed text-muted-foreground/60">
        {t("settingsDialog.personasText")}
      </p>

      {prompts.isLoading ? (
        <p className="text-[11px] text-muted-foreground/60">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60">
          {t("settingsDialog.noPrompts")}
        </p>
      ) : (
        <ul className="flex flex-col gap-px">
          {list.map((entry) => (
            <li key={entry.name} className="group/prompt relative">
              <button
                type="button"
                onClick={() =>
                  setPrompt(entry.name === standard ? null : entry.name)
                }
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2.5 rounded-lg py-2 pr-16 pl-2 text-left transition-colors",
                  entry.name === active
                    ? "bg-primary/[0.07] ring-1 ring-primary/25 ring-inset"
                    : "hover:bg-sidebar-accent/40",
                )}
              >
                <CheckIcon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0 transition-opacity",
                    entry.name === active
                      ? "text-primary opacity-100"
                      : "opacity-0",
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium">
                    {promptLabel(entry.name)}
                    {entry.name === standard ? (
                      <span className="ms-1.5 text-[10px] font-normal text-muted-foreground/50">
                        {t("settingsDialog.default")}
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">
                    {entry.title}
                  </span>
                </span>
              </button>

              <span className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover/prompt:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                <button
                  type="button"
                  onClick={() => openPrompt(entry.name)}
                  aria-label={t("settingsDialog.editPrompt", { name: entry.name })}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <PencilLineIcon className="size-3.5" />
                </button>
                {entry.name !== standard ? (
                  <button
                    type="button"
                    onClick={() => pendingDelete.mutate(entry.name)}
                    aria-label={t("settingsDialog.deletePrompt", { name: entry.name })}
                    className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete.error ? (
        <p className="text-[11px] text-destructive">{pendingDelete.error.message}</p>
      ) : null}
    </div>
  );
}
