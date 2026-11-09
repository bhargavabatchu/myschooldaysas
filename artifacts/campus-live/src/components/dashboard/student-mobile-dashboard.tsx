import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight,
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Radio,
} from 'lucide-react';
import {
  useGetAnnouncements,
  useGetCalendar,
  useGetLearningReportCards,
  useGetMyFeeInvoices,
  useGetMyLearningAssignments,
  useGetMySchoolAttendance,
  useGetSections,
  useGetTimetable,
} from '@workspace/api-client-react';
import { PLATFORM_NAME, SCHOOL_NAME } from '@/lib/branding';
import { LatestSchoolHighlights } from '@/components/highlights/highlights-page';

type StudentMobileDashboardProps = {
  userName: string;
};

type LocalClock = {
  weekday: number;
  minutes: number;
  dateLabel: string;
  dateKey: string;
  nowMs: number;
  greeting: string;
};

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatTime(value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function formatDueDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not set';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function addCalendarDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase() || 'S';
}

export function StudentDashboard({ userName }: StudentMobileDashboardProps) {
  const sections = useGetSections();
  const timetable = useGetTimetable();
  const assignments = useGetMyLearningAssignments();
  const attendance = useGetMySchoolAttendance();
  const invoices = useGetMyFeeInvoices();
  const reportCards = useGetLearningReportCards(undefined);
  const announcements = useGetAnnouncements({ unread: true });
  const [clock, setClock] = useState<LocalClock | null>(null);
  const calendarParams = useMemo(() => clock
    ? { from: clock.dateKey, to: addCalendarDays(clock.dateKey, 60) }
    : { from: '2000-01-01', to: '2000-01-02' }, [clock?.dateKey]);
  const calendar = useGetCalendar(calendarParams, { query: { enabled: clock !== null } });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const dateParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const part = (type: string) => dateParts.find(item => item.type === type)?.value ?? '';
      const dateKey = `${part('year')}-${part('month')}-${part('day')}`;
      const timeParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(now);
      const timePart = (type: string) => Number(timeParts.find(item => item.type === type)?.value ?? 0);
      const hour = timePart('hour');
      const weekdayName = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone: 'Asia/Kolkata',
      }).format(now);
      setClock({
        weekday: weekdayNames.indexOf(weekdayName),
        minutes: hour * 60 + timePart('minute'),
        dateLabel: new Intl.DateTimeFormat('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'Asia/Kolkata',
        }).format(now),
        dateKey,
        nowMs: now.getTime(),
        greeting: hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening',
      });
    };

    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const studentName = userName.trim() || 'Student';
  const firstName = studentName.split(/\s+/)[0];
  const currentSection = sections.data?.items[0];
  const sectionLabel = currentSection
    ? `${currentSection.className} · Section ${currentSection.name}`
    : 'Your class details will appear here';
  const assignmentItems = assignments.data?.items ?? [];
  const publishedAssignments = assignmentItems.filter(item => item.status === 'published');
  const submittedAssignments = publishedAssignments.filter(item => item.mySubmission !== null).length;
  const assignmentProgress = publishedAssignments.length
    ? Math.round((submittedAssignments / publishedAssignments.length) * 100)
    : null;
  const outstandingInvoices = (invoices.data?.items ?? []).filter(invoice => invoice.status !== 'void' && invoice.balancePaise > 0);
  const outstandingBalancePaise = outstandingInvoices.reduce((total, invoice) => total + invoice.balancePaise, 0);
  const overdueInvoices = clock
    ? outstandingInvoices.filter(invoice => invoice.dueDate < clock.dateKey)
    : [];
  const latestReportCard = [...(reportCards.data?.items ?? [])]
    .filter(card => card.published)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))[0];
  const unreadAnnouncements = (announcements.data?.items ?? []).filter(item => !item.readAt);
  const nextCalendarEvent = (calendar.data?.items ?? [])
    .filter(event => event.endDate >= (clock?.dateKey ?? ''))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  const todaySlots = useMemo(() => {
    if (clock === null) return [];
    return [...(timetable.data?.items ?? [])]
      .filter(slot => slot.weekday === clock.weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [clock, timetable.data]);

  const currentSlot = clock
    ? todaySlots.find(slot => timeToMinutes(slot.startTime) <= clock.minutes && clock.minutes < timeToMinutes(slot.endTime))
    : undefined;
  const nextSlot = clock && !currentSlot
    ? todaySlots.find(slot => timeToMinutes(slot.startTime) > clock.minutes)
    : undefined;
  const pendingAssignments = [...publishedAssignments]
    .filter(item => !item.mySubmission)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 2);
  const pendingAssignmentCount = publishedAssignments.filter(item => !item.mySubmission).length;
  const overdueAssignmentCount = clock
    ? publishedAssignments.filter(item => !item.mySubmission && item.dueAt.slice(0, 10) < clock.dateKey).length
    : 0;

  const attendanceSummary = attendance.data?.summary;
  const attendanceValue = attendance.isLoading
    ? 'Loading'
    : attendance.isError
      ? 'Unavailable'
      : attendanceSummary?.attendancePercent === null || attendanceSummary?.attendancePercent === undefined
        ? 'Not recorded'
        : `${Math.round(attendanceSummary.attendancePercent)}%`;
  const attendanceDetail = attendance.isError
    ? 'Open attendance to retry'
    : attendanceSummary?.countedDays
      ? `${attendanceSummary.presentDays} present of ${attendanceSummary.countedDays} marked days`
      : 'No attendance has been recorded yet';
  const assignmentValue = assignments.isLoading
    ? 'Loading'
    : assignments.isError
      ? 'Unavailable'
      : String(pendingAssignmentCount);
  const assignmentDetail = assignments.isError
    ? 'Open learning to retry'
    : overdueAssignmentCount
      ? `${overdueAssignmentCount} overdue · ${pendingAssignmentCount} pending`
      : pendingAssignmentCount
        ? 'Pending work to complete'
        : 'You’re caught up';
  const resultsValue = reportCards.isLoading
    ? 'Loading'
    : reportCards.isError
      ? 'Unavailable'
      : latestReportCard?.overallPercent !== null && latestReportCard?.overallPercent !== undefined
        ? `${Math.round(latestReportCard.overallPercent)}%`
        : latestReportCard?.overallGrade ?? (latestReportCard ? 'Published' : 'Not published');
  const resultsDetail = reportCards.isError
    ? 'Open results to retry'
    : latestReportCard
      ? `${latestReportCard.termName}${latestReportCard.overallGrade ? ` · Grade ${latestReportCard.overallGrade}` : ''}`
      : 'Published results will appear here';
  const feesValue = invoices.isLoading
    ? 'Loading'
    : invoices.isError
      ? 'Unavailable'
      : outstandingBalancePaise > 0
        ? formatRupees(outstandingBalancePaise)
        : 'All clear';
  const feesDetail = invoices.isError
    ? 'Open fees to retry'
    : overdueInvoices.length
      ? `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'}`
      : outstandingBalancePaise > 0
        ? `${outstandingInvoices.length} balance${outstandingInvoices.length === 1 ? '' : 's'} due`
        : invoices.data?.items.length
          ? 'No balance due'
          : 'No invoices yet';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-3 md:space-y-6" data-testid="student-overview-dashboard">
      <header className="flex items-center justify-between gap-3 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
            <GraduationCap size={22} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="m-0 truncate text-[13px] font-extrabold">{SCHOOL_NAME}</p>
            <p className="m-0 mt-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">{PLATFORM_NAME}</p>
          </div>
        </div>
        <Link
          href="/announcements"
          aria-label="Open announcements"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
        >
          <Bell size={17} strokeWidth={1.8} />
        </Link>
      </header>

      <section className="flex items-center gap-3 md:rounded-2xl md:border md:border-[hsl(var(--border))] md:bg-[hsl(var(--card))] md:p-5" aria-label="Student welcome">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[hsl(var(--card))] bg-[hsl(var(--brand-mint))] text-sm font-extrabold text-[hsl(var(--brand-mint-ink))] shadow-sm">
          {initials(studentName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
            {clock?.dateLabel ?? 'Your school day'}
          </p>
          <h1 className="display m-0 mt-1 truncate text-[21px] font-extrabold leading-tight tracking-[-.04em] md:text-[28px]">
            {clock?.greeting ?? 'Welcome'}, {firstName}.
          </h1>
          <p className="m-0 mt-1 truncate text-[11px] text-[hsl(var(--muted-foreground))]">
            {sections.isLoading ? 'Loading your class…' : sectionLabel}
          </p>
        </div>
      </section>

      <section
        className="relative overflow-hidden rounded-[20px] bg-[hsl(var(--brand-forest))] p-5 text-[hsl(var(--brand-inverse))] shadow-sm md:p-6"
        aria-label="Assignment progress"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full border border-white/10" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="m-0 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.18em] text-[hsl(var(--classroom-ready))]">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-accent))]" />
              Your learning journey
            </p>
            <h2 className="display mb-0 mt-2 max-w-[190px] text-[19px] font-extrabold leading-tight">
              {assignmentProgress === null ? 'Ready for what’s next?' : 'Keep your learning moving.'}
            </h2>
          </div>
          {assignmentProgress !== null && (
            <div
              role="progressbar"
              aria-label="Published assignments submitted"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={assignmentProgress}
              className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(hsl(var(--brand-accent)) 0deg ${assignmentProgress * 3.6}deg, hsl(var(--brand-inverse) / .18) ${assignmentProgress * 3.6}deg 360deg)`,
              }}
            >
              <div className="grid h-[54px] w-[54px] place-items-center rounded-full bg-[hsl(var(--brand-forest))] text-[16px] font-extrabold tabular-nums">
                {assignmentProgress}%
              </div>
            </div>
          )}
        </div>
        <div className="relative mt-4 border-t border-white/15 pt-3">
          {assignments.isLoading ? (
            <p className="m-0 text-[10px] text-white/70">Checking your assignments…</p>
          ) : assignments.isError ? (
            <button className="m-0 text-left text-[10px] font-semibold text-white underline underline-offset-2" onClick={() => assignments.refetch()}>
              Couldn’t load assignments. Tap to retry.
            </button>
          ) : assignmentProgress === null ? (
            <p className="m-0 text-[10px] text-white/70">Published assignments will appear here when they’re shared with you.</p>
          ) : (
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <span className="text-white/70">Assignments submitted</span>
              <span className="font-bold">{submittedAssignments} of {publishedAssignments.length}</span>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3" aria-label="Your school snapshot" data-testid="student-insight-cards">
        <Link href="/attendance" className="surface flex min-h-[112px] items-start gap-3 p-3.5 transition hover:border-[hsl(var(--primary)/.35)] md:p-4" aria-label={`Attendance: ${attendanceValue}. ${attendanceDetail}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--brand-mint))] text-[hsl(var(--brand-mint-ink))]"><CalendarDays size={17}/></span>
          <span className="min-w-0">
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Attendance</span>
            <span className={`mt-1 block truncate font-extrabold tracking-tight ${attendanceValue.length > 8 ? 'text-[13px]' : 'text-[21px]'}`} data-testid="student-attendance-value">{attendanceValue}</span>
            <span className="mt-1 block text-[9px] leading-relaxed text-[hsl(var(--muted-foreground))]">{attendanceDetail}</span>
          </span>
        </Link>
        <Link href="/learning" className="surface flex min-h-[112px] items-start gap-3 p-3.5 transition hover:border-[hsl(var(--primary)/.35)] md:p-4" aria-label={`Assignments: ${assignmentValue}. ${assignmentDetail}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><FileText size={17}/></span>
          <span className="min-w-0">
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Assignments</span>
            <span className={`mt-1 block truncate font-extrabold tracking-tight ${assignmentValue.length > 8 ? 'text-[13px]' : 'text-[21px]'}`} data-testid="student-assignment-value">{assignmentValue}</span>
            <span className="mt-1 block text-[9px] leading-relaxed text-[hsl(var(--muted-foreground))]">{assignmentDetail}</span>
          </span>
        </Link>
        <Link href="/results" className="surface flex min-h-[112px] items-start gap-3 p-3.5 transition hover:border-[hsl(var(--primary)/.35)] md:p-4" aria-label={`Latest result: ${resultsValue}. ${resultsDetail}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--accent)/.16)] text-[hsl(var(--foreground))]"><GraduationCap size={17}/></span>
          <span className="min-w-0">
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Latest result</span>
            <span className={`mt-1 block truncate font-extrabold tracking-tight ${resultsValue.length > 8 ? 'text-[13px]' : 'text-[21px]'}`} data-testid="student-results-value">{resultsValue}</span>
            <span className="mt-1 block truncate text-[9px] leading-relaxed text-[hsl(var(--muted-foreground))]">{resultsDetail}</span>
          </span>
        </Link>
        <Link href="/fees" className="surface flex min-h-[112px] items-start gap-3 p-3.5 transition hover:border-[hsl(var(--primary)/.35)] md:p-4" aria-label={`Fee balance: ${feesValue}. ${feesDetail}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--accent)/.16)] text-[hsl(var(--foreground))]"><CreditCard size={17}/></span>
          <span className="min-w-0">
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Fee balance</span>
            <span className={`mt-1 block truncate font-extrabold tracking-tight ${feesValue.length > 8 ? 'text-[13px]' : 'text-[21px]'}`} data-testid="student-fees-value">{feesValue}</span>
            <span className="mt-1 block text-[9px] leading-relaxed text-[hsl(var(--muted-foreground))]">{feesDetail}</span>
          </span>
        </Link>
      </section>

      <section className="md:hidden" aria-label="Quick access">
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: 'Timetable', href: '/timetable', icon: CalendarDays, tone: 'bg-[hsl(var(--brand-mint))] text-[hsl(var(--brand-mint-ink))]' },
            { label: 'Learning', href: '/learning', icon: BookOpen, tone: 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' },
            { label: 'Results', href: '/results', icon: FileText, tone: 'bg-[hsl(var(--accent)/.16)] text-[hsl(var(--foreground))]' },
            { label: 'Updates', href: '/announcements', icon: Radio, tone: 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]' },
            { label: 'Highlights', href: '/highlights', icon: Activity, tone: 'bg-[hsl(var(--brand-mint))] text-[hsl(var(--brand-mint-ink))]' },
          ].map(({ label, href, icon: Icon, tone }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-1.5 py-3 text-center transition active:scale-[.98]"
            >
              <span className={`grid h-10 w-10 place-items-center rounded-[14px] ${tone}`}><Icon size={18} strokeWidth={1.9} /></span>
              <span className="text-[9px] font-bold leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="md:hidden" aria-label="Fees and receipts">
        <Link href="/fees" className="surface flex items-center gap-3 p-3.5 transition active:scale-[.99]">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
            <CreditCard size={18} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-extrabold">Fees &amp; receipts</span>
            <span className="mt-1 block text-[9px] leading-relaxed text-[hsl(var(--muted-foreground))]">View invoices and payment status for your account.</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
        </Link>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-5">
      <section aria-labelledby="student-today-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="m-0 text-[9px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">Your day</p>
            <h2 id="student-today-title" className="display m-0 mt-1 text-[18px] font-extrabold tracking-[-.03em]">Today’s classes</h2>
          </div>
          <Link href="/timetable" className="mb-0.5 inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[hsl(var(--primary))]">
            Full timetable <ArrowRight size={13} />
          </Link>
        </div>

        {timetable.isLoading || clock === null ? (
          <div className="space-y-2" aria-label="Loading today’s timetable">
            <div className="skeleton h-[78px]" />
            <div className="skeleton h-[78px]" />
          </div>
        ) : timetable.isError ? (
          <div role="alert" className="surface p-4 text-[11px] text-[hsl(var(--destructive))]">
            <p className="m-0">We couldn’t load your timetable.</p>
            <button className="mt-2 font-bold underline underline-offset-2" onClick={() => timetable.refetch()}>Try again</button>
          </div>
        ) : todaySlots.length === 0 ? (
          <div className="surface p-5 text-center">
            <CalendarDays className="mx-auto mb-2 text-[hsl(var(--primary))]" size={21} />
            <p className="m-0 text-[11px] font-bold">No classes scheduled for {weekdayNames[clock.weekday]}.</p>
            <p className="m-0 mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Your timetable will show any lessons added by your school.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todaySlots.slice(0, 4).map(slot => {
              const status = currentSlot?.id === slot.id ? 'Now' : nextSlot?.id === slot.id ? 'Next' : null;
              return (
                <article key={slot.id} className="surface flex items-center gap-3 p-3">
                  <div className="w-[52px] shrink-0 text-center">
                    <p className="m-0 text-[12px] font-extrabold tabular-nums">{formatTime(slot.startTime)}</p>
                    <p className="m-0 mt-1 text-[8px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">{formatTime(slot.endTime)}</p>
                  </div>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[hsl(var(--brand-mint))] text-[hsl(var(--brand-mint-ink))]">
                    <BookOpen size={17} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="m-0 truncate text-[12px] font-extrabold">{slot.subjectName}</h3>
                    <p className="m-0 mt-1 truncate text-[9px] text-[hsl(var(--muted-foreground))]">
                      {[slot.room, slot.teacherName].filter(Boolean).join(' · ') || slot.sectionName}
                    </p>
                  </div>
                  {status ? (
                    <span className={`rounded-full px-2 py-1 text-[8px] font-extrabold uppercase tracking-[.08em] ${status === 'Now' ? 'bg-[hsl(var(--status-good-bg))] text-[hsl(var(--brand-mint-ink))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]'}`}>
                      {status}
                    </span>
                  ) : <ChevronRight size={15} className="shrink-0 text-[hsl(var(--muted-foreground))]" />}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="student-assignments-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="m-0 text-[9px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">Keep moving</p>
            <h2 id="student-assignments-title" className="display m-0 mt-1 text-[18px] font-extrabold tracking-[-.03em]">Assignments to focus on</h2>
          </div>
          <Link href="/learning" className="mb-0.5 inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[hsl(var(--primary))]">
            All work <ArrowRight size={13} />
          </Link>
        </div>
        {assignments.isLoading ? (
          <div className="skeleton h-[86px]" aria-label="Loading assignments" />
        ) : assignments.isError ? (
          <div role="alert" className="surface p-4 text-[11px] text-[hsl(var(--destructive))]">
            <p className="m-0">We couldn’t load your assignments.</p>
            <button className="mt-2 font-bold underline underline-offset-2" onClick={() => assignments.refetch()}>Try again</button>
          </div>
        ) : pendingAssignments.length === 0 ? (
          <div className="surface flex items-start gap-3 p-4">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--status-good-bg))] text-[hsl(var(--brand-mint-ink))]"><Check size={17} /></div>
            <div>
              <p className="m-0 text-[11px] font-bold">{publishedAssignments.length ? 'You’re caught up.' : 'No assignments yet.'}</p>
              <p className="m-0 mt-1 text-[10px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                {publishedAssignments.length ? 'You’ve submitted all your published assignments.' : 'New work shared by your teachers will appear here.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingAssignments.map(item => (
              <Link key={item.id} href="/learning" className="surface flex items-center gap-3 p-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><FileText size={16} /></div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[11px] font-bold">{item.title}</p>
                  <p className="m-0 mt-1 flex items-center gap-1 text-[9px] text-[hsl(var(--muted-foreground))]">
                    <Clock3 size={11} /> Due {formatDueDate(item.dueAt)}
                  </p>
                </div>
                <ChevronRight size={15} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
              </Link>
            ))}
          </div>
        )}
      </section>
        </div>

        <div className="space-y-5">
          <LatestSchoolHighlights />
          <section className="surface p-4 md:p-5" aria-labelledby="student-calendar-title">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Activity size={17}/></span>
                <div>
                  <p className="m-0 text-[9px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Coming up</p>
                  <h2 id="student-calendar-title" className="display m-0 mt-1 text-[16px] font-extrabold">School calendar</h2>
                </div>
              </div>
              <Link href="/calendar" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[hsl(var(--primary))]">
                Full calendar <ArrowRight size={13}/>
              </Link>
            </div>
            {calendar.isLoading ? (
              <div className="skeleton h-[74px]" aria-label="Loading school calendar"/>
            ) : calendar.isError ? (
              <div role="alert" className="rounded-xl border border-[hsl(var(--border))] p-3 text-[10px] text-[hsl(var(--destructive))]">
                <p className="m-0">Calendar events could not be loaded.</p>
                <button type="button" className="mt-2 font-bold underline underline-offset-2" onClick={() => calendar.refetch()}>Try again</button>
              </div>
            ) : nextCalendarEvent ? (
              <Link href="/calendar" className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-3 transition hover:border-[hsl(var(--primary)/.35)]">
                <span className="min-w-[52px] rounded-lg bg-[hsl(var(--accent)/.16)] px-2 py-2 text-center text-[10px] font-extrabold text-[hsl(var(--foreground))]">
                  {formatDueDate(nextCalendarEvent.startDate)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-bold">{nextCalendarEvent.title}</span>
                  <span className="mt-1 block truncate text-[9px] text-[hsl(var(--muted-foreground))]">
                    {nextCalendarEvent.kind.replaceAll('_', ' ')}{nextCalendarEvent.scopeName ? ` · ${nextCalendarEvent.scopeName}` : ''}
                  </span>
                </span>
                <ChevronRight size={15} className="shrink-0 text-[hsl(var(--muted-foreground))]"/>
              </Link>
            ) : (
              <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-4 text-center text-[10px] text-[hsl(var(--muted-foreground))]">
                No school dates are scheduled in the next two months.
              </div>
            )}
          </section>

          <section className="surface p-4 md:p-5" aria-labelledby="student-updates-title">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--brand-mint))] text-[hsl(var(--brand-mint-ink))]"><Bell size={17}/></span>
                <div>
                  <p className="m-0 text-[9px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">For you</p>
                  <h2 id="student-updates-title" className="display m-0 mt-1 text-[16px] font-extrabold">Unread announcements</h2>
                </div>
              </div>
              <Link href="/announcements" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[hsl(var(--primary))]">
                All updates <ArrowRight size={13}/>
              </Link>
            </div>
            {announcements.isLoading ? (
              <div className="skeleton h-[74px]" aria-label="Loading announcements"/>
            ) : announcements.isError ? (
              <div role="alert" className="rounded-xl border border-[hsl(var(--border))] p-3 text-[10px] text-[hsl(var(--destructive))]">
                <p className="m-0">Announcements could not be loaded.</p>
                <button type="button" className="mt-2 font-bold underline underline-offset-2" onClick={() => announcements.refetch()}>Try again</button>
              </div>
            ) : unreadAnnouncements.length ? (
              <div className="space-y-2">
                {unreadAnnouncements.slice(0, 3).map(item => (
                  <Link key={item.id} href="/announcements" className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-3 transition hover:border-[hsl(var(--primary)/.35)]">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true"/>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-bold">{item.title}</span>
                      <span className="mt-1 block text-[9px] text-[hsl(var(--muted-foreground))]">{formatDueDate(item.publishedAt)}</span>
                    </span>
                    <ChevronRight size={15} className="mt-1 shrink-0 text-[hsl(var(--muted-foreground))]"/>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-4 text-center text-[10px] text-[hsl(var(--muted-foreground))]">
                You’re up to date. New announcements will appear here.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function StudentMobileNavigation({
  path,
  onMore,
  menuOpen,
}: {
  path: string;
  onMore: () => void;
  menuOpen: boolean;
}) {
  const items = [
    { label: 'Home', href: '/dashboard', icon: LayoutDashboard, active: path === '/' || path === '/dashboard' },
    { label: 'Learn', href: '/learning', icon: GraduationCap, active: path === '/learning' },
    { label: 'Timetable', href: '/timetable', icon: CalendarDays, active: path === '/timetable' },
    { label: 'Results', href: '/results', icon: FileText, active: path === '/results' || path === '/learning/reports' },
  ];

  return (
    <nav
      aria-label="Student navigation"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[hsl(var(--border))] bg-[hsl(var(--background)/.96)] px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-lg md:hidden"
    >
      {items.map(({ label, href, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? 'page' : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[9px] transition ${active ? 'font-extrabold text-[hsl(var(--primary))]' : 'font-semibold text-[hsl(var(--muted-foreground))]'}`}
        >
          <span className={`grid h-7 w-9 place-items-center rounded-full ${active ? 'bg-[hsl(var(--brand-mint))]' : ''}`}>
            <Icon size={17} strokeWidth={active ? 2.2 : 1.7} />
          </span>
          {label}
        </Link>
      ))}
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        onClick={onMore}
        className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[9px] transition ${menuOpen ? 'font-extrabold text-[hsl(var(--primary))]' : 'font-semibold text-[hsl(var(--muted-foreground))]'}`}
      >
        <span className={`grid h-7 w-9 place-items-center rounded-full ${menuOpen ? 'bg-[hsl(var(--brand-mint))]' : ''}`}><Menu size={17} /></span>
        More
      </button>
    </nav>
  );
}
