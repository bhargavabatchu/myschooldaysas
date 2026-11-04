"use client";

import { useGetMySchoolAttendance } from "@workspace/api-client-react";
import { CalendarDays, CircleAlert, Clock3, RefreshCw } from "lucide-react";
import "../fees/school-work-pages.css";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatAttendanceDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00`));
}

const statusStyle: Record<string, string> = {
  present: "bg-[hsl(var(--status-good-bg))] text-[hsl(var(--brand-mint-ink))]",
  late: "bg-[hsl(var(--accent)/.14)] text-[hsl(var(--accent))]",
  absent: "bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]",
  leave: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
};

export function StudentAttendanceView() {
  const attendance = useGetMySchoolAttendance();
  const data = attendance.data;
  const summary = data?.summary;

  return (
    <div className="attendance-page space-y-5">
      <header>
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">
            <span className="h-px w-7 bg-[hsl(var(--accent))]" />
            My school record
          </div>
          <h1 className="display m-0 text-[28px] font-extrabold tracking-[-.04em] sm:text-[34px]">My attendance</h1>
          <p className="mb-0 mt-2 text-[13px] text-[hsl(var(--muted-foreground))]">
            Review your recorded school days and attendance status.
          </p>
        </div>
      </header>

      {attendance.isError && (
        <div role="alert" className="surface flex flex-wrap items-center gap-3 p-4 text-sm text-[hsl(var(--destructive))]">
          <CircleAlert size={17} />
          <span>Attendance could not be loaded. Please try again.</span>
          <button type="button" className="btn btn-muted btn-sm ml-auto" onClick={() => attendance.refetch()}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {attendance.isLoading ? (
        <div className="space-y-4">
          <div className="surface skeleton h-36" />
          <div className="surface skeleton h-56" />
        </div>
      ) : data && summary ? (
        <>
          <section className="surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-5 p-4 sm:p-5">
              <div>
                <p className="eyebrow mb-1">Attendance rate</p>
                <div className="display text-4xl font-extrabold tracking-tight">
                  {summary.attendancePercent === null ? "—" : `${summary.attendancePercent}%`}
                </div>
                <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {summary.countedDays
                    ? `Calculated from ${summary.countedDays} recorded school days`
                    : "No counted school days have been recorded yet"}
                </p>
              </div>
              <div className="grid min-w-full grid-cols-2 gap-2 sm:min-w-[420px] sm:grid-cols-4">
                {[
                  ["Present", summary.presentDays, statusStyle.present],
                  ["Late", summary.lateDays, statusStyle.late],
                  ["Absent", summary.absentDays, statusStyle.absent],
                  ["Leave", summary.leaveDays, statusStyle.leave],
                ].map(([label, count, style]) => (
                  <div key={String(label)} className="rounded-xl border border-[hsl(var(--border))] p-3">
                    <div className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">{label}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="display text-xl font-extrabold">{count}</span>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${style}`}>{label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mb-0 border-t border-[hsl(var(--border))] px-4 py-3 text-[11px] text-[hsl(var(--muted-foreground))] sm:px-5">
              Late days count as attended. Approved leave is shown separately and is excluded from the attendance rate.
            </p>
          </section>

          <section className="surface overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] p-4 sm:p-5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
                <CalendarDays size={17} />
              </span>
              <div>
                <h2 className="display m-0 text-base font-extrabold">Recent attendance</h2>
                <p className="mb-0 mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                  {data.total > data.items.length ? `Showing ${data.items.length} of ${data.total} recorded days` : `${data.total} recorded ${data.total === 1 ? "day" : "days"}`}
                </p>
              </div>
            </div>
            {data.items.length ? (
              <div className="divide-y divide-[hsl(var(--border))]">
                {data.items.map((item, index) => (
                  <div key={`${item.date}-${index}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--background))] text-[hsl(var(--primary))]">
                        <Clock3 size={16} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold">{formatAttendanceDate(item.date)}</div>
                        <div className="mt-1 truncate text-[11px] text-[hsl(var(--muted-foreground))]">
                          {item.className} · Section {item.sectionName}
                        </div>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold capitalize ${statusStyle[item.status] ?? statusStyle.leave}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="display mb-1 text-sm font-bold">No attendance records yet</p>
                <p className="mb-0 text-xs text-[hsl(var(--muted-foreground))]">
                  Your attendance will appear here after your school records it.
                </p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
