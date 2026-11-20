"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPayrollQueryKey,
  useGetPayroll,
  useRecordSalaryPayment,
  useSetStaffSalary,
} from "@workspace/api-client-react";
import { BadgeIndianRupee, Landmark, LoaderCircle, Printer } from "lucide-react";
import { getAccessToken } from "../../auth-token";

const rupees = (paise: number | null | undefined) =>
  ((paise ?? 0) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const currentMonth = () => new Date().toISOString().slice(0, 7);

export function PayrollPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [editingSalaryFor, setEditingSalaryFor] = useState<string | null>(null);
  const [salaryDraft, setSalaryDraft] = useState("");
  const [payDraft, setPayDraft] = useState<{ userId: string; mode: string; notes: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const payroll = useGetPayroll({ month }, { query: { enabled: !!month } });

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetPayrollQueryKey({ month }) });
  const setSalary = useSetStaffSalary({
    mutation: {
      onSuccess: () => { setEditingSalaryFor(null); setSalaryDraft(""); void refresh(); },
      onError: (e) => setError(e instanceof Error ? e.message : "Could not save salary."),
    },
  });
  const pay = useRecordSalaryPayment({
    mutation: {
      onSuccess: () => { setPayDraft(null); void refresh(); },
      onError: (e) => setError(e instanceof Error ? e.message : "Could not record payment."),
    },
  });

  useEffect(() => { setError(null); }, [month]);
  const summary = payroll.data?.summary;

  async function openPayslip(userId: string) {
    const token = getAccessToken();
    if (!token) return;
    const response = await fetch(`/api/identity/payroll/${encodeURIComponent(userId)}/payslip/${month}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function submitSalary(event: FormEvent, userId: string) {
    event.preventDefault();
    const paise = Math.round(Number(salaryDraft) * 100);
    if (Number.isNaN(paise) || paise < 0) return;
    setSalary.mutate({ userId, data: { monthlyAmountPaise: paise } });
  }

  function submitPay(event: FormEvent) {
    event.preventDefault();
    if (!payDraft) return;
    const staff = payroll.data?.items.find((item) => item.userId === payDraft.userId);
    pay.mutate({
      data: {
        userId: payDraft.userId,
        period: month,
        amountPaise: staff?.monthlyAmountPaise ?? 0,
        mode: payDraft.mode as "bank" | "cash" | "cheque" | "other",
        notes: payDraft.notes || null,
      },
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Finance · Administration</p>
          <h1 className="display m-0 text-3xl font-extrabold">Payroll</h1>
          <p className="mb-0 mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
            Monthly salaries for every staff member. Record payments and print payslips.
          </p>
        </div>
        <label className="text-xs font-bold">
          Month
          <input type="month" className="field mt-1.5 min-h-10" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="surface p-4"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Staff</p><p className="display m-0 text-xl font-extrabold">{summary?.staff ?? "—"}</p></div>
        <div className="surface p-4"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Total monthly salary</p><p className="display m-0 text-xl font-extrabold">{rupees(summary?.totalMonthlyPaise)}</p></div>
        <div className="surface p-4"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Paid this month</p><p className="display m-0 text-xl font-extrabold text-[hsl(var(--status-good))]">{summary?.paid ?? "—"}</p></div>
        <div className="surface p-4"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Unpaid this month</p><p className="display m-0 text-xl font-extrabold text-[hsl(var(--destructive))]">{summary?.unpaid ?? "—"}</p></div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">{error}</div>}

      <section className="surface overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] p-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><BadgeIndianRupee size={18} /></div>
          <div>
            <h2 className="display m-0 text-lg font-extrabold">Salary register — {month}</h2>
            <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">Set a monthly salary per staff member, mark the month paid, and print payslips.</p>
          </div>
        </div>
        {payroll.isLoading ? (
          <div className="space-y-3 p-5"><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
        ) : payroll.isError ? (
          <div role="alert" className="p-5 text-sm text-[hsl(var(--destructive))]">Could not load payroll. Refresh and try again.</div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            {payroll.data?.items.map((staff) => (
              <div key={staff.userId} className="px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="m-0 text-sm font-semibold">{staff.name} {staff.employeeCode && <span className="ml-1 font-normal text-xs text-[hsl(var(--muted-foreground))]">({staff.employeeCode})</span>}</p>
                    <p className="m-0 mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{staff.roles.map((role) => role.replaceAll("_", " ")).join(", ")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{staff.monthlyAmountPaise != null ? rupees(staff.monthlyAmountPaise) : <span className="font-normal text-xs text-[hsl(var(--muted-foreground))]">No salary set</span>}</span>
                    {staff.paid
                      ? <span className="rounded-full bg-[hsl(var(--status-good)/.15)] px-2.5 py-1 text-[11px] font-bold text-[hsl(var(--status-good))]">Paid {rupees(staff.paidAmountPaise)}</span>
                      : <span className="rounded-full bg-[hsl(var(--destructive)/.12)] px-2.5 py-1 text-[11px] font-bold text-[hsl(var(--destructive))]">Unpaid</span>}
                    <button type="button" className="btn btn-muted min-h-8 px-3 text-xs" onClick={() => { setEditingSalaryFor(editingSalaryFor === staff.userId ? null : staff.userId); setSalaryDraft(staff.monthlyAmountPaise != null ? String(staff.monthlyAmountPaise / 100) : ""); }}>
                      {editingSalaryFor === staff.userId ? "Cancel" : "Set salary"}
                    </button>
                    {staff.monthlyAmountPaise != null && !staff.paid && (
                      <button type="button" className="btn btn-primary min-h-8 px-3 text-xs" disabled={pay.isPending} onClick={() => setPayDraft({ userId: staff.userId, mode: "bank", notes: "" })}>
                        {pay.isPending && payDraft?.userId === staff.userId ? <LoaderCircle size={13} className="animate-spin" /> : <Landmark size={13} />} Mark paid
                      </button>
                    )}
                    {staff.paid && (
                      <button type="button" className="btn btn-muted min-h-8 px-3 text-xs" onClick={() => void openPayslip(staff.userId)}>
                        <Printer size={13} /> Payslip
                      </button>
                    )}
                  </div>
                </div>

                {editingSalaryFor === staff.userId && (
                  <form onSubmit={(event) => submitSalary(event, staff.userId)} className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-[hsl(var(--background))] p-4">
                    <label className="text-xs font-semibold">
                      Monthly salary (₹)
                      <input className="field mt-1.5 min-w-40" type="number" min={0} step="1" value={salaryDraft} onChange={(event) => setSalaryDraft(event.target.value)} />
                    </label>
                    <button disabled={setSalary.isPending} className="btn btn-primary min-h-10">{setSalary.isPending ? "Saving…" : "Save salary"}</button>
                    <button type="button" className="btn btn-muted min-h-10" onClick={() => setEditingSalaryFor(null)}>Cancel</button>
                  </form>
                )}

                {payDraft?.userId === staff.userId && (
                  <form onSubmit={submitPay} className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-[hsl(var(--background))] p-4">
                    <span className="text-xs font-semibold">Pay {rupees(staff.monthlyAmountPaise)} for {month}</span>
                    <label className="text-xs font-semibold">
                      Mode
                      <select className="field mt-1.5 min-w-32" value={payDraft.mode} onChange={(event) => setPayDraft({ ...payDraft, mode: event.target.value })}>
                        <option value="bank">Bank transfer</option>
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold">
                      Notes
                      <input className="field mt-1.5 min-w-48" maxLength={300} value={payDraft.notes} onChange={(event) => setPayDraft({ ...payDraft, notes: event.target.value })} />
                    </label>
                    <button disabled={pay.isPending} className="btn btn-primary min-h-10">{pay.isPending ? "Recording…" : "Record payment"}</button>
                    <button type="button" className="btn btn-muted min-h-10" onClick={() => setPayDraft(null)}>Cancel</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
