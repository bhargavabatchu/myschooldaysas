"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFeeInvoicesQueryKey,
  getGetMyFeeInvoicesQueryKey,
  useUpdateFeeInvoiceConcession,
  type FeeInvoice,
} from "@workspace/api-client-react";

const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const fieldClass = "field mt-1.5 w-full";

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
  const maximumConcessionPaise = invoice.concessionPaise + invoice.balancePaise;
  const update = useUpdateFeeInvoiceConcession({
    mutation: {
      onSuccess: async (updatedInvoice) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetFeeInvoicesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetMyFeeInvoicesQueryKey() }),
        ]);
        onSaved(updatedInvoice);
      },
    },
  });

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
      data: { concessionPaise, reason: reason.trim() },
    });
  }

  const requestError = update.error as {
    message?: string;
    data?: { error?: { message?: unknown } };
  } | null;
  const errorMessage = typeof requestError?.data?.error?.message === "string"
    ? requestError.data.error.message
    : requestError?.message;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !update.isPending) onClose();
      }}
    >
      <section
        className="surface w-full max-w-lg p-5 shadow-2xl md:p-6"
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
          <button className="btn btn-muted min-h-9 px-3" type="button" onClick={onClose} disabled={update.isPending}>
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
            <button className="btn btn-muted" type="button" onClick={onClose} disabled={update.isPending}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save concession"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
