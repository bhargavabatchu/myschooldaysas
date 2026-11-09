"use client";

import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getGetFeeInvoicesQueryKey,
  getGetFeeCollectionsQueryKey,
  getGetDashboardOverviewQueryKey,
  getGetMyFeeInvoicesQueryKey,
  recordManualFeePayment,
  type FeeInvoice,
  type ManualFeePaymentInput,
  type ManualFeePaymentResult,
} from "@workspace/api-client-react";

const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const fieldClass = "field mt-1.5 w-full";

function schoolDateToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

type FeePaymentRecorderProps = {
  invoice: FeeInvoice;
  onClose: () => void;
  onSaved: (payment: ManualFeePaymentResult) => void;
};

export function FeePaymentRecorder({ invoice, onClose, onSaved }: FeePaymentRecorderProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "bank_transfer" | "cheque" | "other">("cash");
  const [receivedOn, setReceivedOn] = useState(schoolDateToday);
  const [reference, setReference] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const record = useMutation({
    mutationFn: (data: ManualFeePaymentInput) => recordManualFeePayment(invoice.id, data, {
      headers: { "Idempotency-Key": idempotencyKey },
    }),
    onSuccess: async (payment) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetFeeInvoicesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetFeeCollectionsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetMyFeeInvoicesQueryKey() }),
      ]);
      onSaved(payment);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationMessage("");
    const paymentPaise = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(paymentPaise) || paymentPaise < 1 || paymentPaise > invoice.balancePaise) {
      setValidationMessage(`Enter an amount from ₹0.01 up to the current balance of ${money(invoice.balancePaise)}.`);
      return;
    }
    if (!receivedOn) {
      setValidationMessage("Choose the date the school received this payment.");
      return;
    }
    record.mutate({
      amountPaise: paymentPaise,
      paymentMethod,
      receivedOn,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    });
  }

  const requestError = record.error as {
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
        if (event.target === event.currentTarget && !record.isPending) onClose();
      }}
    >
      <section
        className="surface my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto p-5 shadow-2xl sm:max-h-[calc(100dvh-2rem)] md:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fee-payment-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">School collection</p>
            <h2 id="fee-payment-title" className="display mt-1 text-xl font-bold">Record a payment</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {invoice.studentName} · {invoice.invoiceNumber}
            </p>
          </div>
          <button className="btn btn-muted min-h-9 px-3" type="button" onClick={onClose} disabled={record.isPending}>
            Close
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[hsl(var(--muted))] p-4 text-sm">
          <div>
            <dt className="text-xs text-[hsl(var(--muted-foreground))]">Amount due</dt>
            <dd className="mt-1 font-semibold">{money(invoice.balancePaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[hsl(var(--muted-foreground))]">Already received</dt>
            <dd className="mt-1 font-semibold">{money(invoice.paidPaise)}</dd>
          </div>
        </dl>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold">
            Amount received (₹)
            <input
              className={fieldClass}
              type="number"
              inputMode="decimal"
              min="0.01"
              max={(invoice.balancePaise / 100).toFixed(2)}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              disabled={record.isPending}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Payment method
              <select
                className={fieldClass}
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}
                disabled={record.isPending}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Date received
              <input
                className={fieldClass}
                type="date"
                value={receivedOn}
                onChange={(event) => setReceivedOn(event.target.value)}
                required
                disabled={record.isPending}
              />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Reference (optional)
            <input
              className={fieldClass}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={120}
              disabled={record.isPending}
              placeholder="UPI transaction or cheque number"
            />
          </label>
          <p className="rounded-lg border border-[hsl(var(--border))] p-3 text-sm">
            Remaining after this payment: <strong>{money(Math.max(0, invoice.balancePaise - Math.round(Number(amount || 0) * 100)))} </strong>
            <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
              Partial payments are supported. A receipt will be created for each payment.
            </span>
          </p>
          {(validationMessage || errorMessage) && (
            <p className="text-sm text-red-700" role="alert">{validationMessage || errorMessage}</p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button className="btn btn-muted" type="button" onClick={onClose} disabled={record.isPending}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={record.isPending || invoice.balancePaise <= 0}>
              {record.isPending ? "Recording…" : "Record payment"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
