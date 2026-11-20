"use client";

import { useState } from "react";
import {
  useGetCertificateLog,
  useGetClasses,
  useGetEnrollmentTrends,
  useGetFeesDueReport,
  getGetFeesDueReportQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FileBarChart, Download, LoaderCircle } from "lucide-react";
import { getAccessToken } from "../../auth-token";

const rupees = (paise: number | null | undefined) =>
  ((paise ?? 0) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type ReportKind = "trends" | "fees" | "certificates";

function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escape = (value: string | number | null) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const csv = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ReportsPage() {
  const classesQuery = useGetClasses();
  const classes = (classesQuery.data?.items ?? []).map((item) => ({ id: item.id, name: item.name }));
  const [report, setReport] = useState<ReportKind>("trends");
  const tabs: { kind: ReportKind; label: string }[] = [
    { kind: "trends", label: "Joiners & leavers trend" },
    { kind: "fees", label: "Fee dues" },
    { kind: "certificates", label: "Certificates issued" },
  ];
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5">
      <header>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Finance · Administration</p>
        <h1 className="display m-0 text-3xl font-extrabold">Reports &amp; analytics</h1>
        <p className="mb-0 mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
          Enrollment trends, fee dues with paid / unpaid filters, and the certificate issuance log.
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.kind} type="button" className={`btn min-h-10 px-4 ${report === tab.kind ? "btn-primary" : "btn-muted"}`} onClick={() => setReport(tab.kind)}>
            <FileBarChart size={15} /> {tab.label}
          </button>
        ))}
      </div>
      {report === "trends" && <TrendsReport />}
      {report === "fees" && <FeesDueReport classes={classes} />}
      {report === "certificates" && <CertificatesReport />}
    </main>
  );
}

function TrendsReport() {
  const trends = useGetEnrollmentTrends({ months: 12 });
  const series = trends.data?.series ?? [];
  const max = Math.max(1, ...series.map((row) => Math.max(row.joiners, row.leavers)));
  return (
    <section className="surface p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="display m-0 text-lg font-extrabold">Joiners vs leavers — last 12 months</h2>
        <span className="tag">Current strength: {trends.data?.currentStrength ?? "—"} students</span>
      </div>
      {trends.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-[hsl(var(--muted-foreground))]"><LoaderCircle size={16} className="animate-spin" /> Loading trend…</div>
      ) : trends.isError ? (
        <div role="alert" className="text-sm text-[hsl(var(--destructive))]">Could not load the enrollment trend.</div>
      ) : series.length === 0 ? (
        <p className="mb-0 text-sm text-[hsl(var(--muted-foreground))]">No enrollment activity in the last 12 months.</p>
      ) : (
        <>
          <div className="flex items-end gap-2 overflow-x-auto pb-2" role="img" aria-label="Bar chart of joiners and leavers per month">
            {series.map((row) => (
              <div key={row.month} className="flex min-w-14 flex-1 flex-col items-center gap-1">
                <div className="flex h-40 w-full items-end justify-center gap-1">
                  <div className="w-5 rounded-t bg-[hsl(var(--primary))]" style={{ height: `${(row.joiners / max) * 100}%` }} title={`Joiners: ${row.joiners}`} />
                  <div className="w-5 rounded-t bg-[hsl(var(--destructive)/.7)]" style={{ height: `${(row.leavers / max) * 100}%` }} title={`Leavers: ${row.leavers}`} />
                </div>
                <span className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">{row.month.slice(5)}/{row.month.slice(2, 4)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[hsl(var(--primary))]" /> New joiners</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[hsl(var(--destructive)/.7)]" /> Leavers</span>
          </div>
          <div className="mt-5 border-t border-[hsl(var(--border))] pt-4">
            <h3 className="m-0 text-xs font-bold">Leaver reasons</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(trends.data?.reasons ?? {}).map(([reason, count]) => (
                <span key={reason} className="tag">{reason.replaceAll("_", " ")}: {count}</span>
              ))}
              {Object.keys(trends.data?.reasons ?? {}).length === 0 && <span className="text-xs text-[hsl(var(--muted-foreground))]">No leavers recorded.</span>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function FeesDueReport({ classes }: { classes: { id: string; name: string }[] }) {
  const queryClient = useQueryClient();
  const [academicYear, setAcademicYear] = useState("2026-27");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState<"all" | "paid" | "unpaid" | "partial">("all");
  const params = { academicYear, ...(classId ? { classId } : {}), status, limit: 100 };
  const report = useGetFeesDueReport(params, { query: { enabled: !!academicYear } });
  const summary = report.data?.summary;

  function exportCsv() {
    const rows = (report.data?.items ?? []).map((item) => [
      item.invoiceNumber, item.studentName, item.admissionNo ?? "", item.className ?? "", item.sectionName ?? "",
      item.academicYear, item.period, (item.amountPaise / 100).toFixed(2), (item.concessionPaise / 100).toFixed(2),
      (item.paidPaise / 100).toFixed(2), (item.balancePaise / 100).toFixed(2), item.dueDate ?? "", item.status,
    ]);
    downloadCsv(`fee-dues-${academicYear}-${status}.csv`,
      ["Invoice", "Student", "Admission No", "Class", "Section", "Year", "Period", "Amount", "Concession", "Paid", "Balance", "Due date", "Status"],
      rows);
  }

  return (
    <section className="surface p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold">Academic year
            <input className="field mt-1.5 min-w-32" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="2026-27" />
          </label>
          <label className="text-xs font-bold">Class
            <select className="field mt-1.5 min-w-36" value={classId} onChange={(event) => { setClassId(event.target.value); queryClient.invalidateQueries({ queryKey: getGetFeesDueReportQueryKey(params) }); }}>
              <option value="">All classes</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold">Status
            <select className="field mt-1.5 min-w-32" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Not paid</option>
              <option value="partial">Partially paid</option>
            </select>
          </label>
        </div>
        <button type="button" className="btn btn-muted min-h-10" disabled={report.isLoading} onClick={exportCsv}>
          <Download size={15} /> Export CSV
        </button>
      </div>

      <div className="pg-stats">
        <div className="pg-stat"><span className="pg-icon pg-icon-green"><Download size={18} /></span><div><span>Total collected</span><strong>{summary?.collected ?? "—"}</strong></div></div>
        <div className="pg-stat"><span className="pg-icon pg-icon-red"><Download size={18} /></span><div><span>Outstanding dues</span><strong>{summary?.outstanding ?? "—"}</strong></div><em className="pg-icon-red">{summary?.unpaid ?? 0} not paid</em></div>
        <div className="pg-stat"><span className="pg-icon pg-icon-amber"><Download size={18} /></span><div><span>Partially paid</span><strong>{summary?.partial ?? "—"}</strong></div></div>
        <div className="pg-stat"><span className="pg-icon pg-icon-blue"><Download size={18} /></span><div><span>Total billed</span><strong>{summary?.billed ?? "—"}</strong></div><em className="pg-icon-green">{summary?.paid ?? 0} paid</em></div>
      </div>

      {report.isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-[hsl(var(--muted-foreground))]"><LoaderCircle size={16} className="animate-spin" /> Loading report…</div>
      ) : report.isError ? (
        <div role="alert" className="text-sm text-[hsl(var(--destructive))]">Could not load the fee dues report.</div>
      ) : !report.data?.items.length ? (
        <p className="mb-0 text-sm text-[hsl(var(--muted-foreground))]">No invoices match these filters. Generate invoices from the Fees page first.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-[hsl(var(--border))] text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              <th className="p-2">Invoice</th><th className="p-2">Student</th><th className="p-2">Class</th><th className="p-2">Period</th>
              <th className="p-2 text-right">Amount</th><th className="p-2 text-right">Concession</th><th className="p-2 text-right">Paid</th>
              <th className="p-2 text-right">Balance</th><th className="p-2">Due</th><th className="p-2">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {report.data.items.map((item) => (
                <tr key={item.invoiceNumber}>
                  <td className="p-2 font-semibold">{item.invoiceNumber}</td>
                  <td className="p-2">{item.studentName}</td>
                  <td className="p-2">{item.className ?? "—"}{item.sectionName ? ` · ${item.sectionName}` : ""}</td>
                  <td className="p-2">{item.period}</td>
                  <td className="p-2 text-right">{rupees(item.amountPaise)}</td>
                  <td className="p-2 text-right">{item.concessionPaise ? rupees(item.concessionPaise) : "—"}</td>
                  <td className="p-2 text-right">{rupees(item.paidPaise)}</td>
                  <td className="p-2 text-right font-bold">{item.balancePaise > 0 ? rupees(item.balancePaise) : "—"}</td>
                  <td className="p-2">{item.dueDate ?? "—"}</td>
                  <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === "paid" ? "bg-[hsl(var(--status-good)/.15)] text-[hsl(var(--status-good))]" : item.status === "partial" ? "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]" : "bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]"}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CertificatesReport() {
  const log = useGetCertificateLog({ limit: 100 });
  const kindLabels: Record<string, string> = { tc: "Transfer certificate", bonafide: "Bonafide", study: "Study", character: "Character" };
  return (
    <section className="surface p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="display m-0 text-lg font-extrabold">Certificates issued</h2>
        <span className="tag">{log.data?.total ?? 0}</span>
      </div>
      {log.isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-[hsl(var(--muted-foreground))]"><LoaderCircle size={16} className="animate-spin" /> Loading log…</div>
      ) : log.isError ? (
        <div role="alert" className="text-sm text-[hsl(var(--destructive))]">Could not load the certificate log.</div>
      ) : !log.data?.items.length ? (
        <p className="mb-0 text-sm text-[hsl(var(--muted-foreground))]">No certificates issued yet. Issued certificates (from student profiles) are logged here automatically.</p>
      ) : (
        <div className="divide-y divide-[hsl(var(--border))]">
          {log.data.items.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="m-0 text-sm font-semibold">{entry.studentName} <span className="ml-2 tag">{kindLabels[entry.kind] ?? entry.kind}</span></p>
                <p className="m-0 mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Issued by {entry.issuedBy}{entry.admissionNo ? ` · ${entry.admissionNo}` : ""}</p>
              </div>
              <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{new Date(entry.issuedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
