import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

import { docNeighbours } from "@/lib/docs/navigation";

export function DocsPager({ slug }: { slug: string }) {
  const { previous, next } = docNeighbours(slug);
  if (!previous && !next) return null;

  return (
    <nav className="mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row">
      {previous ? (
        <Link
          href={previous.href}
          className="group/pager flex flex-1 flex-col gap-1 rounded-2xl border p-4 transition-colors hover:bg-accent"
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeftIcon className="size-3 transition-transform group-hover/pager:-translate-x-0.5" />
            Back
          </span>
          <span className="font-medium">{previous.title}</span>
        </Link>
      ) : (
        <span className="hidden flex-1 sm:block" />
      )}

      {next ? (
        <Link
          href={next.href}
          className="group/pager flex flex-1 flex-col items-end gap-1 rounded-2xl border p-4 text-right transition-colors hover:bg-accent"
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Next
            <ArrowRightIcon className="size-3 transition-transform group-hover/pager:translate-x-0.5" />
          </span>
          <span className="font-medium">{next.title}</span>
        </Link>
      ) : (
        <span className="hidden flex-1 sm:block" />
      )}
    </nav>
  );
}
