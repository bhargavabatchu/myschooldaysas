export const MAX_HIGHLIGHT_PHOTO_BYTES = 550 * 1024;

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type HighlightPhoto = {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export function parseHighlightPhotoDataUrl(value: string): HighlightPhoto | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !allowedMimeTypes.has(match[1])) return null;

  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_HIGHLIGHT_PHOTO_BYTES) return null;

  const contentType = match[1];
  const validSignature =
    (contentType === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (contentType === "image/png" && bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (contentType === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");

  if (!validSignature) return null;
  return { bytes, contentType: contentType as HighlightPhoto["contentType"] };
}
