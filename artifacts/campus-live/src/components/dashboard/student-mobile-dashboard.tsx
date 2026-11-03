import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Radio,
} from 'lucide-react';
import {
  useGetMyLearningAssignments,
  useGetSections,
  useGetTimetable,
} from '@workspace/api-client-react';
import { PLATFORM_NAME, SCHOOL_NAME } from '@/lib/branding';

type StudentMobileDashboardProps = {
  userName: string;
};

type LocalClock = {
  weekday: number;
  minutes: number;
  dateLabel: string;
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
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase() || 'S';
}

export function StudentMobileDashboard({ userName }: StudentMobileDashboardProps) {
  const sections = useGetSections();
  const timetable = useGetTimetable();
  const assignments = useGetMyLearningAssignments();
  const [clock, setClock] = useState<LocalClock | null>(null);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hour = now.getHours();
      setClock({
        weekday: now.getDay(),
        minutes: hour * 60 + now.getMinutes(),
        dateLabel: new Intl.DateTimeFormat('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(now),
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

  return (
    <div className="mx-auto w-full max-w-md space-y-5 pb-3" data-testid="student-mobile-dashboard">
      <header className="flex items-center justify-between gap-3">
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

      <section className="flex items-center gap-3" aria-label="Student welcome">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[hsl(var(--card))] bg-[hsl(var(--brand-mint))] text-sm font-extrabold text-[hsl(var(--brand-mint-ink))] shadow-sm">
          {initials(studentName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
            {clock?.dateLabel ?? 'Your school day'}
          </p>
          <h1 className="display m-0 mt-1 truncate text-[21px] font-extrabold leading-tight tracking-[-.04em]">
            {clock?.greeting ?? 'Welcome'}, {firstName}.
          </h1>
          <p className="m-0 mt-1 truncate text-[11px] text-[hsl(var(--muted-foreground))]">
            {sections.isLoading ? 'Loading your class…' : sectionLabel}
          </p>
        </div>
      </section>

      <section
        className="relative overflow-hidden rounded-[20px] bg-[hsl(var(--brand-forest))] p-5 text-[hsl(var(--brand-inverse))] shadow-sm"
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

      <section aria-label="Quick access">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Timetable', href: '/timetable', icon: CalendarDays, tone: 'bg-[hsl(var(--brand-mint))] text-[hsl(var(--brand-mint-ink))]' },
            { label: 'Learning', href: '/learning', icon: BookOpen, tone: 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' },
            { label: 'Results', href: '/learning/reports', icon: FileText, tone: 'bg-[hsl(var(--accent)/.16)] text-[hsl(var(--foreground))]' },
            { label: 'Updates', href: '/announcements', icon: Radio, tone: 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]' },
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
                    <p className="m-0 mt-1 text-[8px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">{slot.endTime}</p>
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
    { label: 'Results', href: '/learning/reports', icon: FileText, active: path === '/learning/reports' },
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
