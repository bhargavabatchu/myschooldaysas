import { BookOpen, CalendarDays, Clock3, MapPin, UserRound } from "lucide-react";
import "./_group.css";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const sampleSlots = [
  { id: "slot-1", weekday: 1, startTime: "08:00", endTime: "08:45", sectionName: "Grade 1 · A", subjectName: "English", teacherName: "Ananya Rao", room: "Room 01" },
  { id: "slot-2", weekday: 1, startTime: "09:00", endTime: "09:45", sectionName: "Grade 1 · A", subjectName: "Arts", teacherName: "Meera Thomas", room: "Art room" },
  { id: "slot-3", weekday: 1, startTime: "09:45", endTime: "10:30", sectionName: "Grade 1 · A", subjectName: "Science", teacherName: "Rohan Nair", room: "Room 01" },
  { id: "slot-4", weekday: 1, startTime: "10:50", endTime: "11:35", sectionName: "Grade 1 · A", subjectName: "Social Studies", teacherName: "Teacher", room: "" },
  { id: "slot-5", weekday: 1, startTime: "11:40", endTime: "12:25", sectionName: "Grade 1 · A", subjectName: "Hindi", teacherName: "Teacher", room: "" },
  { id: "slot-6", weekday: 2, startTime: "08:00", endTime: "08:45", sectionName: "Grade 1 · A", subjectName: "Physical Education", teacherName: "Meera Thomas", room: "Playground" },
  { id: "slot-7", weekday: 2, startTime: "08:50", endTime: "09:35", sectionName: "Grade 1 · A", subjectName: "Arts", teacherName: "Rohan Nair", room: "Art room" },
  { id: "slot-8", weekday: 2, startTime: "09:45", endTime: "10:30", sectionName: "Grade 1 · A", subjectName: "Mathematics", teacherName: "Ananya Rao", room: "Room 01" },
];

export function StudentDay() {
  const schedule = weekdays
    .map((day, weekday) => ({
      day,
      weekday,
      lessons: sampleSlots
        .filter(slot => slot.weekday === weekday)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .filter(item => item.lessons.length > 0);

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] px-4 py-7 text-[hsl(var(--foreground))] sm:px-7 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex flex-col gap-5 border-b border-[hsl(var(--border))] pb-6 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
              <CalendarDays size={15} strokeWidth={2.2} aria-hidden="true" />
              My school day
            </div>
            <h1 className="display m-0 text-[34px] font-extrabold leading-[1.08] tracking-[-.05em] sm:text-[42px]">My timetable</h1>
            <p className="mb-0 mt-2 max-w-lg text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Your lessons, teachers, and rooms — all in one clear view.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2 text-xs font-bold text-[hsl(var(--secondary-foreground))]" aria-label="Your class: Grade 1, section A">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
            Grade 1 <span className="text-[hsl(var(--muted-foreground))]" aria-hidden="true">·</span> A
          </div>
        </header>

        <section aria-label="Weekly lessons">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="display m-0 text-xl font-bold tracking-[-.035em] sm:text-2xl">This week</h2>
              <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                {sampleSlots.length} lessons <span aria-hidden="true">·</span> {schedule.length} school days
              </p>
            </div>
            <span className="hidden items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] sm:inline-flex">
              <Clock3 size={14} aria-hidden="true" /> Times shown for each lesson
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            {schedule.map(({ day, weekday, lessons }) => (
              <section key={weekday} className="surface overflow-hidden" aria-labelledby={`day-${weekday}`}>
                <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-3.5 sm:px-5">
                  <h3 id={`day-${weekday}`} className="display m-0 text-lg font-bold tracking-[-.03em]">{day}</h3>
                  <span className="rounded-full bg-[hsl(var(--card))] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                    {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
                  </span>
                </div>

                <ol className="m-0 list-none p-0">
                  {lessons.map((slot, index) => (
                    <li key={slot.id} className={`relative grid grid-cols-[76px_minmax(0,1fr)] gap-3 px-4 py-4 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4 sm:px-5 ${index < lessons.length - 1 ? "border-b border-[hsl(var(--border))]" : ""}`}>
                      <div className="pt-0.5">
                        <div className="text-[13px] font-bold tabular-nums text-[hsl(var(--primary))]">{slot.startTime}</div>
                        <div className="mt-1 flex items-center gap-1 text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">
                          <span aria-hidden="true">to</span> {slot.endTime}
                        </div>
                      </div>
                      <div className="min-w-0 border-l-2 border-[hsl(var(--brand-mint))] pl-3.5 sm:pl-4">
                        <div className="flex items-start gap-2">
                          <BookOpen size={15} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                          <h4 className="m-0 text-[15px] font-bold leading-5 tracking-[-.015em]">{slot.subjectName}</h4>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <UserRound size={13} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">{slot.teacherName}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin size={13} className="shrink-0" aria-hidden="true" />
                            {slot.room || "—"}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
