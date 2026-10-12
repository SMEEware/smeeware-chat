"use client";

import * as React from "react";
import Image from "next/image";
import { FileTextIcon, XIcon } from "lucide-react";

import { size, previewUrl } from "@/lib/chat/attachments";
import type { Attachment } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";

function Chip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove?: () => void;
}) {
  const t = useT();
  const preview = previewUrl(attachment);

  return (
    <span className="group/chip relative flex max-w-56 items-center gap-2 rounded-lg py-1.5 pr-2 pl-2 ring-1 ring-border/70 transition-colors ring-inset hover:ring-border">
      {preview ? (
        <Image
          src={preview}
          alt={attachment.name}
          height={28}
          width={28}
          unoptimized
          className="size-7 shrink-0 rounded-md object-cover ring-1 ring-border/50 ring-inset"
        />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <FileTextIcon className="size-3.5" />
        </span>
      )}

      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[12px] font-medium text-foreground/85">
          {attachment.name}
        </span>
        <span className="truncate text-[10px] text-muted-foreground/60 tabular-nums">
          {size(attachment.bytes)}
          {attachment.truncated ? " · truncated" : ""}
        </span>
      </span>

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("attachments.remove", { name: attachment.name })}
          className={cn(
            "absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border transition-[opacity,color] ring-inset",
            "opacity-0 group-hover/chip:opacity-100 hover:text-foreground focus-visible:opacity-100",
            "max-md:opacity-100",
          )}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export function AttachmentChips({
  attachmentList,
  onRemove,
  className,
}: {
  attachmentList: Attachment[];
  onRemove?: (id: string) => void;
  className?: string;
}) {
  if (attachmentList.length === 0) return null;

  return (
    <span className={cn("flex flex-wrap gap-2", className)}>
      {attachmentList.map((attachment) => (
        <Chip
          key={attachment.id}
          attachment={attachment}
          onRemove={onRemove ? () => onRemove(attachment.id) : undefined}
        />
      ))}
    </span>
  );
}
