"use client";

import * as React from "react";
import {
  ArrowBigUpIcon,
  ArrowUpIcon,
  CheckIcon,
  CornerDownLeftIcon,
  Loader2Icon,
  MicIcon,
  PaperclipIcon,
  SquareIcon,
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
import { useSound } from "@/hooks/use-sound";
import { useTranscribe } from "@/hooks/use-transcribe";
import { BEFEHL, istKuerzel, onBefehl } from "@/lib/chat/commands";
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
  /** Reihenfolge der Ueberschriften im Auswahlfeld. */
  modelGroups?: string[];
  model: string;
  onModelChange: (id: string) => void;
  attachments: Attachment[];
  /** Ein Setter, kein Wert: das Annehmen laeuft asynchron, ein
   *  mitgeschleppter alter Stand wuerde parallele Uploads verschlucken. */
  onAttachmentsChange: React.Dispatch<React.SetStateAction<Attachment[]>>;
};

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

  // Ein Zaehler statt eines Schalters: dragleave feuert auch beim Wechsel
  // zwischen Kindelementen, ein blosses false wuerde dabei flackern.
  const tiefeRef = React.useRef(0);

  // Der Text kann waehrend der Aufnahme weitergetippt werden. Ohne Ref
  // haenge das Einfuegen an dem Stand, der beim Start des Recorders galt --
  // und wuerde alles verschlucken, was seither dazukam.
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  /** Das Transkript hinten anhaengen, nicht ersetzen. */
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

  // Waechst mit dem Text mit, bis MAX_HEIGHT -- danach scrollt das Feld.
  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  // Nach dem Turn zurueck ins Feld, damit man direkt weiterschreiben kann.
  React.useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus();
  }, [isStreaming]);

  const dateiwahl = React.useCallback(() => dateiRef.current?.click(), []);

  // Cmd/Strg+O oeffnet den Dateidialog (O wie open), Cmd/Strg+I startet die
  // Aufnahme. Beide hoeren zusaetzlich auf das Ereignis aus der Palette, so
  // dass Kuerzel und Palettenzeile denselben Weg nehmen.
  //
  // preventDefault ist bei O nicht optional: der Browser legt auf dieselbe
  // Taste sein eigenes "Datei oeffnen", das die Seite verliesse.
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
    const abDatei = onBefehl(BEFEHL.anhaenge, dateiwahl);
    const abAufnahme = onBefehl(BEFEHL.aufnahme, () => void stimme.starten());
    return () => {
      window.removeEventListener("keydown", aufTaste);
      abDatei();
      abAufnahme();
    };
  }, [dateiwahl, disabled, laedt, stimme]);

  // Waehrend der Aufnahme haben Enter und Escape eine andere Bedeutung:
  // abschliessen und verwerfen. Am Fenster und nicht am Textfeld, weil
  // beim Sprechen selten der Cursor im Feld steht.
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

  /**
   * Dateien annehmen -- egal ob aus dem Dialog, vom Ziehen oder aus der
   * Zwischenablage. Text wird hier gelesen, Bilder gehen ans Backend; was
   * weder das eine noch das andere ist, wird benannt und abgelehnt statt
   * still verschluckt.
   */
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

  // Ein Weg raus fuer Button und Enter -- damit der Sound an genau einer
  // Stelle haengt und nicht an zwei auseinanderlaufenden.
  const submit = () => {
    if (!canSend) return;
    playSend();
    onSubmit(value);
  };

  const traegtDateien = (event: React.DragEvent) =>
    event.dataTransfer.types.includes("Files");

  const meldung = fehler ?? stimme.fehler;
  const zeigtEtwas = attachments.length > 0 || laedt || meldung !== null;

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
          // Zuruecksetzen, sonst loest dieselbe Datei kein zweites Mal aus.
          event.target.value = "";
          void annehmen(dateien);
        }}
      />

      {/* Ein weicher Schein hinter dem Feld, der beim Fokus aufgeht. Er
          liegt hinter allem und faerbt die Flaeche darunter leicht in der
          Markenfarbe -- das ist der Unterschied zwischen "Kasten auf Seite"
          und "Feld, das gerade dran ist". */}
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
          // Glas statt Karte: der Verlauf scrollt sichtbar darunter durch,
          // statt an einer harten Kante zu verschwinden.
          "bg-card/75 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60",
          "shadow-xl shadow-black/5 ring-1 ring-border/70 dark:shadow-black/30",
          "transition-[box-shadow,background-color] duration-300",
          "group-focus-within/composer:shadow-2xl group-focus-within/composer:shadow-primary/10",
          // Der eigene Fokusring der Komponente faellt weg -- an seiner
          // Stelle steht jetzt der wandernde Rahmen.
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
          onChange={(event) => onValueChange(event.target.value)}
          onPaste={(event) => {
            // Ein Screenshot aus der Zwischenablage ist der haeufigste
            // Anhang ueberhaupt -- er soll nicht den Umweg ueber den
            // Dateidialog brauchen.
            const dateien = Array.from(event.clipboardData.files);
            if (dateien.length === 0) return;
            event.preventDefault();
            void annehmen(dateien);
          }}
          onKeyDown={(event) => {
            // Waehrend der Aufnahme gehoert Enter dem Abschliessen -- der
            // Listener am Fenster erledigt das, hier nur nicht senden.
            if (nimmtAuf) return;
            // Enter schickt ab, Shift+Enter macht eine neue Zeile.
            if (event.key !== "Enter" || event.shiftKey) return;
            // Waehrend einer IME-Komposition ist Enter das Bestaetigen
            // eines Vorschlags, nicht das Absenden.
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            submit();
          }}
        />

        <InputGroupAddon align="block-end" className="gap-1.5 px-3 pb-3">
          {nimmtAuf ? (
            /* Waehrend der Aufnahme traegt die Leiste nur noch die Aufnahme.
               Modellwahl und Tastenkappen daneben stehen zu lassen hiesse,
               Bedienung anzubieten, die gerade nichts bewirkt. */
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

              {/* Nur wenn das Backend wirklich transkribieren kann -- ein
                  Mikrofon, das sicher scheitert, ist schlimmer als keins. */}
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

              {/* Nur diese beiden: sie gelten fuer das Feld, an dem die Hand
                  gerade liegt. Alles Uebrige -- Palette, Anhaengen -- steht
                  gesammelt in der Fusszeile der Sidebar und muss hier nicht
                  ein zweites Mal stehen. */}
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

              {/* Der Knopf sagt von selbst, ob er etwas zu tun hat: ohne
                  Text bleibt er stumm und flach, mit Text faellt er in die
                  Markenfarbe und bekommt einen Schein. Waehrend der Antwort
                  wird er zum Stopp -- dieselbe Stelle, damit die Hand nicht
                  wandern muss. */}
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

      {/* Erscheint erst, wenn wirklich etwas ueber dem Feld haengt --
          eine dauerhafte Ablagezone waere Moebel fuer den Ausnahmefall. */}
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

/** 0:07 -- Minuten ohne fuehrende Null, Sekunden mit. */
function zeit(ms: number): string {
  const gesamt = Math.floor(ms / 1000);
  return `${Math.floor(gesamt / 60)}:${String(gesamt % 60).padStart(2, "0")}`;
}
