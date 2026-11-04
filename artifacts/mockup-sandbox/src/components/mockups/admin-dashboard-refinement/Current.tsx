import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  Clock3,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Moon,
  Radio,
  ShieldCheck,
  Sun,
  Users,
  Video,
  X,
} from "lucide-react";
import "./_group.css";

const SCHOOL_NAME = "St Joseph's Public School";
const PLATFORM_NAME = "My School Day";
const localDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const localMonth = Number(localDate.slice(5, 7));
const localYear = Number(localDate.slice(0, 4));
const academicYear = localMonth >= 4 ? `${localYear}-${String(localYear + 1).slice(-2)}` : `${localYear - 1}-${String(localYear).slice(-2)}`;
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(new Date());
const weekday = weekdayNames.indexOf(weekdayName);

const dashboardData = {
  userName: "Ananya Rao",
  metrics: [
    { label: "Total students", value: "422", change: "Active enrollments", tone: "positive" },
    { label: "Classes", value: "12", change: "Across the school", tone: "neutral" },
    { label: "Upcoming live classes", value: "0", change: "Next sessions", tone: "neutral" },
    { label: "Teaching staff", value: "35", change: "Assigned to sections", tone: "positive" },
  ],
  attendanceToday: {
    attendanceDate: localDate,
    markedStudents: 0,
    presentStudents: 0,
    attendancePercent: null as number | null,
  },
  fees: {
    academicYear,
    totalFeesThisYearPaise: 0,
    collectedThisYearPaise: 0,
    outstandingThisYearPaise: 0,
    collectionPercentThisYear: null as number | null,
    overdueInvoiceCount: 0,
    collectionTrend: [] as { month: string; collectedPaise: number }[],
  },
  timetable: [
    { id: "slot-1", weekday, startTime: "08:30", endTime: "09:15", subjectName: "Mathematics", sectionName: "Grade 6 · A", teacherName: "Anita Rao", room: "Room 12" },
    { id: "slot-2", weekday, startTime: "09:20", endTime: "10:05", subjectName: "English", sectionName: "Grade 7 · B", teacherName: "Joseph Mathew", room: "Room 08" },
    { id: "slot-3", weekday, startTime: "10:25", endTime: "11:10", subjectName: "Science", sectionName: "Grade 5 · A", teacherName: "Meera Thomas", room: "Science lab" },
    { id: "slot-4", weekday, startTime: "11:15", endTime: "12:00", subjectName: "History", sectionName: "Grade 8 · A", teacherName: "Rohan Nair", room: "Room 14" },
  ],
  recentActivity: [
    { id: "activity-1", label: "New announcement", description: "Annual sports day schedule is ready.", occurredAt: "2026-10-27T09:15:00+05:30" },
    { id: "activity-2", label: "Learning resource added", description: "A new mathematics worksheet is available.", occurredAt: "2026-10-27T08:40:00+05:30" },
    { id: "activity-3", label: "Attendance updated", description: "Grade 6 attendance has been recorded.", occurredAt: "2026-10-27T08:10:00+05:30" },
  ],
};

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Classes", href: "/admin/classes", icon: BookOpen },
  { label: "Students", href: "/admin/students", icon: Users },
  { label: "Live classes", href: "/live/sessions", icon: Video },
  { label: "Smartboards", href: "/boards/templates", icon: Library },
  { label: "Learning", href: "/learning", icon: GraduationCap },
  { label: "Announcements", href: "/announcements", icon: Radio },
  { label: "Attendance", href: "/attendance", icon: CalendarCheck },
  { label: "Timetable", href: "/timetable", icon: CalendarCheck },
  { label: "Teachers", href: "/admin/teachers", icon: Users },
  { label: "Admissions", href: "/admin/admissions", icon: BookOpen },
  { label: "Family access", href: "/admin/guardians", icon: ShieldCheck },
  { label: "Fees", href: "/fees", icon: CreditCard },
];

const formatDate = (iso: string) => `${iso.slice(0, 10)} · ${iso.slice(11, 16)}`;
const formatRupees = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(paise / 100);

function InertLink({ href, className, children, ariaLabel }: { href: string; className?: string; children: ReactNode; ariaLabel?: string }) {
  return <a href={href} aria-label={ariaLabel} className={className} onClick={event => event.preventDefault()}>{children}</a>;
}

export function Current() {
  return <AdminDashboardPreview />;
}

export function AdminDashboardPreview({ refined = false }: { refined?: boolean }) {
  const [mobileNav, setMobileNav] = useState(false);
  const [dark, setDark] = useState(false);
  const todaySchedule = dashboardData.timetable
    .filter(slot => slot.weekday === weekday)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 4);
  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setDark(value => !value);
  };

  return (
    <div className="admin-preview">
      <div className="signed-in-shell dashboard-app-shell md:flex">
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col px-4 py-5 text-[hsl(var(--sidebar-foreground))] transition-transform md:translate-x-0 ${mobileNav ? "is-open" : ""}`}>
          <div className="mb-9 flex items-center gap-3 px-2">
            <div className="dashboard-shell-crest grid h-10 w-10 shrink-0 place-items-center text-white"><GraduationCap size={22} /></div>
            <div className="min-w-0"><div className="display text-[14px] font-extrabold leading-tight tracking-tight">{SCHOOL_NAME}</div><div className="mt-1 text-[9px] uppercase tracking-[.14em] opacity-60">Powered by {PLATFORM_NAME}</div></div>
            <button aria-label="Close navigation" className="mobile-sidebar-close md:hidden" onClick={() => setMobileNav(false)}><X size={18} /></button>
          </div>
          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-white/40">Workspace</div>
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Main navigation">
            {navItems.map(({ label, href, icon: Icon }) => (
              <InertLink key={href} href={href} className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition ${label === "Overview" ? "is-active text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
                <Icon size={17} strokeWidth={1.8} />{label}{label === "Overview" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />}
              </InertLink>
            ))}
          </nav>
          <div className="mt-auto">
            <div className="mb-4 rounded-xl border border-white/10 bg-white/[.04] p-3">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-white/80"><ShieldCheck size={14} className="text-[hsl(var(--accent))]" />A trusted classroom</div>
              <p className="m-0 text-[11px] leading-relaxed text-white/45">Your school’s learning space, all in one place.</p>
            </div>
            <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[hsl(var(--brand-mint))] text-xs font-bold text-[hsl(var(--brand-mint-ink))]">AR</div>
              <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-bold">{dashboardData.userName}</div><div className="truncate text-[10px] capitalize text-white/50">Campus admin</div></div>
              <button title={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme} className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
              <button title="Sign out" onClick={() => undefined} className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10"><LogOut size={16} /></button>
            </div>
          </div>
        </aside>
        {mobileNav && <button aria-label="Close menu overlay" onClick={() => setMobileNav(false)} className="mobile-sidebar-scrim md:hidden" />}
        <main className="min-w-0 flex-1 md:ml-[260px]">
          <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.94)] px-4 backdrop-blur-md md:px-9">
            <div className="flex items-center gap-3">
              <button aria-label="Open navigation" onClick={() => setMobileNav(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-[hsl(var(--border))] md:hidden"><Menu size={18} /></button>
              <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Workspace / <span className="font-semibold text-[hsl(var(--foreground))]">Overview</span></div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[hsl(var(--muted-foreground))]"><span className="max-w-[118px] truncate sm:max-w-none"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[hsl(var(--status-good))]" />{SCHOOL_NAME}</span><div className="grid h-8 w-8 place-items-center rounded-full bg-[hsl(var(--secondary))] font-bold text-[hsl(var(--secondary-foreground))]">A</div></div>
          </header>
          <div className="page-enter mx-auto w-full max-w-[1450px] px-4 py-7 md:px-9 md:py-9">
            <div className={`dashboard-page ${refined ? "admin-dashboard-refined" : ""}`}>
              <section className="dashboard-welcome" aria-labelledby="dashboard-welcome-title">
                <div className="dashboard-welcome-copy">
                  <div className="dashboard-eyebrow"><span aria-hidden="true" />ST JOSEPH’S · SCHOOL DAY</div>
                  <h1 id="dashboard-welcome-title">Good to see you, <em>{dashboardData.userName.split(" ")[0]}</em>.</h1>
                  <p>A considered view of the work moving through your school today.</p>
                </div>
                <div className="dashboard-welcome-actions">
                  <InertLink href="/boards/templates" className="dashboard-secondary-link"><Library size={15} />Smartboards</InertLink>
                  <InertLink href="/learning" className="dashboard-primary-link">Explore learning <ArrowRight size={16} /></InertLink>
                </div>
              </section>
              <div className="dashboard-content">
                <section className="dashboard-metrics" aria-label="School overview metrics">
                  {dashboardData.metrics.map((metric, index) => {
                    const Icon = [Users, BookOpen, Video, Activity][index];
                    const card = <article key={metric.label} className={`dashboard-metric dashboard-metric-${metric.tone}`}>
                      <div className="dashboard-metric-top"><span>{metric.label}</span><div className="dashboard-metric-icon"><Icon size={17} strokeWidth={1.8} /></div></div>
                      <div className="dashboard-metric-value">{metric.value}</div>
                      <div className="dashboard-metric-change">{metric.tone === "positive" ? <ArrowUpRight size={13} /> : metric.tone === "warning" ? <ArrowDown size={13} /> : null}<span>{metric.change}</span></div>
                    </article>;
                    return metric.label === "Total students"
                      ? <InertLink key={`link-${metric.label}`} href="/admin/students" className="dashboard-metric-link" ariaLabel={`View the total student list for ${metric.value} students`}>{card}</InertLink>
                      : card;
                  })}
                </section>
                {(dashboardData.attendanceToday.attendancePercent === null || dashboardData.fees.overdueInvoiceCount > 0) && <section className="dashboard-followups" aria-label="Administrator follow-ups">
                  {dashboardData.attendanceToday.attendancePercent === null && <InertLink href="/attendance" className="dashboard-followup dashboard-followup-attendance">
                    <span className="dashboard-followup-icon"><CalendarCheck size={16} /></span>
                    <span className="dashboard-followup-copy"><strong>Attendance has not been recorded</strong><span>Today’s register is ready for an update.</span></span>
                    <span className="dashboard-followup-action">Open attendance <ArrowRight size={13} /></span>
                  </InertLink>}
                  {dashboardData.fees.overdueInvoiceCount > 0 && <InertLink href="/fees" className="dashboard-followup dashboard-followup-fees">
                    <span className="dashboard-followup-icon"><CreditCard size={16} /></span>
                    <span className="dashboard-followup-copy"><strong>{dashboardData.fees.overdueInvoiceCount} overdue invoices</strong><span>Review outstanding school fees.</span></span>
                    <span className="dashboard-followup-action">Review fees <ArrowRight size={13} /></span>
                  </InertLink>}
                </section>}
                {refined && <nav className="admin-quick-actions" aria-label="Operational shortcuts">
                  <InertLink href="/admin/admissions" className="admin-quick-link"><span className="admin-quick-icon"><Users size={16} /></span><span>Admissions<small>Review new applications</small></span></InertLink>
                  <InertLink href="/attendance" className="admin-quick-link"><span className="admin-quick-icon"><CalendarCheck size={16} /></span><span>Attendance<small>Open today’s register</small></span></InertLink>
                  <InertLink href="/announcements" className="admin-quick-link"><span className="admin-quick-icon"><Radio size={16} /></span><span>Announcements<small>Share a school update</small></span></InertLink>
                  <InertLink href="/fees" className="admin-quick-link"><span className="admin-quick-icon"><CreditCard size={16} /></span><span>Fees<small>Review fee collection</small></span></InertLink>
                </nav>}
                <div className="dashboard-panels">
                  <section className="dashboard-panel dashboard-sessions" aria-labelledby="dashboard-sessions-title">
                    <div className="dashboard-panel-heading">
                      <div><div className="dashboard-panel-kicker">TODAY · {weekdayName.toUpperCase()}</div><h2 id="dashboard-sessions-title">Today’s timetable</h2><p>Class, subject, and teacher at a glance</p></div>
                      <InertLink href="/timetable" className="dashboard-text-link">Full timetable <ArrowRight size={14} /></InertLink>
                    </div>
                    {todaySchedule.length ? <div className="dashboard-day-schedule">
                      {todaySchedule.map(slot => <article key={slot.id} className="dashboard-day-slot">
                        <div className="dashboard-day-time"><strong>{slot.startTime}</strong><span>{slot.endTime}</span></div>
                        <div className="dashboard-day-slot-copy"><strong>{slot.subjectName}</strong><span>{slot.sectionName} · {slot.teacherName}</span></div>
                        {slot.room && <span className="dashboard-day-room">{slot.room}</span>}
                      </article>)}
                    </div> : <div className="dashboard-day-schedule" />}
                  </section>
                  <section className="dashboard-panel dashboard-activity" aria-labelledby="dashboard-activity-title">
                    <div className="dashboard-panel-heading dashboard-activity-heading">
                      <div className="dashboard-activity-emblem"><Activity size={18} /></div>
                      <div><div className="dashboard-panel-kicker">ACROSS THE SCHOOL</div><h2 id="dashboard-activity-title">Recent activity</h2><p>Latest updates from your school</p></div>
                    </div>
                    <div className="dashboard-activity-list">{dashboardData.recentActivity.map((item, index) => <article key={item.id} className="dashboard-activity-item">
                      <span className={`dashboard-activity-node node-${index + 1}`} aria-hidden="true" />
                      <div><div className="dashboard-activity-label">{item.label}</div><div className="dashboard-activity-description">{item.description}</div><div className="dashboard-activity-time">{formatDate(item.occurredAt)}</div></div>
                    </article>)}</div>
                  </section>
                </div>
                <section className="dashboard-admin-insights" aria-label="Administrator insights">
                  <div className="dashboard-insight-attendance">
                    <div className="dashboard-insight-heading">
                      <div className="dashboard-insight-symbol"><CalendarCheck size={17} /></div>
                      <div><span className="dashboard-panel-kicker">ATTENDANCE · {dashboardData.attendanceToday.attendanceDate}</span><h2>Today’s register</h2></div>
                    </div>
                    {dashboardData.attendanceToday.attendancePercent === null
                      ? <div className="dashboard-attendance-unmarked"><strong>Not recorded yet</strong><span>No attendance marks have been recorded for today.</span>{refined && <span className="refined-denominator">Attendance rate uses students marked as its denominator. Today: {dashboardData.attendanceToday.presentStudents} present of {dashboardData.attendanceToday.markedStudents} marked.</span>}</div>
                      : <div className="dashboard-attendance-readout"><strong>{dashboardData.attendanceToday.attendancePercent}<small>%</small></strong><div className="dashboard-attendance-detail"><span>{dashboardData.attendanceToday.presentStudents} present</span><span>{dashboardData.attendanceToday.markedStudents} students marked</span></div><div className="dashboard-progress-track"><span style={{ width: `${dashboardData.attendanceToday.attendancePercent}%` }} /></div></div>}
                    <InertLink href="/attendance" className="dashboard-insight-link">Open attendance <ArrowRight size={13} /></InertLink>
                  </div>
                  <div className="dashboard-insight-fees">
                    <div className="dashboard-insight-heading">
                      <div className="dashboard-insight-symbol gold"><CreditCard size={17} /></div>
                      <div><span className="dashboard-panel-kicker">FEES · ACADEMIC YEAR {dashboardData.fees.academicYear}</span><h2>Collection overview</h2></div>
                    </div>
                    <div className="dashboard-fee-totals">
                      <div><span>Total fees issued</span><strong>{formatRupees(dashboardData.fees.totalFeesThisYearPaise)}</strong><small>After concessions</small></div>
                      <div><span>Collected</span><strong>{formatRupees(dashboardData.fees.collectedThisYearPaise)}</strong><small>This academic year</small></div>
                      <div><span>Outstanding</span><strong>{formatRupees(dashboardData.fees.outstandingThisYearPaise)}</strong><small>This academic year</small></div>
                    </div>
                    {refined && <p className="refined-fee-note"><ShieldCheck size={13} />{`Academic year ${dashboardData.fees.academicYear}; total fees shown net of concessions.`}</p>}
                    <div className="dashboard-collection-progress">
                      <div className="dashboard-collection-progress-copy"><div><span>Collected this academic year</span><strong>{dashboardData.fees.collectionPercentThisYear === null ? "—" : `${dashboardData.fees.collectionPercentThisYear}%`}</strong></div><small>{dashboardData.fees.collectionPercentThisYear === null ? `No fees issued for ${dashboardData.fees.academicYear} yet.` : `Overall collection rate for ${dashboardData.fees.academicYear}.`}</small></div>
                      <div className="dashboard-collection-progress-track" role="progressbar" aria-label="No fee collection percentage available" aria-valuemin={0} aria-valuemax={100} aria-valuenow={dashboardData.fees.collectionPercentThisYear ?? 0}><span style={{ width: `${dashboardData.fees.collectionPercentThisYear ?? 0}%` }} /></div>
                    </div>
                    <div className="dashboard-overdue-summary"><span>Overdue invoices</span><strong>{dashboardData.fees.overdueInvoiceCount}</strong></div>
                    <p className="dashboard-trend-empty">Monthly collection history will appear here.</p>
                    <InertLink href="/fees" className="dashboard-insight-link">Review fees <ArrowRight size={13} /></InertLink>
                  </div>
                </section>
                <section className="dashboard-toolband" aria-label="Learning tools">
                  <div className="dashboard-toolband-mark"><BookOpen size={21} /></div>
                  <div className="dashboard-toolband-copy"><span>THE CLASSROOM, READY WHEN YOU ARE</span><strong>Bring the lesson to life.</strong><p>Open a shared board and pick up where the school day is.</p></div>
                  <InertLink href="/boards/templates" className="dashboard-community-link">Browse smartboards <ArrowRight size={15} /></InertLink>
                </section>
                <footer className="dashboard-footer"><BookOpen size={14} /><span>Learning, belonging, becoming.</span><span className="dashboard-footer-rule" /><span>{SCHOOL_NAME.toUpperCase()}</span></footer>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
