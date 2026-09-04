export type ImageInfo = {
  name: string;
  type?: string;
  href?: string;
};

const fromMime = (mime: string) => {
  const subtype = mime.split("/")[1]?.split("+")[0];
  if (!subtype) return undefined;
  return subtype === "jpeg" ? "JPG" : subtype.toUpperCase();
};

export function imageInfo(src: string): ImageInfo {
  if (src.startsWith("data:")) {
    const mime = src.slice(5).split(";")[0].split(",")[0];
    return { name: "Embedded image", type: fromMime(mime) };
  }

  try {
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
