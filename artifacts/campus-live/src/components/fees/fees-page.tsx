"use client";

import { type FormEvent, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFeeInvoicesQueryKey,
  getGetMyFeeInvoicesQueryKey,
  getGetFeeCollectionsQueryKey,
  getGetDashboardOverviewQueryKey,
  useGenerateFeeInvoices,
  useGetFeeInvoices,
  useGetFeeReceipt,
  useGetMyFeeInvoices,
  useGetAcademicYears,
  useGetSections,
  usePayFeeInvoice,
  type FeeInvoice,
} from "@workspace/api-client-react";
import { SCHOOL_NAME } from "@/lib/branding";
import { onlinePaymentsEnabled } from "@/lib/features";
import { AcademicYearSelect } from "@/components/academic/academic-year-select";
import { FeeConcessionEditor } from "./fee-concession-editor";
import { FeePaymentRecorder } from "./fee-payment-recorder";
import { FeeCollectionReport } from "./fee-collection-report";
import './school-work-pages.css';

const adminRoles = ["super_admin", "org_admin", "campus_admin"];
const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const dateText = (value?: string | Date | null) => value
  ? value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
  : "—";
const fieldClass = "field w-full";
const paymentMethodText = (method: string) => ({
  mock: "Online test",
  razorpay: "Razorpay",
  manual: "Manual",
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  other: "Other",
}[method] ?? method);

function invoiceGenerationError(error: unknown) {
  const candidate = error as {
    status?: number;
    message?: string;
    data?: { error?: { code?: unknown; message?: unknown } };
  } | null;
  const code = candidate?.data?.error?.code;

  if (code === "INVOICE_CONFLICT") {
    return "An invoice already exists for one or more students in this academic year and billing period with different details. Check Recent invoices; no duplicate was created.";
  }
  if (code === "NO_ACTIVE_STUDENTS") {
    return "No active students are enrolled in the selected target for that academic year. Check your selection and academic year.";
  }
  if (typeof candidate?.data?.error?.message === "string") {
    return candidate.data.error.message;
  }
  if (candidate?.status === 409) {
    return "This billing period could not be issued. Check Recent invoices and confirm the selected target has active students for that academic year.";
  }
  return candidate?.message || "Invoices could not be issued.";
}

type FeesPageProps = { roles: string[] };

export function FeesPage({ roles }: FeesPageProps) {
  const isAdmin = roles.some((role) => adminRoles.includes(role));
  const isParent = roles.includes("parent");
  const isStudent = roles.includes("student");
  const isStudentOnlyView = isStudent && !isParent;
  const queryClient = useQueryClient();
  const sections = useGetSections(undefined, { query: { enabled: isAdmin } });
  const academicYears = useGetAcademicYears({ query: { enabled: isAdmin } });
  const sectionItems = sections.data?.items ?? [];
  const classItems = Array.from(new Map(
    sectionItems.map((section) => [section.classId, { id: section.classId, name: section.className }]),
  ).values());
  const invoices = useGetFeeInvoices(
    { limit: 100, offset: 0 },
    { query: { enabled: isAdmin } },
  );
  const myInvoices = useGetMyFeeInvoices({ query: { enabled: isParent || isStudent } });
  const [targetMode, setTargetMode] = useState<"school" | "class" | "section">("class");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [period, setPeriod] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notice, setNotice] = useState("");
  const [editingInvoice, setEditingInvoice] = useState<FeeInvoice | null>(null);
  const [recordingInvoice, setRecordingInvoice] = useState<FeeInvoice | null>(null);
  const selectedClassSections = sectionItems.filter((section) => section.classId === classId);
  const selectedSection = sectionItems.find((section) => section.id === sectionId);
  const activeSectionItems = sectionItems.filter((section) => section.isActive && section.classIsActive);
  const targetSectionCount = targetMode === "school"
    ? activeSectionItems.length
    : targetMode === "class" ? selectedClassSections.length : sectionId ? 1 : 0;
  const academicYearItems = academicYears.data?.items ?? [];
  const availableAcademicYears = academicYearItems.map((year) => year.academicYear);
  const currentAcademicYear = academicYearItems.find((year) => year.status === "current")?.academicYear ?? "";
  const selectedAcademicYear = availableAcademicYears.includes(academicYear)
    ? academicYear
    : currentAcademicYear || availableAcademicYears[0] || "";
  const targetLabel = targetMode === "school"
    ? "the entire school"
    : targetMode === "class"
      ? `${classItems.find((item) => item.id === classId)?.name ?? "selected class"} across ${selectedClassSections.length} section${selectedClassSections.length === 1 ? "" : "s"}`
      : selectedSection ? `${selectedSection.className} · ${selectedSection.name}` : "selected section";

  const generate = useGenerateFeeInvoices({
    mutation: {
      onSuccess: async (result) => {
        setNotice(result.generatedCount
          ? `${result.generatedCount} invoice${result.generatedCount === 1 ? "" : "s"} issued for ${targetLabel}.`
          : `Fees have already been issued for ${targetLabel} in this billing period. No duplicates were created.`);
        await queryClient.invalidateQueries({ queryKey: getGetFeeInvoicesQueryKey() });
      },
      onError: async (error) => {
        setNotice(invoiceGenerationError(error));
        await queryClient.invalidateQueries({ queryKey: getGetFeeInvoicesQueryKey() });
      },
    },
  });
  const pay = usePayFeeInvoice({
    mutation: {
      onSuccess: async (result) => {
        setNotice(`Payment complete. Receipt ${result.receiptNumber} is ready.`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetMyFeeInvoicesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetFeeCollectionsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
        ]);
      },
      onError: (error) => setNotice(error.message || "Payment could not be completed."),
    },
  });

  function submitInvoices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const amountPaise = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) {
      setNotice("Enter a valid amount in rupees.");
      return;
    }
    if (!selectedAcademicYear) {
      setNotice("Set up an academic year from the Academic calendar first.");
      return;
    }
    const target = targetMode === "school"
      ? { schoolWide: true as const }
      : targetMode === "class" ? { classId } : { sectionId };
    generate.mutate({
      data: { ...target, academicYear: selectedAcademicYear, period, description, amountPaise, dueDate },
    });
  }

  if (isAdmin) {
    const invoiceItems = invoices.data?.items ?? [];
    return (
      <div className="fees-admin-page mx-auto max-w-6xl space-y-6">
        <header>
          <p className="eyebrow">School finance</p>
          <h1 className="display text-3xl font-extrabold">Fee invoices</h1>
          <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
            Issue invoices to every active student in the school, a class, or one section. Repeating the same period will not create duplicate invoices.
          </p>
        </header>

        <FeeCollectionReport />

        <section className="surface fees-issue-panel p-5 md:p-6">
          <h2 className="display text-lg font-bold">Issue invoices by school, class, or section</h2>
          <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={submitInvoices}>
            <label className="block text-sm font-semibold">
              Issue to
              <select
                className={`${fieldClass} mt-2`}
                value={targetMode}
                onChange={(event) => setTargetMode(event.target.value as "school" | "class" | "section")}
                disabled={generate.isPending}
              >
                <option value="school">Entire school</option>
                <option value="class">All sections in a class</option>
                <option value="section">One section</option>
              </select>
            </label>
            {targetMode === "class" ? (
              <label className="block text-sm font-semibold">
                Class
                <select className={`${fieldClass} mt-2`} value={classId} onChange={(event) => setClassId(event.target.value)} required disabled={generate.isPending}>
                  <option value="">Choose a class</option>
                  {classItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                {classId && <span className="mt-1 block text-xs font-normal text-[hsl(var(--muted-foreground))]">{selectedClassSections.length} section{selectedClassSections.length === 1 ? "" : "s"} included</span>}
              </label>
            ) : targetMode === "section" ? (
              <label className="block text-sm font-semibold">
                Section
                <select className={`${fieldClass} mt-2`} value={sectionId} onChange={(event) => setSectionId(event.target.value)} required disabled={generate.isPending}>
                  <option value="">Choose a section</option>
                  {sectionItems.map((section) => (
                    <option key={section.id} value={section.id}>{section.className} · {section.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs text-[hsl(var(--muted-foreground))]">
                One invoice will be issued to each active student enrolled in the selected academic year. The total count and amount depend on that year’s active enrollments.
              </div>
            )}
            <div>
              <AcademicYearSelect
                label="Academic year"
                items={academicYearItems}
                value={selectedAcademicYear}
                onChange={setAcademicYear}
                disabled={targetSectionCount === 0 || academicYears.isLoading || generate.isPending || availableAcademicYears.length === 0}
              />
              {availableAcademicYears.length > 0 && (
                <span className="mt-1 block text-xs font-normal text-[hsl(var(--muted-foreground))]">
                  Invoices are created only for students actively enrolled in the selected year.
                </span>
              )}
              {academicYears.isError && (
                <span className="mt-1 block text-xs font-normal text-red-700">
                  Academic years could not be loaded. Refresh and try again.
                </span>
              )}
              {!academicYears.isLoading && !academicYears.isError && availableAcademicYears.length === 0 && (
                <a href="/calendar" className="mt-1 block text-xs font-semibold text-[hsl(var(--primary))]">Set up academic years</a>
              )}
            </div>
            <label className="block text-sm font-semibold">
              Billing period
              <input className={`${fieldClass} mt-2`} value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="Term 1 or 2026-10" maxLength={40} required />
            </label>
            <label className="block text-sm font-semibold">
              Description
              <input className={`${fieldClass} mt-2`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Term 1 tuition fee" maxLength={160} required />
            </label>
            <label className="block text-sm font-semibold">
              Amount per student (₹)
              <input className={`${fieldClass} mt-2`} type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </label>
            <label className="block text-sm font-semibold">
              Due date
              <input className={`${fieldClass} mt-2`} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
            </label>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <button className="btn btn-primary" type="submit" disabled={generate.isPending || targetSectionCount === 0 || !selectedAcademicYear}>
                {generate.isPending
                  ? "Issuing…"
                  : targetMode === "school"
                    ? "Issue school-wide invoices"
                    : targetMode === "class" ? "Issue class invoices" : "Issue section invoices"}
              </button>
              {notice && <p className="text-sm text-[hsl(var(--muted-foreground))]" role="status">{notice}</p>}
            </div>
          </form>
          {sections.isError && <p className="mt-3 text-sm text-red-700">Sections could not be loaded. Refresh and try again.</p>}
          {invoices.isError && <p className="mt-3 text-sm text-red-700">Invoices could not be loaded. Refresh and try again.</p>}
        </section>

        <section className="surface fees-invoice-table overflow-hidden">
          <div className="border-b border-[hsl(var(--border))] p-5">
            <h2 className="display text-lg font-bold">Recent invoices</h2>
          </div>
          {invoices.isLoading ? <p className="p-5 text-sm">Loading invoices…</p> : invoiceItems.length === 0
            ? <p className="p-5 text-sm text-[hsl(var(--muted-foreground))]">No fee invoices have been issued yet.</p>
            : <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-[hsl(var(--muted))] text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  <tr><th className="p-3">Student</th><th className="p-3">Invoice</th><th className="p-3">Period</th><th className="p-3">Fee</th><th className="p-3">Concession</th><th className="p-3">Balance</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3">Payments & receipts</th><th className="p-3">Action</th></tr>
                </thead>
                <tbody>
                  {invoiceItems.map((invoice) => (
                    <tr className="border-t border-[hsl(var(--border))]" key={invoice.id}>
                      <td className="p-3 font-semibold">{invoice.studentName}</td>
                      <td className="p-3">{invoice.invoiceNumber}</td>
                      <td className="p-3">{invoice.period} · {invoice.academicYear}</td>
                      <td className="p-3">{money(invoice.amountPaise)}</td>
                      <td className="p-3">{invoice.concessionPaise ? `−${money(invoice.concessionPaise)}` : "—"}</td>
                      <td className="p-3 font-semibold">{money(invoice.balancePaise)}</td>
                      <td className="p-3">{dateText(invoice.dueDate)}</td>
                      <td className="p-3 capitalize">{invoice.status}</td>
                      <td className="p-3">
                        {invoice.payments.length
                          ? <div className="space-y-2">
                            {invoice.payments.map((payment) => (
                              <div key={payment.receiptNumber}>
                                <Link className="font-semibold text-[hsl(var(--primary))] underline" href={`/fees/receipts/${encodeURIComponent(payment.receiptNumber)}`}>{payment.receiptNumber}</Link>
                                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                  {money(payment.amountPaise)} · {paymentMethodText(payment.paymentMethod)} · {dateText(payment.paymentDate)}
                                  {payment.paymentReference ? ` · ${payment.paymentReference}` : ""}
                                  {payment.collectorName ? ` · Collected by ${payment.collectorName}` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                          : "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {invoice.status === "unpaid" && invoice.balancePaise > 0 && (
                            <button className="btn btn-primary min-h-9 px-3" type="button" onClick={() => setRecordingInvoice(invoice)}>
                              Record payment
                            </button>
                          )}
                          {(invoice.status === "unpaid" || invoice.status === "waived") && (
                            <button className="btn btn-muted min-h-9 px-3" type="button" onClick={() => setEditingInvoice(invoice)}>
                              {invoice.concessionPaise ? "Edit concession" : "Add concession"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
        </section>
        {editingInvoice && (
          <FeeConcessionEditor
            invoice={editingInvoice}
            onClose={() => setEditingInvoice(null)}
            onSaved={(updatedInvoice) => {
              setEditingInvoice(null);
              setNotice(`Concession updated for ${updatedInvoice.studentName}. Only this invoice changed.`);
            }}
          />
        )}
        {recordingInvoice && (
          <FeePaymentRecorder
            invoice={recordingInvoice}
            onClose={() => setRecordingInvoice(null)}
            onSaved={(payment) => {
              setRecordingInvoice(null);
              setNotice(`${money(payment.amountPaise)} received from ${recordingInvoice.studentName}. Remaining balance: ${money(payment.balancePaise)}. Receipt ${payment.receiptNumber} is ready.`);
            }}
          />
        )}
      </div>
    );
  }

  if (isParent || isStudent) {
    const items = myInvoices.data?.items ?? [];
    return (
      <div className="fees-family-page mx-auto max-w-5xl space-y-6">
        <header>
          <p className="eyebrow">{isStudentOnlyView ? "Student account" : "Family account"}</p>
          <h1 className="display text-3xl font-extrabold">Fees and receipts</h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {isStudentOnlyView
              ? "View invoices and receipts for your own account. Ask your parent or guardian about payment."
              : onlinePaymentsEnabled
                ? "View invoices for your linked children and pay eligible balances."
                : "View invoices and receipts for your linked children. Online payments are temporarily unavailable; contact the school for payment instructions."}
          </p>
        </header>
        {notice && <div className="surface p-4 text-sm" role="status">{notice}</div>}
        {myInvoices.isError && <div className="surface p-5 text-sm text-red-700">Fee information could not be loaded. Refresh and try again.</div>}
        {myInvoices.isLoading ? <div className="surface p-5 text-sm">Loading fee information…</div>
          : items.length === 0 ? <div className="surface p-6 text-sm text-[hsl(var(--muted-foreground))]">{isStudentOnlyView ? "There are no invoices for your student account." : "There are no invoices for your linked children."}</div>
            : <div className="space-y-4">
              {items.map((invoice) => (
                <article className="surface family-invoice p-5 md:p-6" key={invoice.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{invoice.studentName}</p>
                      <h2 className="display mt-1 text-xl font-bold">{invoice.description}</h2>
                      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{invoice.invoiceNumber} · {invoice.period} · {invoice.academicYear}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${invoice.status === "paid" || invoice.status === "waived" ? "bg-emerald-100 text-emerald-800" : invoice.status === "void" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-900"}`}>
                      {invoice.status}
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-[hsl(var(--border))] pt-4">
                    <div className="flex flex-wrap gap-x-8 gap-y-3">
                      <div><p className="text-xs text-[hsl(var(--muted-foreground))]">Original fee</p><p className="mt-1 font-semibold">{money(invoice.amountPaise)}</p></div>
                      <div><p className="text-xs text-[hsl(var(--muted-foreground))]">Concession</p><p className="mt-1 font-semibold">{invoice.concessionPaise ? `−${money(invoice.concessionPaise)}` : "—"}</p></div>
                      <div><p className="text-xs text-[hsl(var(--muted-foreground))]">Paid</p><p className="mt-1 font-semibold">{money(invoice.paidPaise)}</p></div>
                      <div><p className="text-xs text-[hsl(var(--muted-foreground))]">Balance due</p><p className="mt-1 text-lg font-bold">{money(invoice.balancePaise)}</p></div>
                      <div><p className="text-xs text-[hsl(var(--muted-foreground))]">Due date</p><p className="mt-1 font-semibold">{dateText(invoice.dueDate)}</p></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {onlinePaymentsEnabled && invoice.canPay && invoice.status === "unpaid" && (
                        <button className="btn btn-primary" disabled={pay.isPending} onClick={() => pay.mutate({ invoiceId: invoice.id })}>
                          {pay.isPending ? "Processing…" : "Pay now"}
                        </button>
                      )}
                      {(!onlinePaymentsEnabled || !invoice.canPay) && invoice.status === "unpaid" && (
                        <span className="text-sm text-[hsl(var(--muted-foreground))]">
                          {isStudentOnlyView
                            ? "Ask a parent or guardian about payment."
                            : onlinePaymentsEnabled
                              ? "Payment is not enabled for this account."
                              : "Online payments are unavailable. Contact the school."}
                        </span>
                      )}
                    </div>
                  </div>
                  {invoice.payments.length > 0 && (
                    <div className="mt-4 border-t border-[hsl(var(--border))] pt-4">
                      <h3 className="text-sm font-semibold">Payment receipts</h3>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {invoice.payments.map((payment) => (
                          <li key={payment.receiptNumber}>
                            <Link className="btn btn-muted min-h-9 px-3 text-xs" href={`/fees/receipts/${encodeURIComponent(payment.receiptNumber)}`}>
                              {money(payment.amountPaise)} · {paymentMethodText(payment.paymentMethod)}{payment.collectorName ? ` · Collected by ${payment.collectorName}` : ""} · receipt
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))}
            </div>}
      </div>
    );
  }

  return <div className="fees-access-notice surface p-6 text-sm">Fee access is available to school administrators, parents, and students.</div>;
}

export function FeeReceiptPage() {
  const { receiptNumber = "" } = useParams<{ receiptNumber: string }>();
  const receipt = useGetFeeReceipt(receiptNumber);
  if (receipt.isLoading) return <div className="fee-receipt-page surface mx-auto max-w-2xl p-6">Loading receipt…</div>;
  if (receipt.isError || !receipt.data) return <div className="fee-receipt-page surface mx-auto max-w-2xl p-6 text-sm text-red-700">Receipt could not be loaded.</div>;
  const item = receipt.data;
  return (
    <div className="fee-receipt-page mx-auto max-w-2xl">
      <style>{`@media print { body * { visibility: hidden !important; } #fee-receipt, #fee-receipt * { visibility: visible !important; } #fee-receipt { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; } }`}</style>
      <article id="fee-receipt" className="surface p-7 md:p-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{SCHOOL_NAME} · payment receipt</p>
            <h1 className="display mt-2 text-3xl font-extrabold">Payment received</h1>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">PAID</span>
        </div>
        <dl className="mt-8 grid gap-5 border-y border-[hsl(var(--border))] py-6 sm:grid-cols-2">
          <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Receipt number</dt><dd className="mt-1 font-semibold">{item.receiptNumber}</dd></div>
          <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Invoice number</dt><dd className="mt-1 font-semibold">{item.invoiceNumber}</dd></div>
          <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Student</dt><dd className="mt-1 font-semibold">{item.studentName}</dd></div>
          <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Payment date</dt><dd className="mt-1 font-semibold">{dateText(item.paymentDate)}</dd></div>
          <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Description</dt><dd className="mt-1 font-semibold">{item.description}</dd></div>
          <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Billing period</dt><dd className="mt-1 font-semibold">{item.period} · {item.academicYear}</dd></div>
          <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Payment method</dt><dd className="mt-1 font-semibold">{paymentMethodText(item.paymentMethod)}</dd></div>
          {item.collectorName && <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Collected by</dt><dd className="mt-1 font-semibold">{item.collectorName}</dd></div>}
          {item.paymentReference && <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Reference</dt><dd className="mt-1 font-semibold">{item.paymentReference}</dd></div>}
          <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Amount paid</dt><dd className="mt-1 text-xl font-extrabold">{money(item.amountPaise)}</dd></div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3 print:hidden">
          <button className="btn btn-primary" onClick={() => window.print()}>Print receipt</button>
          <Link className="btn btn-muted" href="/fees">Back to fees</Link>
        </div>
      </article>
    </div>
  );
}
