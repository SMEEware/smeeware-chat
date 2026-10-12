export type VideoProvider =
  | "youtube"
  | "vimeo"
  | "dailymotion"
  | "twitch"
  | "tiktok"
  | "streamable"
  | "bilibili";

export type VideoSource =
  | { kind: "embed"; provider: VideoProvider; id: string; url: string }
  | { kind: "file"; url: string; mime?: string };

const VIDEO_FILE = /\.(mp4|webm|ogg|ogv|m4v|mov)(\?|#|$)/i;

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  ogv: "video/ogg",
};

export const PROVIDER_NAME: Record<VideoProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  dailymotion: "Dailymotion",
  twitch: "Twitch",
  tiktok: "TikTok",
  streamable: "Streamable",
  bilibili: "Bilibili",
};

function detect(url: URL): { provider: VideoProvider; id: string } | null {
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;

  if (host === "youtu.be") {
    const id = path.slice(1).split("/")[0];
    return id ? { provider: "youtube", id } : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (path === "/watch") {
      const id = url.searchParams.get("v");
      return id ? { provider: "youtube", id } : null;
    }
    const match = /^\/(embed|shorts|v)\/([^/?#]+)/.exec(path);
    return match ? { provider: "youtube", id: match[2] } : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const match = /^\/(?:video\/)?(\d+)/.exec(path);
    return match ? { provider: "vimeo", id: match[1] } : null;
  }

  if (host === "dailymotion.com" || host === "dai.ly") {
    const match = /^\/(?:embed\/)?(?:video\/)?([a-z0-9]+)/i.exec(path);
    return match ? { provider: "dailymotion", id: match[1] } : null;
  }

  if (host === "twitch.tv" || host === "m.twitch.tv") {
    const match = /^\/videos\/(\d+)/.exec(path);
    return match ? { provider: "twitch", id: match[1] } : null;
  }

  if (host === "tiktok.com" || host === "vm.tiktok.com") {
    const match = /\/video\/(\d+)/.exec(path);
    return match ? { provider: "tiktok", id: match[1] } : null;
  }

  if (host === "streamable.com") {
    const match = /^\/(?:e\/)?([a-z0-9]+)/i.exec(path);
    return match ? { provider: "streamable", id: match[1] } : null;
  }

  if (host === "bilibili.com") {
    const match = /^\/video\/(BV[\w]+)/i.exec(path);
    return match ? { provider: "bilibili", id: match[1] } : null;
  }

  return null;
}

export function videoSource(raw: string | undefined): VideoSource | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw, "http://localhost");
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const platform = detect(url);
  if (platform && /^[\w-]{4,24}$/.test(platform.id)) {
    return { kind: "embed", ...platform, url: raw };
  }

  const extension = VIDEO_FILE.exec(url.pathname);
  if (extension) {
    return { kind: "file", url: raw, mime: MIME[extension[1].toLowerCase()] };
  }

  return null;
}

export function previewImage(source: VideoSource): string | null {
  if (source.kind === "embed" && source.provider === "youtube") {
    return `https://i.ytimg.com/vi/${source.id}/hqdefault.jpg`;
  }
  return null;
}

export function embedUrl(source: VideoSource, autoplay: boolean): string | null {
  if (source.kind !== "embed") return null;

  switch (source.provider) {
    case "youtube": {
      const p = new URLSearchParams({
        rel: "0",
        modestbranding: "1",
        playsinline: "1",
      });
      if (autoplay) p.set("autoplay", "1");
      return `https://www.youtube-nocookie.com/embed/${source.id}?${p}`;
    }
    case "vimeo": {
      const p = new URLSearchParams({ dnt: "1", playsinline: "1" });
      if (autoplay) p.set("autoplay", "1");
      return `https://player.vimeo.com/video/${source.id}?${p}`;
    }
    case "dailymotion": {
      const p = new URLSearchParams({ "queue-enable": "false" });
      if (autoplay) p.set("autoplay", "1");
      return `https://www.dailymotion.com/embed/video/${source.id}?${p}`;
    }
    case "twitch": {
      const host =
        typeof window === "undefined" ? "localhost" : window.location.hostname;
      const p = new URLSearchParams({
        video: source.id,
        parent: host,
        autoplay: autoplay ? "true" : "false",
      });
      return `https://player.twitch.tv/?${p}`;
    }
    case "tiktok":
      return `https://www.tiktok.com/embed/v2/${source.id}`;
    case "streamable": {
      const p = new URLSearchParams({});
      if (autoplay) p.set("autoplay", "1");
      return `https://streamable.com/e/${source.id}?${p}`;
    }
    case "bilibili": {
      const p = new URLSearchParams({ bvid: source.id, autoplay: autoplay ? "1" : "0" });
      return `https://player.bilibili.com/player.html?${p}`;
    }
  }
}
