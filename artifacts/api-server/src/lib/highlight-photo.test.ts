import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_HIGHLIGHT_PHOTO_BYTES,
  normalizeStoredHighlightPhoto,
  parseHighlightPhotoDataUrl,
} from "./highlight-photo.ts";

test("accepts supported image data with matching file signatures", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const result = parseHighlightPhotoDataUrl(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
  assert.equal(result?.contentType, "image/jpeg");
  assert.deepEqual(result?.bytes, jpeg);
});

test("rejects non-image data even if the submitted mime type looks valid", () => {
  const result = parseHighlightPhotoDataUrl(`data:image/png;base64,${Buffer.from("not a png").toString("base64")}`);
  assert.equal(result, null);
});

test("rejects SVG and malformed data URLs", () => {
  assert.equal(parseHighlightPhotoDataUrl("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(parseHighlightPhotoDataUrl("not-a-data-url"), null);
});

test("rejects photos larger than the upload limit", () => {
  const bytes = Buffer.alloc(MAX_HIGHLIGHT_PHOTO_BYTES + 1);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  const result = parseHighlightPhotoDataUrl(`data:image/jpeg;base64,${bytes.toString("base64")}`);
  assert.equal(result, null);
});

test("normalizes the App Storage SDK's one-buffer download result", () => {
  const expected = Buffer.from("stored image");
  assert.deepEqual(normalizeStoredHighlightPhoto([expected]), expected);
  assert.deepEqual(normalizeStoredHighlightPhoto(expected), expected);
  assert.equal(normalizeStoredHighlightPhoto([]), null);
});
