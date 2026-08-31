"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { NotAuthenticated } from "@/lib/chat/history";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Eine abgelaufene Sitzung wird beim zweiten Versuch nicht besser.
        retry: (anzahl, fehler) =>
          !(fehler instanceof NotAuthenticated) && anzahl < 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Ein abgebrochener Turn ist kein Fehler, den man wiederholen will.
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pfad = usePathname();

  // useState statt Modul-Konstante: sonst teilen sich auf dem Server alle
  // Requests denselben Cache.
  const [queryClient] = React.useState(makeQueryClient);

  /**
   * Eine abgelaufene Sitzung ist kein Fehler einzelner Abrufe, sondern ein
   * Zustand der ganzen Oberflaeche -- Sidebar, Verlauf und Konto scheitern
   * gleichzeitig. Deshalb hier an einer Stelle abgefangen statt in jeder
   * Ansicht noch einmal.
   *
   * Der Fall tritt oefter ein, als man denkt: der Datenschluessel der Chats
   * lebt nur im Speicher des Backends. Startet es neu -- mit ``--reload``
   * bei jeder Dateiaenderung --, ist jede Sitzung weg, waehrend das Cookie
   * im Browser weiterlebt. Ohne diese Weiterleitung sieht man dann eine
   * leere Sidebar und "This chat is gone", obwohl nichts geloescht wurde.
   */
  React.useEffect(() => {
    return queryClient.getQueryCache().subscribe((ereignis) => {
      if (ereignis.type !== "updated") return;
      if (!(ereignis.query.state.error instanceof NotAuthenticated)) return;
      if (pfad === "/login") return;
      router.replace(`/login?next=${encodeURIComponent(pfad)}`);
    });
  }, [pfad, queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  );
}
