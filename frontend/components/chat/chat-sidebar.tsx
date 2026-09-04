"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { differenceInCalendarDays, isToday, isYesterday } from "date-fns";
import {
  ArrowRightIcon,
  CompassIcon,
  MegaphoneIcon,
  SettingsIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { NotificationsModal } from "@/components/chat/notifications-modal";
import { SettingsDialog } from "@/components/chat/settings-dialog";
import { WorkspaceModal } from "@/components/chat/workspace-modal";
import { tourStarten } from "@/components/chat/chat-tour";
import { useNotifications } from "@/hooks/use-notifications";
import { BEFEHL, onBefehl, openChatCommand } from "@/lib/chat/commands";
import { KUERZEL } from "@/lib/chat/command-registry";
import {
  oeffneNeuenChat,
  useChats,
  useDeleteAllChats,
  useDeleteChat,
  useNewChat,
  useRenameChat,
} from "@/hooks/use-chats";
import type { ChatSummary } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/** /chat/<id> -- auf /chat (neuer Chat) ist nichts aktiv. */
export function activeChatId(pathname: string): string | null {
  const treffer = /^\/chat\/([^/]+)/.exec(pathname);
  return treffer ? decodeURIComponent(treffer[1]) : null;
}

type Gruppe = { label: string; chats: ChatSummary[] };

/**
 * Nach Alter buendeln, wie man einen Verlauf liest: was heute war, was
 * gestern war, der Rest der Woche, alles davor. Innerhalb einer Gruppe
 * kommt die Reihenfolge schon sortiert aus dem Backend (updated_at DESC).
 *
 * Die Ueberschrift traegt die Zeitangabe -- deshalb steht an der einzelnen
 * Zeile keine mehr. Ein Datum pro Zeile waere Rauschen fuer eine
 * Information, die die Gruppe schon gibt.
 */
function gruppieren(chats: ChatSummary[]): Gruppe[] {
  const gruppen: Gruppe[] = [
    { label: "Today", chats: [] },
    { label: "Yesterday", chats: [] },
    { label: "Previous 7 days", chats: [] },
    { label: "Older", chats: [] },
  ];

  for (const chat of chats) {
    const zeit = new Date(chat.updated_at);
    const index = isToday(zeit)
      ? 0
      : isYesterday(zeit)
        ? 1
        : differenceInCalendarDays(new Date(), zeit) <= 7
          ? 2
          : 3;
    gruppen[index].chats.push(chat);
  }

  return gruppen.filter((gruppe) => gruppe.chats.length > 0);
}

export function ChatSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  const { data: chats, isLoading, isError } = useChats();
  const rename = useRenameChat();
  const remove = useDeleteChat();
  const entleeren = useDeleteAllChats();
  const neuerChat = useNewChat();

  const [suche, setSuche] = React.useState("");
  const [umbenennen, setUmbenennen] = React.useState<string | null>(null);
  const [loeschen, setLoeschen] = React.useState<ChatSummary | null>(null);
  const [entleerenOffen, setEntleerenOffen] = React.useState(false);
  const [einstellungen, setEinstellungen] = React.useState(false);
  const [hinweiseOffen, setHinweiseOffen] = React.useState(false);
  const [workspacesOffen, setWorkspacesOffen] = React.useState(false);

  // Kommandos aus Palette und Slash-Menue, die hier ihre Heimat haben: der
  // Einstellungsdialog und die Workspace-Verwaltung liegen ohnehin an dieser
  // Stelle, die Tour setzt nur einen Merker. So bleibt der ganze
  // Zustands-Kram an einem Ort statt ueber die Oberflaeche verstreut.
  React.useEffect(() => {
    const abEinst = onBefehl(BEFEHL.openSettingsDialog, () =>
      setEinstellungen(true),
    );
    const abWs = onBefehl(BEFEHL.manageWorkspaces, () =>
      setWorkspacesOffen(true),
    );
    const abTour = onBefehl(BEFEHL.startTour, () => tourStarten());
    // "Neue Persona" fuehrt in die Einstellungen -- dort werden Personas
    // geschrieben.
    const abPersona = onBefehl(BEFEHL.newSystemPrompt, () =>
      setEinstellungen(true),
    );
    return () => {
      abEinst();
      abWs();
      abTour();
      abPersona();
    };
  }, []);
  const hinweise = useNotifications();

  const aktiv = activeChatId(pathname);

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const gefiltert = React.useMemo(() => {
    const nadel = suche.trim().toLowerCase();
    const liste = chats ?? [];
    if (!nadel) return liste;
    return liste.filter((chat) => chat.title.toLowerCase().includes(nadel));
  }, [chats, suche]);

  const gruppen = React.useMemo(() => gruppieren(gefiltert), [gefiltert]);

  /** Leerer Titel heisst: doch nicht umbenennen. */
  const titelSpeichern = (chat: ChatSummary, titel: string) => {
    setUmbenennen(null);
    const sauber = titel.trim();
    if (!sauber || sauber === chat.title) return;
    rename.mutate({ id: chat.id, title: sauber.slice(0, 200) });
  };

  // Loescht man den Chat, den man gerade liest, muss die Ansicht weg --
  // sonst steht ein Verlauf auf dem Schirm, den es nicht mehr gibt.
  const loeschenBestaetigt = () => {
    if (!loeschen) return;
    const id = loeschen.id;
    setLoeschen(null);
    remove.mutate(id);
    if (id === aktiv) router.push("/chat");
  };

  // Wie beim einzelnen Chat: liest man gerade einen, den es gleich nicht
  // mehr gibt, muss die Ansicht weg.
  const entleerenBestaetigt = () => {
    setEntleerenOffen(false);
    entleeren.mutate();
    if (aktiv) router.push("/chat");
  };

  return (
    <>
      <Sidebar
        collapsible="offcanvas"
        className="border border-sidebar-border/70 rounded-r-xl overflow-clip"
      >
        <SidebarHeader className="relative gap-3 border-b border-sidebar-border/70 p-3">
          {/* Derselbe Schein wie in den Modalen. Die Sidebar hat
              overflow-clip, er bleibt also im Rahmen. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/25 opacity-40 blur-3xl"
          />
          {/* Ein Ziel, nicht zwei: Zeichen und Wortmarke sind dieselbe
              Marke, also gehoeren sie in denselben Link. w-fit haelt die
              Klickflaeche an der Schrift -- ohne das reichte sie bis an den
              rechten Rand der Sidebar. */}
          <Link
            href="/"
            className="group relative flex h-7 w-fit items-center gap-2"
          >
            <Image
              src="/assets/img/icon.svg"
              height={24}
              width={24}
              alt="SMEEware"
              className="size-6 shrink-0 transition-transform duration-300 group-hover:scale-110"
            />
            <span className="font-heading text-[13px] font-semibold tracking-tight">
              SMEEware
            </span>
            {/* Dasselbe Kuerzel wie in der Doku -- es sagt, in welchem Teil
                man ist, ohne dafuer die Wortmarke zu verlaengern. */}
            <span className="rounded-md bg-sidebar-accent/60 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground/80">
              chat
            </span>
          </Link>

          {/* Kein Farbblock und kein gefuellter Knopf: eine Haarlinie, die
              beim Hover die Primaerfarbe annimmt. Was ihn traegt, sind drei
              Bewegungen, die erst beim Ueberfahren entstehen -- ein Schimmer,
              der einmal durchlaeuft, das Plus, das sich zum Kreuz dreht, und
              der Pfeil, der von rechts hereinkommt. */}
          <Link
            href="/chat"
            data-tour="neu"
            prefetch={false}
            onClick={(event) => {
              closeOnMobile();
              oeffneNeuenChat(neuerChat)(event);
            }}
            className="group relative flex h-9 items-center gap-2.5 overflow-hidden rounded-lg px-2.5 text-[13px] font-medium text-foreground/80 ring-1 ring-sidebar-border/80 transition-colors ring-inset hover:bg-primary/[0.06] hover:text-foreground hover:ring-primary/45"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-primary/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[200%]"
            />
            <PlusIcon className="relative size-4 text-muted-foreground/70 transition-[color,transform] duration-300 group-hover:rotate-90 group-hover:text-primary" />
            <span className="relative">New chat</span>
            <ArrowRightIcon className="relative ms-auto size-3.5 -translate-x-1 text-primary opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
          </Link>

          <div className="group relative z-10">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
            <input
              value={suche}
              onChange={(event) => setSuche(event.target.value)}
              data-tour="suche"
              placeholder="Search chats"
              aria-label="Search chats"
              className="h-9 w-full rounded-lg bg-sidebar-accent/40 pr-2.5 pl-8 text-[13px] outline-none transition-[background-color,box-shadow] placeholder:text-muted-foreground/50 hover:bg-sidebar-accent/70 focus-visible:bg-sidebar-accent/70 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
            />
          </div>
          {/* Zaehler und Papierkorb sitzen ueber der Liste, auf die sie sich
              beziehen -- nicht unter ihr. Der Zaehler bleibt beim Scrollen
              stehen, weil die Kopfzeile stehen bleibt. */}
          <div className="flex h-6 items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <MessageSquareIcon className="size-3.5 shrink-0 text-primary/60" />
            <span className="tabular-nums">
              {chats?.length ?? 0} {chats?.length === 1 ? "chat" : "chats"}
            </span>

            {/* Erst wenn es etwas zu leeren gibt. Ein Papierkorb ueber einer
                leeren Liste waere ein Knopf, der nichts tun kann. */}
            {(chats?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setEntleerenOffen(true)}
                disabled={entleeren.isPending}
                aria-label="Delete all chats"
                title="Delete all chats"
                className="ms-auto flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            ) : null}
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2 pb-2">
          {isLoading ? (
            <div className="flex flex-col gap-2 px-1 pt-3">
              {[80, 64, 72, 56, 68, 60].map((breite, index) => (
                <Skeleton
                  key={index}
                  className="h-4 rounded-md"
                  style={{ width: `${breite}%` }}
                />
              ))}
            </div>
          ) : isError ? (
            <p className="px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground/70">
              History unavailable.
              <br />
              Is the backend running?
            </p>
          ) : gruppen.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground/70">
              {suche ? "Nothing matches." : "No saved chats yet."}
            </p>
          ) : (
            gruppen.map((gruppe) => (
              <section key={gruppe.label}>
                {/* Klebt beim Scrollen oben fest, damit man immer weiss,
                    aus welchem Zeitraum die Zeilen unter dem Daumen sind. */}
                <h3 className="sticky top-0 z-10 -mx-2 bg-sidebar/85 px-6 pt-4 pb-1.5 text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase backdrop-blur-sm">
                  {gruppe.label}
                </h3>
                {/* Die Haarlinie laeuft durch die ganze Gruppe; die einzelne
                    Zeile setzt nur ihr Stueck davon in Farbe. */}
                <ul className="relative flex flex-col before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-sidebar-border/70">
                  {gruppe.chats.map((chat) => (
                    <ChatZeile
                      key={chat.id}
                      chat={chat}
                      aktiv={chat.id === aktiv}
                      umbenennen={umbenennen === chat.id}
                      onUmbenennen={() => setUmbenennen(chat.id)}
                      onTitel={(titel) => titelSpeichern(chat, titel)}
                      onAbbrechen={() => setUmbenennen(null)}
                      onLoeschen={() => setLoeschen(chat)}
                      onOeffnen={closeOnMobile}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </SidebarContent>

        <SidebarFooter className="gap-0 border-t border-sidebar-border/70 p-0">
          {/* Alle Kuerzel an einer Stelle, statt verteilt ueber die
              Oberflaeche. Nur am Desktop -- auf dem Handy gibt es keine
              Tastatur, an der sie etwas nuetzen, und der Platz ist knapper. */}
          <div className="hidden flex-col px-3 pt-3 pb-2 md:flex">
            <h3 className="pb-1 text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
              Shortcuts
            </h3>
            <ul className="flex flex-col">
              {KUERZEL.map((eintrag) => (
                <KuerzelZeile
                  key={eintrag.id}
                  label={eintrag.label}
                  onClick={
                    eintrag.id === "palette" ? openChatCommand : undefined
                  }
                  tasten={eintrag.tasten.map((taste) => (
                    <Kbd key={taste} className={TASTE}>
                      {taste}
                    </Kbd>
                  ))}
                />
              ))}
            </ul>
          </div>

          {/* Wem die Sidebar gehoert -- ganz unten, wo man es sucht. Das
              Zahnrad sitzt in derselben Zeile ganz rechts: die aeusserste
              Ecke ist der Platz, an dem man Einstellungen sucht. */}
          <div className="flex items-center gap-2 px-3 py-2 md:border-t md:border-sidebar-border/70">
            <span className="text-[10px] text-muted-foreground/40">
              © {new Date().getFullYear()}{" "}
              <a
                href="https://smeeware.com"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-foreground"
              >
                SMEEware.com
              </a>
            </span>

            {/* Drei Knoepfe in der Reihenfolge, in der man sie braucht:
                erst wieder gezeigt bekommen, wo was liegt, dann lesen, was
                passiert ist, dann einstellen, was passieren soll.

                Der Kompass steht hier und nicht in den Einstellungen: die
                Tour zeigt auf Elemente der Oberflaeche, ein Dialog davor
                muesste sich erst wieder schliessen. Beim Ueberfahren dreht
                sich die Nadel -- die Scheibe ist rund, sichtbar bewegt sich
                also genau das, was die Richtung angibt.

                Auf dem Handy schliesst der Klick die Sidebar: sie liegt dort
                ueber dem Chat, und die ersten drei Schritte zeigen auf den
                Composer darunter. */}
            <button
              type="button"
              onClick={() => {
                closeOnMobile();
                tourStarten();
              }}
              data-tour="tour"
              aria-label="Replay the tour"
              title="Replay the tour"
              className="group ms-auto flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <CompassIcon className="size-4 transition-transform duration-500 group-hover:rotate-[135deg]" />
            </button>

            <button
              type="button"
              onClick={() => setHinweiseOffen(true)}
              aria-label="Notifications"
              title="Notifications"
              className="group relative flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <MegaphoneIcon className="size-4 transition-transform duration-300 group-hover:-rotate-12" />
              {/* Ein Punkt, keine Zahl: wie viele es genau sind, steht im
                  Modal -- hier zaehlt nur, dass etwas da ist. */}
              {(hinweise.data?.unread ?? 0) > 0 ? (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 flex size-1.5"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/70" />
                  <span className="relative size-1.5 rounded-full bg-primary" />
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setEinstellungen(true)}
              data-tour="einstellungen"
              aria-label="Settings"
              title="Settings"
              className="group flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <SettingsIcon className="size-4 transition-transform duration-500 group-hover:rotate-90" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SettingsDialog open={einstellungen} onOpenChange={setEinstellungen} />

      <WorkspaceModal open={workspacesOffen} onOpenChange={setWorkspacesOffen} />

      <NotificationsModal
        open={hinweiseOffen}
        onOpenChange={setHinweiseOffen}
      />

      <AlertDialog open={entleerenOffen} onOpenChange={setEntleerenOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              All {chats?.length ?? 0}{" "}
              {chats?.length === 1 ? "chat" : "chats"} will be removed for
              good. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={entleerenBestaetigt}
            >
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={loeschen !== null}
        onOpenChange={(offen) => {
          if (!offen) setLoeschen(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{loeschen?.title}&rdquo; will be removed for good. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={loeschenBestaetigt}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type ZeileProps = {
  chat: ChatSummary;
  aktiv: boolean;
  umbenennen: boolean;
  onUmbenennen: () => void;
  onTitel: (titel: string) => void;
  onAbbrechen: () => void;
  onLoeschen: () => void;
  onOeffnen: () => void;
};

/**
 * Eine Zeile, kein Knopf: keine Flaeche, kein Radius, keine Fuellung. Was
 * die Zeile traegt, ist das Stueck Schiene an ihrer linken Kante -- grau
 * beim Ueberfahren, in Primaerfarbe fuer den offenen Chat -- und das
 * Gewicht der Schrift. Das Menue erscheint erst beim Hover; sein Platz ist
 * dauerhaft reserviert (pr-7), sonst zuckt der Titel beim Ueberfahren.
 */
function ChatZeile({
  chat,
  aktiv,
  umbenennen,
  onUmbenennen,
  onTitel,
  onAbbrechen,
  onLoeschen,
  onOeffnen,
}: ZeileProps) {
  // Umbenennen passiert an Ort und Stelle: dieselbe Zeile, nur ein Feld
  // statt des Titels. Ein Dialog dafuer waere zu viel Aufwand fuer einen
  // Handgriff, den man dutzendfach macht.
  if (umbenennen) {
    return (
      <li>
        <input
          autoFocus
          defaultValue={chat.title}
          onBlur={(event) => onTitel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onTitel(event.currentTarget.value);
            if (event.key === "Escape") onAbbrechen();
          }}
          className="h-8 w-full rounded-r-md bg-sidebar-accent/60 pr-2 pl-4 text-[13px] text-foreground outline-none ring-1 ring-primary/40 ring-inset"
        />
      </li>
    );
  }

  return (
    <li className="group/zeile relative">
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 -translate-y-1/2 rounded-full transition-all duration-200",
          aktiv
            ? "h-5 w-0.5 bg-primary"
            : "h-3 w-0.5 bg-transparent group-hover/zeile:bg-foreground/25",
        )}
      />

      <Link
        href={`/chat/${chat.id}`}
        onClick={onOeffnen}
        title={chat.title}
        className={cn(
          "flex h-8 items-center rounded-r-md pr-7 pl-4 text-[13px] transition-colors",
          // Rechts gerundet, links flach: die Zeile haengt sichtbar an der
          // Schiene, statt als eigener Kasten daneben zu liegen.
          aktiv
            ? "bg-primary/[0.07] font-medium text-foreground"
            : "text-muted-foreground/90 hover:bg-primary/[0.035] hover:text-foreground",
        )}
      >
        <span className="truncate">{chat.title}</span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "absolute top-1/2 right-0.5 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-[opacity,color]",
            "opacity-0 group-hover/zeile:opacity-100 hover:text-foreground focus-visible:opacity-100 data-popup-open:opacity-100 data-popup-open:text-foreground",
            // Ohne Hover kein Menue -- auf dem Handy also dauerhaft sichtbar.
            "max-md:opacity-100",
          )}
        >
          <MoreHorizontalIcon className="size-3.5" />
          <span className="sr-only">Chat options</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-40">
          <DropdownMenuItem onClick={onUmbenennen}>
            <PencilLineIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onLoeschen}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Kleiner als die Vorgabe: neben 11px-Text waeren volle Kappen Kloetze. */
const TASTE = "h-5 min-w-5 rounded-md bg-sidebar-accent/70 px-1 text-[10px]";

/**
 * Eine Zeile der Kuerzel-Liste.
 *
 * Nur was auch etwas tut, wird ein Knopf -- "Command palette" laesst sich
 * anklicken, die uebrigen drei sind Beschriftung. Ein Hover-Zustand an einer
 * Zeile, die auf einen Klick nicht reagiert, waere ein Versprechen, das
 * niemand einloest.
 */
function KuerzelZeile({
  label,
  tasten,
  onClick,
}: {
  label: string;
  tasten: React.ReactNode;
  onClick?: () => void;
}) {
  const inhalt = (
    <>
      <span className="truncate">{label}</span>
      <KbdGroup className="ms-auto">{tasten}</KbdGroup>
    </>
  );

  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "flex h-7 w-full cursor-pointer items-center gap-2 text-[11px] text-muted-foreground/70 transition-colors",
            "hover:text-primary [&:hover_[data-slot=kbd]]:bg-primary/10 [&:hover_[data-slot=kbd]]:text-primary",
          )}
        >
          {inhalt}
        </button>
      ) : (
        <span className="flex h-7 items-center gap-2 text-[11px] text-muted-foreground/70">
          {inhalt}
        </span>
      )}
    </li>
  );
}
