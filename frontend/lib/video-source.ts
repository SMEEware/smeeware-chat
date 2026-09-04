export type Anbieter =
  | "youtube"
  | "vimeo"
  | "dailymotion"
  | "twitch"
  | "tiktok"
  | "streamable"
  | "bilibili";

export type VideoQuelle =
  | { kind: "embed"; anbieter: Anbieter; id: string; url: string }
  | { kind: "file"; url: string; mime?: string };

const DATEI = /\.(mp4|webm|ogg|ogv|m4v|mov)(\?|#|$)/i;

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  ogv: "video/ogg",
};

export const ANBIETER_NAME: Record<Anbieter, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  dailymotion: "Dailymotion",
  twitch: "Twitch",
  tiktok: "TikTok",
  streamable: "Streamable",
  bilibili: "Bilibili",
};

function erkenne(url: URL): { anbieter: Anbieter; id: string } | null {
  const host = url.hostname.replace(/^www\./, "");
  const pfad = url.pathname;

  if (host === "youtu.be") {
    const id = pfad.slice(1).split("/")[0];
    return id ? { anbieter: "youtube", id } : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (pfad === "/watch") {
      const id = url.searchParams.get("v");
      return id ? { anbieter: "youtube", id } : null;
    }
    const treffer = /^\/(embed|shorts|v)\/([^/?#]+)/.exec(pfad);
    return treffer ? { anbieter: "youtube", id: treffer[2] } : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const treffer = /^\/(?:video\/)?(\d+)/.exec(pfad);
    return treffer ? { anbieter: "vimeo", id: treffer[1] } : null;
  }

  if (host === "dailymotion.com" || host === "dai.ly") {
    const treffer = /^\/(?:embed\/)?(?:video\/)?([a-z0-9]+)/i.exec(pfad);
    return treffer ? { anbieter: "dailymotion", id: treffer[1] } : null;
  }

  if (host === "twitch.tv" || host === "m.twitch.tv") {
    const treffer = /^\/videos\/(\d+)/.exec(pfad);
    return treffer ? { anbieter: "twitch", id: treffer[1] } : null;
  }

  if (host === "tiktok.com" || host === "vm.tiktok.com") {
    const treffer = /\/video\/(\d+)/.exec(pfad);
    return treffer ? { anbieter: "tiktok", id: treffer[1] } : null;
  }

  if (host === "streamable.com") {
    const treffer = /^\/(?:e\/)?([a-z0-9]+)/i.exec(pfad);
    return treffer ? { anbieter: "streamable", id: treffer[1] } : null;
  }

  if (host === "bilibili.com") {
    const treffer = /^\/video\/(BV[\w]+)/i.exec(pfad);
    return treffer ? { anbieter: "bilibili", id: treffer[1] } : null;
  }

  return null;
}

export function videoQuelle(roh: string | undefined): VideoQuelle | null {
  if (!roh) return null;

  let url: URL;
  try {
    url = new URL(roh, "http://localhost");
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const plattform = erkenne(url);
  if (plattform && /^[\w-]{4,24}$/.test(plattform.id)) {
    return { kind: "embed", ...plattform, url: roh };
  }

  const endung = DATEI.exec(url.pathname);
  if (endung) {
    return { kind: "file", url: roh, mime: MIME[endung[1].toLowerCase()] };
  }

  return null;
}

export function vorschauBild(quelle: VideoQuelle): string | null {
  if (quelle.kind === "embed" && quelle.anbieter === "youtube") {
    return `https://i.ytimg.com/vi/${quelle.id}/hqdefault.jpg`;
  }
  return null;
}

export function embedUrl(quelle: VideoQuelle, autoplay: boolean): string | null {
  if (quelle.kind !== "embed") return null;

  switch (quelle.anbieter) {
    case "youtube": {
      const p = new URLSearchParams({
        rel: "0",
        modestbranding: "1",
        playsinline: "1",
      });
      if (autoplay) p.set("autoplay", "1");
      return `https://www.youtube-nocookie.com/embed/${quelle.id}?${p}`;
    }
    case "vimeo": {
      const p = new URLSearchParams({ dnt: "1", playsinline: "1" });
      if (autoplay) p.set("autoplay", "1");
      return `https://player.vimeo.com/video/${quelle.id}?${p}`;
    }
    case "dailymotion": {
      const p = new URLSearchParams({ "queue-enable": "false" });
      if (autoplay) p.set("autoplay", "1");
      return `https://www.dailymotion.com/embed/video/${quelle.id}?${p}`;
    }
    case "twitch": {
      const wirt =
        typeof window === "undefined" ? "localhost" : window.location.hostname;
      const p = new URLSearchParams({
        video: quelle.id,
        parent: wirt,
        autoplay: autoplay ? "true" : "false",
      });
      return `https://player.twitch.tv/?${p}`;
    }
    case "tiktok":
      return `https://www.tiktok.com/embed/v2/${quelle.id}`;
    case "streamable": {
      const p = new URLSearchParams({});
      if (autoplay) p.set("autoplay", "1");
      return `https://streamable.com/e/${quelle.id}?${p}`;
    }
    case "bilibili": {
      const p = new URLSearchParams({ bvid: quelle.id, autoplay: autoplay ? "1" : "0" });
      return `https://player.bilibili.com/player.html?${p}`;
    }
  }
}
