"use client";

import { useQuery } from "@tanstack/react-query";

import { usePlugins } from "@/hooks/use-plugins";
import { useTranscribeStatus } from "@/hooks/use-transcribe";

export type Capability = "image" | "vision" | "voice" | "sharing";

export type Capabilities = Record<Capability, boolean>;

type ServerCapabilities = { sharing: boolean };

export function useCapabilities(): Capabilities {
  const plugins = usePlugins();
  const transcribe = useTranscribeStatus();
  const server = useQuery<ServerCapabilities>({
    queryKey: ["capabilities"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/capabilities", { signal, cache: "no-store" });
      return (await response.json()) as ServerCapabilities;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const available = (slug: string) =>
    plugins.data?.plugins.some((p) => p.slug === slug && p.available) ?? false;

  return {
    image: available("image-generation"),
    vision: available("vision"),
    voice: transcribe.data?.available ?? false,
    sharing: server.data?.sharing ?? false,
  };
}

export const acceptsImages = (caps: Capabilities) => caps.vision || caps.image;
