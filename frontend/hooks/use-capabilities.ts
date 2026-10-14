"use client";

import { useQuery } from "@tanstack/react-query";

import { usePlugins } from "@/hooks/use-plugins";
import { useTranscribeStatus } from "@/hooks/use-transcribe";
import { MAX_ATTACHMENTS, UPLOAD_MAX_BYTES } from "@/lib/chat/attachments";

export type Capability = "image" | "vision" | "voice" | "sharing";

export type Capabilities = Record<Capability, boolean> & {
  uploads: boolean;
  uploadsMaxBytes: number;
  uploadsMaxFiles: number;
};

type ServerCapabilities = {
  sharing: boolean;
  uploads: boolean;
  uploads_max_bytes: number;
  uploads_max_files: number;
};

const limit = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;

export function useCapabilities(): Capabilities {
  const plugins = usePlugins();
  const transcribe = useTranscribeStatus();
  const server = useQuery<ServerCapabilities>({
    queryKey: ["capabilities"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/capabilities", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Capabilities unavailable.");
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
    uploads: server.data?.uploads === true && !server.isError,
    uploadsMaxBytes: limit(server.data?.uploads_max_bytes, UPLOAD_MAX_BYTES),
    uploadsMaxFiles: limit(server.data?.uploads_max_files, MAX_ATTACHMENTS),
  };
}

export const acceptsImages = (caps: Capabilities) => caps.vision || caps.image;
