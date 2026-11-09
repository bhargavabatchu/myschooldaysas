"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Download, FileText, FileUp, X } from "lucide-react";
import {
  getGetFeeInvoiceConcessionHistoryQueryKey,
  getGetFeeInvoicesQueryKey,
  getGetMyFeeInvoicesQueryKey,
  useGetFeeInvoiceConcessionHistory,
  useUpdateFeeInvoiceConcession,
  type FeeInvoice,
} from "@workspace/api-client-react";
import { getAccessToken, refreshRememberedSession } from "../../auth-token";

const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const fieldClass = "field mt-1.5 w-full";
const MAX_ATTACHMENT_BYTES = 700 * 1024;
const MAX_IMAGE_ATTACHMENT_BYTES = 650 * 1024;

type AttachmentDraft = {
  dataUrl: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("The file could not be prepared. Choose it again."));
    reader.onerror = () => reject(new Error("The file could not be read. Choose it again."));
    reader.readAsDataURL(file);
  });
}

function compressPhotoToDataUrl(file: File): Promise<{ dataUrl: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const baseWidth = Math.max(1, Math.round(image.naturalWidth * scale));
      const baseHeight = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      let blob: Blob | null = null;
      try {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          canvas.width = Math.max(1, Math.round(baseWidth * Math.pow(0.8, attempt)));
          canvas.height = Math.max(1, Math.round(baseHeight * Math.pow(0.8, attempt)));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("This photo could not be prepared. Choose another image.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          blob = await new Promise<Blob | null>((done) =>
            canvas.toBlob(done, "image/jpeg", Math.max(0.42, 0.82 - attempt * 0.06)),
          );
          if (blob && blob.size <= MAX_IMAGE_ATTACHMENT_BYTES) break;
        }
        if (!blob || blob.size > MAX_IMAGE_ATTACHMENT_BYTES) {
          throw new Error("This photo is too large to prepare. Choose a smaller image.");
        }
        resolve({ dataUrl: await readDataUrl(blob), sizeBytes: blob.size });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Choose a valid JPEG, PNG, or WebP photo."));
    };
    image.src = objectUrl;
  });
}

async function downloadConcessionAttachment(invoiceId: string, auditId: string): Promise<Blob> {
  const url = `/api/fees/invoices/${encodeURIComponent(invoiceId)}/concession-history/${encodeURIComponent(auditId)}/attachment`;
  const request = (token: string | null) => fetch(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: token
      ? { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" }
      : { Accept: "application/octet-stream" },
  });
  let response = await request(getAccessToken());
  if (response.status === 401) response = await request(await refreshRememberedSession());
  if (!response.ok) throw new Error("The attachment could not be downloaded. Try again.");
  return response.blob();
}

function ConcessionAttachmentDownload({
  invoiceId,
  auditId,
  fileName,
}: {
  invoiceId: string;
  auditId: string;
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = await downloadConcessionAttachment(invoiceId, auditId);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The attachment could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button className="btn btn-muted min-h-8 px-3 text-xs" type="button" onClick={() => void download()} disabled={busy}>
        <Download size={14} aria-hidden="true" />
        {busy ? "Preparing file…" : fileName}
      </button>
      {error && <p className="mt-1 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}

type FeeConcessionEditorProps = {
  invoice: FeeInvoice;
  onClose: () => void;
  onSaved: (invoice: FeeInvoice) => void;
};

export function FeeConcessionEditor({ invoice, onClose, onSaved }: FeeConcessionEditorProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState((invoice.concessionPaise / 100).toFixed(2));
  const [reason, setReason] = useState(invoice.concessionReason ?? "");
  const [validationMessage, setValidationMessage] = useState("");
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const maximumConcessionPaise = invoice.concessionPaise + invoice.balancePaise;
  const history = useGetFeeInvoiceConcessionHistory(invoice.id);
  const update = useUpdateFeeInvoiceConcession({
    mutation: {
      onSuccess: async (updatedInvoice) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetFeeInvoicesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetMyFeeInvoicesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetFeeInvoiceConcessionHistoryQueryKey(invoice.id) }),
        ]);
        onSaved(updatedInvoice);
      },
    },
  });

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setAttachmentError("");
    setAttachmentBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("Choose a file smaller than 20 MB before photo compression.");
      }
      if (file.type === "application/pdf") {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("PDF files must be 700 KB or smaller.");
        }
        setAttachment({
          dataUrl: await readDataUrl(file),
          fileName: file.name,
          contentType: "application/pdf",
          sizeBytes: file.size,
        });
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Choose a PDF, JPEG, PNG, or WebP file.");
      }
      if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
        const compressed = await compressPhotoToDataUrl(file);
        const baseName = file.name.replace(/\.[^.]+$/, "") || "concession-photo";
        setAttachment({
          ...compressed,
          fileName: `${baseName.slice(0, 150)}.jpg`,
          contentType: "image/jpeg",
        });
      } else {
        setAttachment({
          dataUrl: await readDataUrl(file),
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        });
      }
    } catch (caught) {
      setAttachmentError(caught instanceof Error ? caught.message : "The file could not be prepared.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationMessage("");
    const concessionPaise = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(concessionPaise) || concessionPaise < 0 || concessionPaise > maximumConcessionPaise) {
      setValidationMessage(`Enter an amount between ₹0.00 and ${money(maximumConcessionPaise)}.`);
      return;
    }
    if (reason.trim().length < 3) {
      setValidationMessage("Add a reason of at least 3 characters.");
      return;
    }
    update.mutate({
      invoiceId: invoice.id,
      data: {
        concessionPaise,
        reason: reason.trim(),
        ...(attachment
          ? { attachmentDataUrl: attachment.dataUrl, attachmentFileName: attachment.fileName }
          : {}),
      },
    });
  }

  const requestError = update.error as {
    message?: string;
    data?: { error?: { message?: unknown } };
  } | null;
  const errorMessage = typeof requestError?.data?.error?.message === "string"
    ? requestError.data.error.message
    : requestError?.message;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-3 sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !update.isPending && !attachmentBusy) onClose();
      }}
    >
      <section
        className="surface my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl sm:max-h-[calc(100dvh-2rem)] md:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fee-concession-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Student-specific adjustment</p>
            <h2 id="fee-concession-title" className="display mt-1 text-xl font-bold">Fee concession</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {invoice.studentName} · {invoice.invoiceNumber}
            </p>
          </div>
          <button className="btn btn-muted min-h-9 px-3" type="button" onClick={onClose} disabled={update.isPending || attachmentBusy}>
            Close
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[hsl(var(--muted))] p-4 text-sm">
          <div>
            <dt className="text-xs text-[hsl(var(--muted-foreground))]">Original fee</dt>
            <dd className="mt-1 font-semibold">{money(invoice.amountPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[hsl(var(--muted-foreground))]">Current balance</dt>
            <dd className="mt-1 font-semibold">{money(invoice.balancePaise)}</dd>
          </div>
        </dl>

        <section className="mt-5" aria-labelledby="fee-concession-history-title">
          <h3 id="fee-concession-history-title" className="display text-base font-bold">Adjustment history</h3>
          {history.isLoading ? (
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Loading history…</p>
          ) : history.isError ? (
            <p className="mt-2 text-sm text-red-700" role="alert">Adjustment history could not be loaded. Refresh and try again.</p>
          ) : history.data?.items.length ? (
            <ol className="mt-3 max-h-56 space-y-3 overflow-y-auto">
              {history.data.items.map((entry) => (
                <li className="rounded-xl border border-[hsl(var(--border))] p-3 text-sm" key={entry.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{money(entry.previousConcessionPaise)} → {money(entry.newConcessionPaise)}</p>
                    <time className="text-xs text-[hsl(var(--muted-foreground))]" dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1">{entry.reason}</p>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Changed by {entry.actorName}</p>
                  {entry.attachment && (
                    <ConcessionAttachmentDownload
                      invoiceId={invoice.id}
                      auditId={entry.id}
                      fileName={entry.attachment.fileName}
                    />
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">No concession changes have been recorded for this invoice.</p>
          )}
        </section>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold">
            Concession amount (₹)
            <input
              className={fieldClass}
              type="number"
              inputMode="decimal"
              min="0"
              max={(maximumConcessionPaise / 100).toFixed(2)}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              disabled={update.isPending}
            />
          </label>
          <label className="block text-sm font-semibold">
            Internal reason
            <textarea
              className={`${fieldClass} min-h-20`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={240}
              required
              disabled={update.isPending}
              placeholder="For example: approved fee concession"
            />
            <span className="mt-1 block text-xs font-normal text-[hsl(var(--muted-foreground))]">
              Only authorized administrators can see this reason.
            </span>
          </label>
          <section className="rounded-xl border border-[hsl(var(--border))] p-4" aria-labelledby="concession-attachment-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="concession-attachment-title" className="text-sm font-semibold">Supporting letter or photo</h3>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Optional</span>
            </div>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              PDF or JPEG, PNG, and WebP. Maximum 700 KB. Stored privately and visible only to administrators.
            </p>
            <input
              ref={attachmentInputRef}
              className="sr-only"
              type="file"
              accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
              onChange={handleAttachmentChange}
              tabIndex={-1}
              aria-hidden="true"
            />
            <input
              ref={cameraInputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAttachmentChange}
              tabIndex={-1}
              aria-hidden="true"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn btn-muted min-h-9 px-3 text-sm"
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={update.isPending || attachmentBusy}
              >
                <FileUp size={15} aria-hidden="true" />
                Attach file
              </button>
              <button
                className="btn btn-muted min-h-9 px-3 text-sm"
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={update.isPending || attachmentBusy}
              >
                <Camera size={15} aria-hidden="true" />
                Take photo
              </button>
            </div>
            {attachmentBusy && <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Preparing attachment…</p>}
            {attachmentError && <p className="mt-2 text-sm text-red-700" role="alert">{attachmentError}</p>}
            {attachment && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[hsl(var(--muted))] p-3" role="status">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <FileText size={16} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{attachment.fileName} · {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB</span>
                </span>
                <button
                  className="btn btn-muted min-h-8 shrink-0 px-2"
                  type="button"
                  onClick={() => setAttachment(null)}
                  disabled={update.isPending}
                  aria-label="Remove selected attachment"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          </section>
          <p className="rounded-lg border border-[hsl(var(--border))] p-3 text-sm">
            New balance: <strong>{money(Math.max(0, invoice.amountPaise - Math.round(Number(amount || 0) * 100) - invoice.paidPaise))}</strong>
            <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
              Recorded payments stay unchanged; the concession cannot reduce the balance below payments already received.
            </span>
          </p>
          {(validationMessage || errorMessage) && (
            <p className="text-sm text-red-700" role="alert">{validationMessage || errorMessage}</p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button className="btn btn-muted" type="button" onClick={onClose} disabled={update.isPending || attachmentBusy}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={update.isPending || attachmentBusy}>
              {update.isPending ? "Saving…" : attachmentBusy ? "Preparing…" : "Save concession"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
