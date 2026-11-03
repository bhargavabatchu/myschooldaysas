import { useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  GraduationCap,
  Home,
  LibraryBig,
  NotebookPen,
  Sparkles,
  Star,
  TrendingUp,
  UserRound,
} from "lucide-react";
import "../dashboard-redesign/_group.css";

const schedule = [
  { time: "9:00", subject: "Mathematics", topic: "Fractions & patterns", room: "Room 204", color: "bg-[hsl(var(--brand-mint))] text-[hsl(var(--brand-mint-ink))]", icon: BookOpen },
  { time: "9:45", subject: "Science", topic: "A closer look at plants", room: "Lab 1", color: "bg-[#e5edf8] text-[#3b628d]", icon: Sparkles },
  { time: "10:45", subject: "English", topic: "Stories with a point of view", room: "Room 105", color: "bg-[#f8e8e4] text-[#a45549]", icon: NotebookPen },
];

const shortcuts = [
  { label: "My timetable", icon: CalendarDays },
  { label: "Learning", icon: LibraryBig },
  { label: "My work", icon: NotebookPen },
  { label: "Results", icon: TrendingUp },
];

export function StudentMobile() {
  const [activeTab, setActiveTab] = useState("Home");
  const [noticeOpen, setNoticeOpen] = useState(true);

  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[430px] overflow-hidden bg-[hsl(var(--background))] pb-[88px]">
        <header className="flex items-center justify-between px-5 pb-4 pt-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[hsl(var(--brand-forest))] text-[hsl(var(--brand-inverse))]">
              <GraduationCap size={21} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="m-0 truncate text-[11px] font-bold leading-tight">St Joseph's Public School</p>
              <p className="m-0 mt-1 text-[9px] font-semibold uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">My School Day</p>
            </div>
          </div>
          <button aria-label="Notifications" onClick={() => setActiveTab("Notices")} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]">
            <Bell size={18} strokeWidth={1.8} />
            <span className="absolute right-[9px] top-[8px] h-2 w-2 rounded-full border-2 border-[hsl(var(--card))] bg-[hsl(var(--accent))]" />
          </button>
        </header>

        <main className="space-y-5 px-5">
          <section className="flex items-center gap-3 pt-1">
            <div className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full border-[3px] border-[hsl(var(--card))] bg-[hsl(var(--brand-mint))] text-[15px] font-extrabold text-[hsl(var(--brand-mint-ink))] shadow-sm">MT</div>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">TUESDAY · 27 OCTOBER</p>
              <h1 className="display m-0 mt-1 text-[21px] font-extrabold leading-tight tracking-[-.04em]">Good morning, Mira.</h1>
              <p className="m-0 mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Grade 6 · Section A</p>
            </div>
            <div className="flex items-center gap-1 self-start rounded-full bg-[hsl(var(--card))] px-2.5 py-1.5 text-[9px] font-bold text-[hsl(var(--primary))]">
              <Star size={11} fill="currentColor" /> Term 2
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[22px] bg-[hsl(var(--brand-forest))] p-5 text-[hsl(var(--brand-inverse))]">
            <div className="absolute -right-9 -top-10 h-36 w-36 rounded-full border border-white/10" />
            <div className="absolute -right-2 -top-3 h-24 w-24 rounded-full border border-white/10" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.17em] text-[hsl(var(--classroom-ready))]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-accent))]" /> Your learning journey
                </div>
                <h2 className="display m-0 max-w-[180px] text-[20px] font-extrabold leading-[1.15] tracking-[-.035em]">A little progress, every day.</h2>
              </div>
              <div className="relative grid h-[74px] w-[74px] shrink-0 place-items-center rounded-full" style={{ background: "conic-gradient(hsl(var(--brand-accent)) 0deg 259deg, rgba(255,255,255,.17) 259deg 360deg)" }}>
                <div className="grid h-[60px] w-[60px] place-items-center rounded-full bg-[hsl(var(--brand-forest))]">
                  <div className="text-center"><span className="display text-[18px] font-extrabold">72</span><span className="text-[11px] font-bold">%</span></div>
                </div>
              </div>
            </div>
            <div className="relative mt-4 flex items-center justify-between border-t border-white/15 pt-3">
              <span className="text-[10px] text-white/70">Weekly learning goal</span>
              <span className="text-[10px] font-bold text-[hsl(var(--classroom-ready))]">Illustrative sample · not real data</span>
            </div>
          </section>

          <section aria-label="Student shortcuts" className="grid grid-cols-4 gap-2">
            {shortcuts.map(({ label, icon: Icon }) => (
              <button key={label} onClick={() => setActiveTab(label)} className="flex min-w-0 flex-col items-center gap-2 rounded-[16px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-1.5 py-3 text-center transition active:scale-[.97]">
                <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Icon size={17} strokeWidth={1.8} /></span>
                <span className="text-[9px] font-bold leading-tight">{label}</span>
              </button>
            ))}
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="m-0 text-[9px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Your day</p>
                <h2 className="display m-0 mt-1 text-[18px] font-extrabold tracking-[-.035em]">Today's classes</h2>
              </div>
              <button onClick={() => setActiveTab("My timetable")} className="flex items-center gap-1 pb-1 text-[10px] font-bold text-[hsl(var(--primary))]">Full timetable <ArrowRight size={13} /></button>
            </div>
            <div className="space-y-2">
              {schedule.map(({ time, subject, topic, room, color, icon: Icon }, index) => (
                <button key={subject} onClick={() => setActiveTab(subject)} className="flex w-full items-center gap-3 rounded-[16px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-left transition active:scale-[.99]">
                  <div className="w-[41px] shrink-0 text-center">
                    <span className="block text-[12px] font-extrabold">{time}</span>
                    <span className="mt-1 block text-[8px] font-semibold text-[hsl(var(--muted-foreground))]">PERIOD {index + 1}</span>
                  </div>
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] ${color}`}><Icon size={18} strokeWidth={1.8} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-extrabold">{subject}</div>
                    <div className="mt-1 truncate text-[10px] text-[hsl(var(--muted-foreground))]">{topic}</div>
                    <div className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-[hsl(var(--muted-foreground))]"><Clock3 size={10} /> {room} · Ms. Anita Rao</div>
                  </div>
                  {index === 0 ? <span className="rounded-full bg-[hsl(var(--status-good-bg))] px-2 py-1 text-[8px] font-bold text-[hsl(var(--brand-mint-ink))]">NEXT</span> : <ChevronRight size={15} className="shrink-0 text-[hsl(var(--muted-foreground))]" />}
                </button>
              ))}
            </div>
          </section>

          {noticeOpen && (
            <section className="flex items-start gap-3 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#f8eee1] text-[#9c6330]"><CalendarDays size={17} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="m-0 text-[12px] font-extrabold">A note for your family</h3>
                  <button aria-label="Dismiss notice" onClick={() => setNoticeOpen(false)} className="grid h-6 w-6 place-items-center rounded-full text-[hsl(var(--muted-foreground))]"><span className="text-[17px] leading-none">×</span></button>
                </div>
                <p className="mb-0 mt-1 text-[10px] leading-[1.55] text-[hsl(var(--muted-foreground))]">The library book return date is Friday. Bring your book to class when you're ready.</p>
                <button onClick={() => setActiveTab("Notices")} className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[hsl(var(--primary))]">Read school notices <ChevronRight size={12} /></button>
              </div>
            </section>
          )}

          <section className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(var(--card))] text-[hsl(var(--primary))]"><Check size={15} /></div>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[11px] font-extrabold">Small steps add up</p>
                <p className="m-0 mt-0.5 text-[9px] text-[hsl(var(--muted-foreground))]">Pick up where you left off in Mathematics.</p>
              </div>
              <button aria-label="Continue learning" onClick={() => setActiveTab("Learning")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-white"><ArrowRight size={15} /></button>
            </div>
          </section>
        </main>
      </div>

      <nav aria-label="Student navigation" className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 items-center justify-around border-t border-[hsl(var(--border))] bg-[hsl(var(--background)/.97)] px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-lg">
        {[
          { label: "Home", icon: Home },
          { label: "Learn", icon: BookOpen },
          { label: "Timetable", icon: CalendarDays },
          { label: "Progress", icon: TrendingUp },
          { label: "Profile", icon: UserRound },
        ].map(({ label, icon: Icon }) => {
          const selected = activeTab === label || (label === "Home" && activeTab === "Home");
          return (
            <button key={label} onClick={() => setActiveTab(label)} className={`flex min-w-[54px] flex-col items-center gap-1 rounded-xl px-2 py-1 transition ${selected ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}>
              <span className={`grid h-7 w-9 place-items-center rounded-full ${selected ? "bg-[hsl(var(--brand-mint))]" : ""}`}><Icon size={18} strokeWidth={selected ? 2.2 : 1.7} /></span>
              <span className={`text-[9px] ${selected ? "font-extrabold" : "font-semibold"}`}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
