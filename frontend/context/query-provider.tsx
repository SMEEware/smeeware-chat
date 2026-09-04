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
        retry: (anzahl, fehler) =>
          !(fehler instanceof NotAuthenticated) && anzahl < 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pfad = usePathname();

  const [queryClient] = React.useState(makeQueryClient);

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
