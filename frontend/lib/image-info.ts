export type ImageInfo = {
  /** Dateiname ohne Pfad, fuer die Anzeige im Modal. */
  name: string;
  /** Grossgeschriebenes Kuerzel: SVG, PNG, JPG ... */
  type?: string;
  /** Nur gesetzt, wenn sich die Quelle in einem Tab oeffnen laesst. */
  href?: string;
};

const fromMime = (mime: string) => {
  const subtype = mime.split("/")[1]?.split("+")[0];
  if (!subtype) return undefined;
  return subtype === "jpeg" ? "JPG" : subtype.toUpperCase();
};

/**
 * Zerlegt die Bildquelle in Name und Typ. Muss mit allem klarkommen, was
 * in einer Modellantwort stehen kann: absolute URLs, relative Pfade und
 * eingebettete data:-URLs.
 */
export function imageInfo(src: string): ImageInfo {
  if (src.startsWith("data:")) {
    const mime = src.slice(5).split(";")[0].split(",")[0];
    return { name: "Embedded image", type: fromMime(mime) };
  }

  try {
    // Die Basis greift nur bei relativen Pfaden und taucht nirgends auf.
    const url = new URL(src, "https://relative.invalid");
    const name = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    const extension = name.includes(".") ? name.split(".").pop() : undefined;

    return {
      name: name || "Image",
      type:
        extension && extension.length <= 5
          ? extension.toLowerCase() === "jpeg"
            ? "JPG"
            : extension.toUpperCase()
          : undefined,
      href: url.origin === "https://relative.invalid" ? src : url.href,
    };
  } catch {
    return { name: "Image" };
  }
}
