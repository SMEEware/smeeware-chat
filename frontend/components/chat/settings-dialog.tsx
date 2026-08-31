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

/**
 * Die Einstellungen -- drei Reiter statt einer langen Spalte.
 *
 * Der Schnitt folgt dem, was man gerade vorhat: an Schaltern drehen, eine
 * Persona schreiben, oder das eigene Konto anfassen. Alles untereinander
 * hiesse, an einer Passwortaenderung vorbeizuscrollen, um einen Schalter
 * umzulegen.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (offen: boolean) => void;
}) {
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
              Settings
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground/60">
              Switches live on this machine, prompts on the server. Your account
              and API keys moved to Settings.
            </DialogDescription>
          </div>
        </DialogHeader>

        <Tabs defaultValue="general" className="relative gap-0">
          <TabsList
            variant="line"
            // relative: der gleitende Strich richtet sich an der Liste aus.
            // Die eingebauten Einzel-Striche der Reiter blenden wir aus --
            // es gibt jetzt genau einen, und der wandert.
            className="relative w-full justify-start gap-1 border-b border-border/60 px-5 pb-2 **:data-[slot=tabs-trigger]:after:hidden"
          >
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsIndicator />
          </TabsList>

          <AutoHoehe>
            <TabsContent value="general">
              <Allgemein />
            </TabsContent>
            <TabsContent value="prompts">
              <Prompts />
            </TabsContent>
          </AutoHoehe>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ein Kasten, dessen Hoehe der Inhalt mitnimmt -- statt beim Reiterwechsel zu
 * springen. Er misst den sichtbaren Inhalt (nur der aktive Reiter ist
 * gemountet) und faehrt seine Hoehe weich dorthin.
 *
 * Die Obergrenze -- frueher `max-h-[min(28rem,65vh)]` -- rechnen wir als Zahl
 * aus, damit ein zu grosser Inhalt an einem festen Wert kappt und der Rest
 * scrollt, statt dass die Animation an einer CSS-Grenze haengen bleibt.
 */
function AutoHoehe({ children }: { children: React.ReactNode }) {
  const innen = React.useRef<HTMLDivElement>(null);
  const [hoehe, setHoehe] = React.useState<number>();
  const [maxPx, setMaxPx] = React.useState(448); // 28rem
  const erste = React.useRef(true);
  const [uebergang, setUebergang] = React.useState(false);

  React.useEffect(() => {
    const rechne = () =>
      setMaxPx(Math.min(448, Math.round(window.innerHeight * 0.65)));
    rechne();
    window.addEventListener("resize", rechne);
    return () => window.removeEventListener("resize", rechne);
  }, []);

  // Der ResizeObserver feuert schon beim Beobachten mit der aktuellen Groesse
  // -- daher kein eigener Erst-Messwert im Effekt (den ruegt der Linter).
  React.useLayoutEffect(() => {
    const el = innen.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHoehe(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Uebergaenge erst nach der ersten Messung freischalten, sonst waechst der
  // Kasten beim Oeffnen sichtbar von 0 auf seine Hoehe.
  React.useEffect(() => {
    if (hoehe === undefined || !erste.current) return;
    erste.current = false;
    const id = requestAnimationFrame(() => setUebergang(true));
    return () => cancelAnimationFrame(id);
  }, [hoehe]);

  return (
    <div
      style={{ height: hoehe === undefined ? undefined : Math.min(hoehe, maxPx) }}
      className={cn(
        "overflow-y-auto overscroll-contain",
        uebergang &&
          "transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
      )}
    >
      <div ref={innen}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Allgemein                                                           */
/* ------------------------------------------------------------------ */

function Allgemein() {
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
      <Schalter
        icon={<BrainIcon className="size-4" />}
        titel="Show thinking"
        text="Reasoning models always think — this only decides whether you see it."
        an={thinking}
        onChange={setThinking}
      />
      <Schalter
        icon={<WrenchIcon className="size-4" />}
        titel="Tools"
        text="Let the model search, fetch pages, and run its other tools."
        an={tools}
        onChange={setTools}
      />
      <Schalter
        icon={<BellIcon className="size-4" />}
        titel="Notifications"
        text="Let the model raise a short notice outside the conversation. It is told to do this almost never."
        an={notifications}
        onChange={setNotifications}
      />

      <Spracheingabe />

      <Vorlesen />

      <Einfuehrung />

      <KontoVerweis />
    </div>
  );
}

/**
 * Der Weg zu allem, was das Konto betrifft.
 *
 * Frueher stand hier ein ganzer Reiter. Er ist auf eine eigene Seite
 * gezogen -- Profil, Passwort, API-Schluessel. Diese Zeile ist die Bruecke
 * dorthin, damit man aus dem Chat nicht erst ueber die Landing-Page muss.
 */
function KontoVerweis() {
  return (
    <Link
      href="/settings"
      className="group flex items-center gap-3 rounded-lg px-1 py-1"
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary">
        <UserIcon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">Account &amp; API keys</span>
        <span className="text-[11px] leading-relaxed text-muted-foreground/60">
          Profile, password, and the keys that let your backend go online.
        </span>
      </span>
      <ArrowUpRightIcon className="ms-auto size-4 shrink-0 text-muted-foreground/40 transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
    </Link>
  );
}

/**
 * Die Einfuehrung noch einmal ansehen.
 *
 * Sie laeuft von selbst genau einmal. Ohne diesen Knopf waere der einzige
 * Weg zurueck, den localStorage zu leeren -- und damit auch alles andere,
 * was dort steht.
 */
function Einfuehrung() {
  const { tourGesehen, setTourGesehen } = useSettings();

  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tourGesehen ? "text-muted-foreground/50" : "text-primary",
        )}
      >
        <CompassIcon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">Getting started</span>
        <span className="text-[11px] leading-relaxed text-muted-foreground/60">
          {tourGesehen
            ? "The short walkthrough of this window. It runs once, right after you create your account."
            : "Queued up — it starts the next time you open a chat."}
        </span>
      </span>
      <button
        type="button"
        disabled={!tourGesehen}
        onClick={() => setTourGesehen(false)}
        className="ms-auto mt-0.5 flex h-8 shrink-0 cursor-pointer items-center rounded-lg px-2.5 text-[12px] font-medium text-foreground/80 ring-1 ring-border/70 transition-colors ring-inset hover:text-primary hover:ring-primary/45 disabled:pointer-events-none disabled:opacity-40"
      >
        Show again
      </button>
    </div>
  );
}

/**
 * Womit Gesprochenes zu Text wird.
 *
 * Als Liste und nicht als Auswahlfeld: der Unterschied zwischen den
 * Eintraegen ist nicht der Name, sondern wo die Aufnahme hingeht -- und
 * das steht in der Beschreibung, die ein zugeklapptes Feld verstecken
 * wuerde.
 */
function Spracheingabe() {
  const modelle = useSttModels();
  const { transcribeModel, setTranscribeModel } = useSettings();

  const liste = modelle.data?.models ?? [];
  const standard = modelle.data?.default ?? "";
  const aktiv = transcribeModel ?? standard;

  if (modelle.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Ueberschrift />
        <p className="text-[11px] text-muted-foreground/60">Loading…</p>
      </div>
    );
  }

  if (liste.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Ueberschrift />
        <p className="text-[11px] leading-relaxed text-muted-foreground/60">
          Nothing available. Add an <span className="font-mono">OPENAI_API_KEY</span>{" "}
          to <span className="font-mono">backend/.env</span>, or install
          whisper.cpp for the local option.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Ueberschrift />
      <ul className="flex flex-col gap-px">
        {liste.map((eintrag) => {
          const gewaehlt = eintrag.id === aktiv;
          const lokal = eintrag.runtime === "local";
          return (
            <li key={eintrag.id}>
              <button
                type="button"
                onClick={() =>
                  // Das Default nicht festschreiben: so folgt die Wahl
                  // weiterhin dem Backend, wenn sich dort etwas aendert.
                  setTranscribeModel(eintrag.id === standard ? null : eintrag.id)
                }
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                  gewaehlt
                    ? "bg-primary/[0.07] ring-1 ring-primary/25 ring-inset"
                    : "hover:bg-sidebar-accent/40",
                )}
              >
                <CheckIcon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0 transition-opacity",
                    gewaehlt ? "text-primary opacity-100" : "opacity-0",
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    {eintrag.name}
                    {lokal ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-px text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                        <HardDriveIcon className="size-2.5" />
                        stays here
                      </span>
                    ) : null}
                    {eintrag.id === standard ? (
                      <span className="text-[10px] font-normal text-muted-foreground/50">
                        default
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground/60">
                    {eintrag.description}
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

function Ueberschrift() {
  return (
    <div className="flex items-center gap-2">
      <MicIcon className="size-4 text-muted-foreground/50" />
      <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
        Voice input
      </h3>
    </div>
  );
}

/**
 * Womit vorgelesen wird -- Modell und Stimme.
 *
 * Dieselbe Liste wie bei der Spracheingabe, plus ein Feld fuer die
 * ElevenLabs-Stimme. Die Stimme gilt nur fuer ElevenLabs; der gratis
 * Rueckfall kennt keine Auswahl, deshalb steht das Feld nur dann, wenn ein
 * ElevenLabs-Modell gewaehlt ist.
 */
function Vorlesen() {
  const modelle = useTtsModels();
  const { ttsModel, setTtsModel, voiceId, setVoiceId } = useSettings();

  const liste = modelle.data?.models ?? [];
  const standard = modelle.data?.default ?? "";
  const aktiv = ttsModel ?? standard;
  const vorgabeStimme = modelle.data?.default_voice ?? "";
  const aktivEintrag = liste.find((e) => e.id === aktiv);
  const istElevenlabs = aktivEintrag?.runtime === "elevenlabs";

  const kopf = (
    <div className="flex items-center gap-2">
      <Volume2Icon className="size-4 text-muted-foreground/50" />
      <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
        Read aloud
      </h3>
    </div>
  );

  if (modelle.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {kopf}
        <p className="text-[11px] text-muted-foreground/60">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {kopf}
      <ul className="flex flex-col gap-px">
        {liste.map((eintrag) => {
          const gewaehlt = eintrag.id === aktiv;
          const gratis = eintrag.runtime === "free";
          return (
            <li key={eintrag.id}>
              <button
                type="button"
                // Immer die konkrete id speichern, nie null-fuer-Vorgabe wie
                // bei der Spracheingabe: die Modellliste wird eine Sitzung
                // lang zwischengespeichert, und ihr ``default`` kann von dem
                // abweichen, was das Backend gerade wirklich als Vorgabe
                // nimmt (z. B. weil der Schluessel spaeter dazukam). Wer hier
                // waehlt, soll genau das bekommen -- nicht "was auch immer
                // die Vorgabe war, als die Liste geladen wurde".
                onClick={() => setTtsModel(eintrag.id)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                  gewaehlt
                    ? "bg-primary/[0.07] ring-1 ring-primary/25 ring-inset"
                    : "hover:bg-sidebar-accent/40",
                )}
              >
                <CheckIcon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0 transition-opacity",
                    gewaehlt ? "text-primary opacity-100" : "opacity-0",
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    {eintrag.name}
                    {gratis ? (
                      <span className="inline-flex items-center rounded-full bg-muted/70 px-1.5 py-px text-[9px] font-medium text-muted-foreground/70">
                        no key
                      </span>
                    ) : null}
                    {eintrag.id === standard ? (
                      <span className="text-[10px] font-normal text-muted-foreground/50">
                        default
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground/60">
                    {eintrag.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Die Stimme nur, wenn ElevenLabs spricht -- der gratis Dienst hat
          keine Auswahl. Der Platzhalter zeigt die Vorgabe aus der .env. */}
      {istElevenlabs ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <label className="text-[11px] text-muted-foreground/70">
            ElevenLabs voice ID
          </label>
          <input
            value={voiceId}
            onChange={(event) => setVoiceId(event.target.value.trim())}
            placeholder={vorgabeStimme || "Default voice"}
            spellCheck={false}
            className="h-9 rounded-lg bg-muted/40 px-3 font-mono text-[12px] outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
          />
          <p className="text-[10px] leading-relaxed text-muted-foreground/50">
            Find voice IDs in your ElevenLabs dashboard (Voices). Leave empty for
            the default.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Schalter({
  icon,
  titel,
  text,
  an,
  onChange,
}: {
  icon: React.ReactNode;
  titel: string;
  text: string;
  an: boolean;
  onChange: (wert: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span
        className={cn(
          "mt-0.5 shrink-0 transition-colors",
          an ? "text-primary" : "text-muted-foreground/50",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">{titel}</span>
        <span className="text-[11px] leading-relaxed text-muted-foreground/60">
          {text}
        </span>
      </span>
      <Switch checked={an} onCheckedChange={onChange} className="ms-auto mt-1" />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

/**
 * Die Personas -- waehlen, schreiben, wegwerfen.
 *
 * Jeder Prompt ist eine .md-Datei im Backend. Das Anlegen legt eine an,
 * das Loeschen entfernt sie; das Auswaehlen bestimmt nur, welche der
 * naechste Turn benutzt, und bleibt auf diesem Rechner.
 */
function Prompts() {
  const prompts = usePrompts();
  const { speichern, loeschen } = usePromptActions();
  const { prompt, setPrompt } = useSettings();

  // null = nichts offen, "" = neuer Prompt, sonst der Name des bearbeiteten.
  const [bearbeitet, setBearbeitet] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");

  const geladen = usePromptText(bearbeitet || null);

  // null heisst "noch nichts getippt" -- dann gilt, was geladen wurde.
  // Abgeleitet statt in einen Effekt kopiert: ein setState auf geladene
  // Daten loeste eine zweite Renderrunde aus und wuerde ausserdem
  // ueberschreiben, was jemand in der Zwischenzeit geschrieben hat.
  const [entwurf, setEntwurf] = React.useState<string | null>(null);
  const text = entwurf ?? geladen.data?.text ?? "";
  const setText = setEntwurf;

  const liste = prompts.data?.prompts ?? [];
  const standard = prompts.data?.default ?? "default";
  const aktiv = prompt ?? standard;

  const oeffnen = (fuer: string) => {
    setBearbeitet(fuer);
    setName(fuer);
    // Beim Oeffnen zurueck auf "noch nichts getippt": ein neuer Prompt
    // startet leer, ein bestehender mit dem, was geladen wird.
    setEntwurf(fuer === "" ? "" : null);
  };

  const abbrechen = () => {
    setBearbeitet(null);
    setName("");
    setEntwurf(null);
    speichern.reset();
  };

  const absenden = async (event: React.FormEvent) => {
    event.preventDefault();
    await speichern.mutateAsync({ name: name.trim(), text });
    abbrechen();
  };

  if (bearbeitet !== null) {
    const neu = bearbeitet === "";
    return (
      <form onSubmit={absenden} className="flex flex-col gap-3 px-5 py-5">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
            {neu ? "New prompt" : `Editing ${promptLabel(bearbeitet)}`}
          </h3>
        </div>

        {neu ? (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="File name, e.g. pirate"
            autoFocus
            className="h-9 rounded-lg bg-muted/40 px-3 font-mono text-[12px] outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
          />
        ) : null}

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            geladen.isLoading ? "Loading…" : "# Persona\n\nHow it should answer…"
          }
          rows={12}
          className="resize-y rounded-lg bg-muted/40 p-3 font-mono text-[12px] leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
        />

        <p className="text-[11px] leading-relaxed text-muted-foreground/50">
          Saved as{" "}
          <span className="font-mono">{(name || "…").trim()}.md</span> in the
          backend&apos;s prompts folder. Placeholders like{" "}
          <span className="font-mono">{"{{GEHEIMNIS}}"}</span> stay as they
          are and are filled in when the prompt is loaded.
        </p>

        {speichern.error ? (
          <p className="text-[11px] text-destructive">
            {speichern.error.message}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!name.trim() || !text.trim() || speichern.isPending}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            {speichern.isPending ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            Save
          </button>
          <button
            type="button"
            onClick={abbrechen}
            className="h-8 cursor-pointer rounded-lg px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-5">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
          Personas
        </h3>
        <button
          type="button"
          onClick={() => oeffnen("")}
          className="ms-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground/70 ring-1 ring-border/70 transition-colors ring-inset hover:text-primary hover:ring-primary/40"
        >
          <PlusIcon className="size-3.5" />
          New
        </button>
      </div>

      {prompts.isLoading ? (
        <p className="text-[11px] text-muted-foreground/60">Loading…</p>
      ) : liste.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60">
          No prompts found.
        </p>
      ) : (
        <ul className="flex flex-col gap-px">
          {liste.map((eintrag) => (
            <li key={eintrag.name} className="group/prompt relative">
              <button
                type="button"
                onClick={() =>
                  setPrompt(eintrag.name === standard ? null : eintrag.name)
                }
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2.5 rounded-lg py-2 pr-16 pl-2 text-left transition-colors",
                  eintrag.name === aktiv
                    ? "bg-primary/[0.07] ring-1 ring-primary/25 ring-inset"
                    : "hover:bg-sidebar-accent/40",
                )}
              >
                <CheckIcon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0 transition-opacity",
                    eintrag.name === aktiv
                      ? "text-primary opacity-100"
                      : "opacity-0",
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium">
                    {promptLabel(eintrag.name)}
                    {eintrag.name === standard ? (
                      <span className="ms-1.5 text-[10px] font-normal text-muted-foreground/50">
                        default
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">
                    {eintrag.title}
                  </span>
                </span>
              </button>

              <span className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover/prompt:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                <button
                  type="button"
                  onClick={() => oeffnen(eintrag.name)}
                  aria-label={`Edit ${eintrag.name}`}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <PencilLineIcon className="size-3.5" />
                </button>
                {/* Das Default bleibt: ohne es haette jeder Chat ohne
                    eigene Wahl keine Persona mehr. */}
                {eintrag.name !== standard ? (
                  <button
                    type="button"
                    onClick={() => loeschen.mutate(eintrag.name)}
                    aria-label={`Delete ${eintrag.name}`}
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

      {loeschen.error ? (
        <p className="text-[11px] text-destructive">{loeschen.error.message}</p>
      ) : null}
    </div>
  );
}
