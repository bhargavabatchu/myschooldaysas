export const MAX_FEE_CONCESSION_ATTACHMENT_BYTES = 700 * 1024;

const extensionByContentType = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type FeeConcessionAttachmentContentType = keyof typeof extensionByContentType;

export type FeeConcessionAttachment = {
  bytes: Buffer;
  contentType: FeeConcessionAttachmentContentType;
  fileName: string;
};

export function normalizeStoredFeeAttachment(value: unknown): Buffer | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (Buffer.isBuffer(candidate)) return candidate;
  if (candidate instanceof Uint8Array) return Buffer.from(candidate);
  return null;
}

function safeFileName(value: string, contentType: FeeConcessionAttachmentContentType): string {
  const baseName = value.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = baseName
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .trim();
  const base = (cleaned.replace(/\.[^.]*$/, "").trim() || "concession-letter").slice(0, 160);
  return `${base}.${extensionByContentType[contentType]}`;
}

export function parseFeeConcessionAttachmentDataUrl(
  dataUrl: string,
  fileName: string,
): FeeConcessionAttachment | null {
  const match = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || !fileName.trim()) return null;

  const contentType = match[1] as FeeConcessionAttachmentContentType;
  const bytes = Buffer.from(match[2], "base64");
  if (
    !bytes.length
    || bytes.length > MAX_FEE_CONCESSION_ATTACHMENT_BYTES
    || bytes.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")
  ) {
    return null;
  }

  const validSignature =
    (contentType === "application/pdf" && bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-") ||
    (contentType === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (contentType === "image/png" && bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (contentType === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");

  if (!validSignature) return null;
  return { bytes, contentType, fileName: safeFileName(fileName, contentType) };
}
