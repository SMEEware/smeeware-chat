"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenIcon,
  MessageSquareIcon,
  MicIcon,
  PaperclipIcon,
  PlusIcon,
} from "lucide-react";

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
import { useChats, useNewChat } from "@/hooks/use-chats";
import {
  BEFEHL,
  istKuerzel,
  onBefehl,
  openFilePicker,
  startRecording,
} from "@/lib/chat/commands";

/**
 * Schnellwahl ueber Strg/Cmd+K. Die Sidebar sucht im sichtbaren Verlauf,
 * das hier springt von ueberall zu jedem Chat -- auch wenn die Sidebar
 * gerade eingeklappt ist.
 */
export function ChatCommand() {
  const router = useRouter();
  const { data: chats } = useChats();
  const neuerChat = useNewChat();
  const [offen, setOffen] = React.useState(false);

  // Die Kuerzel, die ueberall im Chat gelten. Cmd+O und Cmd+I sitzen beim
  // Composer, weil sie dort auch etwas zu tun haben -- hier stehen nur die
  // beiden, die keinen Composer brauchen.
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
    return () => {
      window.removeEventListener("keydown", aufTaste);
      ab();
    };
  }, [neuerChat]);

  const springen = (href: string) => {
    setOffen(false);
    router.push(href);
  };

  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogContent
        showCloseButton={false}
        className="top-1/4 translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-label="Search chats"
      >
        <Command
          // Die id steht im Suchwert, damit zwei gleichnamige Chats nicht
          // zu einem Eintrag verschmelzen.
          className="bg-transparent"
        >
          <CommandInput placeholder="Search chats..." />
          <CommandList className="max-h-80">
            <CommandEmpty>No chat found.</CommandEmpty>

            <CommandGroup heading="Actions">
              <CommandItem
                value="new chat"
                onSelect={() => {
                  setOffen(false);
                  neuerChat();
                }}
              >
                <PlusIcon />
                New chat
                <CommandShortcut>⌘J</CommandShortcut>
              </CommandItem>
              {/* Beide reichen nur ein Ereignis weiter -- was dann passiert,
                  weiss der Composer. Die Palette schliesst vorher, damit
                  Enter und Escape waehrend der Aufnahme bei ihm ankommen
                  und nicht im Dialog haengen bleiben. */}
              <CommandItem
                value="attach files upload image document"
                onSelect={() => {
                  setOffen(false);
                  openFilePicker();
                }}
              >
                <PaperclipIcon />
                Attach files
                <CommandShortcut>⌘O</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="start recording transcribe voice speech dictate"
                onSelect={() => {
                  setOffen(false);
                  startRecording();
                }}
              >
                <MicIcon />
                Start recording
                <CommandShortcut>⌘I</CommandShortcut>
              </CommandItem>
              {/* Dasselbe Symbol wie ueber dem ersten Kapitel der Doku --
                  wer es dort kennt, erkennt hier, wo er landet. */}
              <CommandItem
                value="open docs documentation reference"
                onSelect={() => springen("/docs")}
              >
                <BookOpenIcon />
                Open docs
              </CommandItem>
            </CommandGroup>

            {chats && chats.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Chats">
                  {chats.map((chat) => (
                    <CommandItem
                      key={chat.id}
                      value={`${chat.title} ${chat.id}`}
                      onSelect={() => springen(`/chat/${chat.id}`)}
                    >
                      <MessageSquareIcon className="text-muted-foreground" />
                      <span className="truncate">{chat.title}</span>
                      {/* Als CommandShortcut, nicht als eigenes span: nur so
                          faellt das unsichtbare Haekchen weg, das die Zeile
                          sonst hinter den Children mitfuehrt und die Zahl von
                          der rechten Kante wegschiebt. */}
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
