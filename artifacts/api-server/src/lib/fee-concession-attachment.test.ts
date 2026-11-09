import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FEE_CONCESSION_ATTACHMENT_BYTES,
  normalizeStoredFeeAttachment,
  parseFeeConcessionAttachmentDataUrl,
} from "./fee-concession-attachment.ts";

test("accepts a PDF with a matching signature and sanitizes its name", () => {
  const bytes = Buffer.from("%PDF-1.7 sample");
  const result = parseFeeConcessionAttachmentDataUrl(
    `data:application/pdf;base64,${bytes.toString("base64")}`,
    "../award-letter.pdf",
  );
  assert.equal(result?.contentType, "application/pdf");
  assert.equal(result?.fileName, "award-letter.pdf");
  assert.deepEqual(result?.bytes, bytes);
});

test("accepts supported photo data with a matching file signature", () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const result = parseFeeConcessionAttachmentDataUrl(
    `data:image/jpeg;base64,${bytes.toString("base64")}`,
    "phone-photo.png",
  );
  assert.equal(result?.fileName, "phone-photo.jpg");
  assert.deepEqual(result?.bytes, bytes);
});

test("rejects mismatched signatures, unsupported types, and malformed data URLs", () => {
  const bytes = Buffer.from("not a PDF");
  assert.equal(parseFeeConcessionAttachmentDataUrl(`data:application/pdf;base64,${bytes.toString("base64")}`, "letter.pdf"), null);
  assert.equal(parseFeeConcessionAttachmentDataUrl("data:image/svg+xml;base64,PHN2Zz4=", "letter.svg"), null);
  assert.equal(parseFeeConcessionAttachmentDataUrl("not-a-data-url", "letter.pdf"), null);
});

test("rejects attachments larger than the configured upload limit", () => {
  const bytes = Buffer.alloc(MAX_FEE_CONCESSION_ATTACHMENT_BYTES + 1, 0x20);
  bytes.write("%PDF-");
  const result = parseFeeConcessionAttachmentDataUrl(
    `data:application/pdf;base64,${bytes.toString("base64")}`,
    "letter.pdf",
  );
  assert.equal(result, null);
});

test("normalizes App Storage byte results", () => {
  const expected = Buffer.from("private attachment");
  assert.deepEqual(normalizeStoredFeeAttachment([expected]), expected);
  assert.deepEqual(normalizeStoredFeeAttachment(expected), expected);
  assert.equal(normalizeStoredFeeAttachment([]), null);
});
