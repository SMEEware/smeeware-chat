"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { differenceInCalendarDays, isToday, isYesterday } from "date-fns";
import {
  ArrowRightIcon,
  CompassIcon,
  Globe2Icon,
  LinkIcon,
  MegaphoneIcon,
  SettingsIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

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
  DropdownMenuSeparator,
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
import { PluginManager } from "@/components/chat/plugin-manager";
import { startTour } from "@/components/chat/chat-tour";
import { useNotifications } from "@/hooks/use-notifications";
import { COMMAND_EVENT, onCommand, openChatCommand } from "@/lib/chat/commands";
import { shortcuts } from "@/lib/chat/command-registry";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";
import {
  openNewChat,
  useChats,
  useDeleteAllChats,
  useDeleteChat,
  useNewChat,
  useRenameChat,
  useSetChatPublic,
} from "@/hooks/use-chats";
import type { ChatSummary } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export function activeChatId(pathname: string): string | null {
  const match = /^\/chat\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

type ChatGroup = { label: string; chats: ChatSummary[] };

function groupMessages(chats: ChatSummary[], t: TranslateFn): ChatGroup[] {
  const groups: ChatGroup[] = [
    { label: t("sidebar.groupToday"), chats: [] },
    { label: t("sidebar.groupYesterday"), chats: [] },
    { label: t("sidebar.groupPrev7"), chats: [] },
    { label: t("sidebar.groupOlder"), chats: [] },
  ];

  for (const chat of chats) {
    const time = new Date(chat.updated_at);
    const index = isToday(time)
      ? 0
      : isYesterday(time)
        ? 1
        : differenceInCalendarDays(new Date(), time) <= 7
          ? 2
          : 3;
    groups[index].chats.push(chat);
  }

  return groups.filter((group) => group.chats.length > 0);
}

export function ChatSidebar() {
  const t = useT();
  const caps = useCapabilities();
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  const { data: chats, isLoading, isError } = useChats();
  const rename = useRenameChat();
  const remove = useDeleteChat();
  const clearAll = useDeleteAllChats();
  const newChat = useNewChat();

  const [search, setSearch] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ChatSummary | null>(null);
  const [share, setSharing] = React.useState<ChatSummary | null>(null);
  const shareMutation = useSetChatPublic();

  const toggleShare = (chat: ChatSummary) => {
    if (chat.public) {
      shareMutation.mutate(
        { id: chat.id, public: false },
        {
          onSuccess: () => toast.success(t("sidebar.chatPrivateToast")),
          onError: () => toast.error(t("sidebar.stopSharingError")),
        },
      );
      return;
    }
    setSharing(chat);
  };

  const shareConfirmed = () => {
    if (!share) return;
    const target = share;
    shareMutation.mutate(
      { id: target.id, public: true },
      {
        onSuccess: () => {
          void navigator.clipboard
            .writeText(`${window.location.origin}/chat/${target.id}`)
            .catch(() => undefined);
          toast.success(t("sidebar.chatSharedToast"));
        },
        onError: (error: Error) =>
          toast.error(error.message || t("sidebar.chatShareError")),
      },
    );
    setSharing(null);
  };
  const [clearAllOpen, setClearAllOpen] = React.useState(false);
  const [settings, setSettingsOpen] = React.useState(false);
  const [noticesOpen, setNoticesOpen] = React.useState(false);
  const [workspacesOpen, setWorkspacesOpen] = React.useState(false);
  const [pluginsOpen, setPluginsOpen] = React.useState(false);

  React.useEffect(() => {
    const unsubSettings = onCommand(COMMAND_EVENT.openSettingsDialog, () =>
      setSettingsOpen(true),
    );
    const unsubWorkspaces = onCommand(COMMAND_EVENT.manageWorkspaces, () =>
      setWorkspacesOpen(true),
    );
    const unsubPlugins = onCommand(COMMAND_EVENT.managePlugins, () => setPluginsOpen(true));
    const unsubTour = onCommand(COMMAND_EVENT.startTour, () => startTour());
    const unsubPersona = onCommand(COMMAND_EVENT.newSystemPrompt, () =>
      setSettingsOpen(true),
    );
    return () => {
      unsubSettings();
      unsubWorkspaces();
      unsubPlugins();
      unsubTour();
      unsubPersona();
    };
  }, []);
  const notices = useNotifications();

  const active = activeChatId(pathname);

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = chats ?? [];
    if (!needle) return list;
    return list.filter((chat) => chat.title.toLowerCase().includes(needle));
  }, [chats, search]);

  const groups = React.useMemo(() => groupMessages(filtered, t), [filtered]);

  const saveTitle = (chat: ChatSummary, title: string) => {
    setRenamingId(null);
    const clean = title.trim();
    if (!clean || clean === chat.title) return;
    rename.mutate({ id: chat.id, title: clean.slice(0, 200) });
  };

  const deleteConfirmed = () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    remove.mutate(id);
    if (id === active) router.push("/chat");
  };

  const clearAllConfirmed = () => {
    setClearAllOpen(false);
    clearAll.mutate();
    if (active) router.push("/chat");
  };

  return (
    <>
      <Sidebar
        collapsible="offcanvas"
        className="border border-sidebar-border/70 rounded-r-xl overflow-clip"
      >
        <SidebarHeader className="relative gap-3 border-b border-sidebar-border/70 p-3">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/25 opacity-40 blur-3xl"
          />
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
            <span className="rounded-md bg-sidebar-accent/60 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground/80">
              chat
            </span>
          </Link>

          <Link
            href="/chat"
            data-tour="new"
            prefetch={false}
            onClick={(event) => {
              closeOnMobile();
              openNewChat(newChat)(event);
            }}
            className="group relative flex h-9 items-center gap-2.5 overflow-hidden rounded-lg px-2.5 text-[13px] font-medium text-foreground/80 ring-1 ring-sidebar-border/80 transition-colors ring-inset hover:bg-primary/6 hover:text-foreground hover:ring-primary/45"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 -left-full w-full bg-linear-to-r from-transparent via-primary/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[200%]"
            />
            <PlusIcon className="relative size-4 text-muted-foreground/70 transition-[color,transform] duration-300 group-hover:rotate-90 group-hover:text-primary" />
            <span className="relative">{t("sidebar.newChat")}</span>
            <ArrowRightIcon className="relative ms-auto size-3.5 -translate-x-1 text-primary opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
          </Link>

          <div className="group relative z-10">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              data-tour="search"
              placeholder={t("sidebar.searchChats")}
              aria-label={t("sidebar.searchChats")}
              className="h-9 w-full rounded-lg bg-sidebar-accent/40 pr-2.5 pl-8 text-[13px] outline-none transition-[background-color,box-shadow] placeholder:text-muted-foreground/50 hover:bg-sidebar-accent/70 focus-visible:bg-sidebar-accent/70 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
            />
          </div>
          <div className="flex h-6 items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <MessageSquareIcon className="size-3.5 shrink-0 text-primary/60" />
            <span className="tabular-nums">
              {chats?.length ?? 0}{" "}
              {chats?.length === 1 ? t("sidebar.chatSingular") : t("sidebar.chatPlural")}
            </span>

            {(chats?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setClearAllOpen(true)}
                disabled={clearAll.isPending}
                aria-label={t("sidebar.deleteAllChats")}
                title={t("sidebar.deleteAllChats")}
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
              {[80, 64, 72, 56, 68, 60].map((width, index) => (
                <Skeleton
                  key={index}
                  className="h-4 rounded-md"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
          ) : isError ? (
            <p className="px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground/70">
              {t("sidebar.historyUnavailable")}
              <br />
              {t("sidebar.backendRunning")}
            </p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground/70">
              {search ? t("chat.nothingMatches") : t("sidebar.noSavedChats")}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.label}>
                <h3 className="sticky top-0 z-10 -mx-2 bg-sidebar/85 px-6 pt-4 pb-1.5 text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase backdrop-blur-sm">
                  {group.label}
                </h3>
                <ul className="relative flex flex-col before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-sidebar-border/70">
                  {group.chats.map((chat) => (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      active={chat.id === active}
                      renaming={renamingId === chat.id}
                      onRename={() => setRenamingId(chat.id)}
                      onTitle={(title) => saveTitle(chat, title)}
                      onCancel={() => setRenamingId(null)}
                      onDelete={() => setPendingDelete(chat)}
                      onShare={() => toggleShare(chat)}
                      canShare={caps.sharing}
                      onOpen={closeOnMobile}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </SidebarContent>

        <SidebarFooter className="gap-0 border-t border-sidebar-border/70 p-0">
          <div className="hidden flex-col px-3 pt-3 pb-2 md:flex">
            <h3 className="pb-1 text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
              {t("sidebar.shortcuts")}
            </h3>
            <ul className="flex flex-col">
              {shortcuts(t, caps).map((entry) => (
                <ShortcutRow
                  key={entry.id}
                  label={entry.label}
                  onClick={
                    entry.id === "palette" ? openChatCommand : undefined
                  }
                  keys={entry.keys.map((key) => (
                    <Kbd key={key} className={KBD_CLASS}>
                      {key}
                    </Kbd>
                  ))}
                />
              ))}
            </ul>
          </div>

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

            <button
              type="button"
              onClick={() => {
                closeOnMobile();
                startTour();
              }}
              data-tour="tour"
              aria-label={t("sidebar.replayTour")}
              title={t("sidebar.replayTour")}
              className="group ms-auto flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <CompassIcon className="size-4 transition-transform duration-500 group-hover:rotate-135" />
            </button>

            <button
              type="button"
              onClick={() => setNoticesOpen(true)}
              aria-label={t("sidebar.notifications")}
              title={t("sidebar.notifications")}
              className="group relative flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <MegaphoneIcon className="size-4 transition-transform duration-300 group-hover:-rotate-12" />
              {(notices.data?.unread ?? 0) > 0 ? (
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
              onClick={() => setSettingsOpen(true)}
              data-tour="settings"
              aria-label={t("sidebar.settings")}
              title={t("sidebar.settings")}
              className="group flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <SettingsIcon className="size-4 transition-transform duration-500 group-hover:rotate-90" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SettingsDialog open={settings} onOpenChange={setSettingsOpen} />

      <WorkspaceModal
        open={workspacesOpen}
        onOpenChange={setWorkspacesOpen}
      />

      <NotificationsModal
        open={noticesOpen}
        onOpenChange={setNoticesOpen}
      />

      <PluginManager open={pluginsOpen} onOpenChange={setPluginsOpen} />

      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.deleteAllTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteAllBody", { chats: `${chats?.length ?? 0} ${chats?.length === 1 ? t("sidebar.chatSingular") : t("sidebar.chatPlural")}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sidebar.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={clearAllConfirmed}
            >
              {t("sidebar.deleteAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.deleteChatTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteChatBody", { title: pendingDelete?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sidebar.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={deleteConfirmed}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={share !== null}
        onOpenChange={(open) => {
          if (!open) setSharing(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.shareTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.shareBody", { title: share?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sidebar.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={shareConfirmed}>
              {t("sidebar.shareAndCopy")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type ChatRowProps = {
  chat: ChatSummary;
  active: boolean;
  renaming: boolean;
  onRename: () => void;
  onTitle: (title: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onShare: () => void;
  canShare: boolean;
};

function ChatRow({
  chat,
  active,
  renaming,
  onRename,
  onTitle,
  onCancel,
  onDelete,
  onOpen,
  onShare,
  canShare,
}: ChatRowProps) {
  const t = useT();
  if (renaming) {
    return (
      <li>
        <input
          autoFocus
          defaultValue={chat.title}
          onBlur={(event) => onTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onTitle(event.currentTarget.value);
            if (event.key === "Escape") onCancel();
          }}
          className="h-8 w-full rounded-r-md bg-sidebar-accent/60 pr-2 pl-4 text-[13px] text-foreground outline-none ring-1 ring-primary/40 ring-inset"
        />
      </li>
    );
  }

  return (
    <li className="group/row relative">
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 -translate-y-1/2 rounded-full transition-all duration-200",
          active
            ? "h-5 w-0.5 bg-primary"
            : "h-3 w-0.5 bg-transparent group-hover/row:bg-foreground/25",
        )}
      />

      <Link
        href={`/chat/${chat.id}`}
        onClick={onOpen}
        title={chat.title}
        className={cn(
          "flex h-8 items-center rounded-r-md pr-7 pl-4 text-[13px] transition-colors",
          active
            ? "bg-primary/[0.07] font-medium text-foreground"
            : "text-muted-foreground/90 hover:bg-primary/[0.035] hover:text-foreground",
        )}
      >
        <span className="truncate">{chat.title}</span>
        {chat.public ? (
          <Globe2Icon
            className="ms-auto size-3 shrink-0 text-muted-foreground/60"
            aria-label={t("sidebar.sharedPublicly")}
          />
        ) : null}
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "absolute top-1/2 right-0.5 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-[opacity,color]",
            "opacity-0 group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 data-popup-open:opacity-100 data-popup-open:text-foreground",
            "max-md:opacity-100",
          )}
        >
          <MoreHorizontalIcon className="size-3.5" />
          <span className="sr-only">{t("sidebar.chatOptions")}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-48">
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard
                .writeText(`${window.location.origin}/chat/${chat.id}`)
                .then(() => toast.success(t("sidebar.chatLinkCopied")))
                .catch(() =>
                  toast.error(t("sidebar.clipboardBlocked")),
                );
            }}
          >
            <LinkIcon />
            {t("sidebar.copyLink")}
          </DropdownMenuItem>
          {canShare || chat.public ? (
            <DropdownMenuItem onClick={onShare}>
              <Globe2Icon />
              {chat.public ? t("sidebar.stopSharing") : t("sidebar.shareChat")}
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={onRename}>
            <PencilLineIcon />
            {t("sidebar.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon />
            {t("sidebar.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

const KBD_CLASS = "h-5 min-w-5 rounded-md bg-sidebar-accent/70 px-1 text-[10px]";

function ShortcutRow({
  label,
  keys,
  onClick,
}: {
  label: string;
  keys: React.ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="truncate">{label}</span>
      <KbdGroup className="ms-auto">{keys}</KbdGroup>
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
          {content}
        </button>
      ) : (
        <span className="flex h-7 items-center gap-2 text-[11px] text-muted-foreground/70">
          {content}
        </span>
      )}
    </li>
  );
}
