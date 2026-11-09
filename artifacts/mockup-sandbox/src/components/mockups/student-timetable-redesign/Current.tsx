import { useState } from "react";
import { CalendarDays } from "lucide-react";
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

export function Current() {
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] p-5 text-[hsl(var(--foreground))] md:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">Academic schedule</div>
          <h1 className="display m-0 text-[30px] font-extrabold leading-tight tracking-[-.045em] md:text-[36px]">Timetable</h1>
          <p className="mb-0 mt-2 max-w-2xl text-[13px] text-[hsl(var(--muted-foreground))]">View class schedules, assigned teachers, subjects, and rooms.</p>
        </header>

        <section className="surface mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-semibold">
            Class
            <select className="field mt-1.5" value={classId} onChange={event => setClassId(event.target.value)} aria-label="Filter timetable by class">
              <option value="">All classes</option>
              <option value="grade-1">Grade 1</option>
            </select>
          </label>
          <label className="text-xs font-semibold">
            Section
            <select className="field mt-1.5" value={sectionId} onChange={event => setSectionId(event.target.value)} aria-label="Filter timetable by section">
              <option value="">All sections in class</option>
              <option value="section-a">A</option>
            </select>
          </label>
          <button className="min-h-10 rounded-[10px] bg-[hsl(var(--secondary))] px-4 text-sm font-bold text-[hsl(var(--secondary-foreground))]" type="button" onClick={() => { setClassId(""); setSectionId(""); }}>Clear filters</button>
        </section>

        <section className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead className="bg-[hsl(var(--muted))] text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
                <tr><th className="px-4 py-3">Day &amp; time</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Room</th></tr>
              </thead>
              <tbody>
                {sampleSlots.map(slot => (
                  <tr key={slot.id} className="border-t border-[hsl(var(--border))]">
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-[hsl(var(--primary))]">{weekdays[slot.weekday]} · {slot.startTime}–{slot.endTime}</td>
                    <td className="px-4 py-3 text-xs">{slot.sectionName}</td>
                    <td className="px-4 py-3 text-xs font-bold">{slot.subjectName}</td>
                    <td className="px-4 py-3 text-xs">{slot.teacherName}</td>
                    <td className="px-4 py-3 text-xs">{slot.room || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-[hsl(var(--border))] p-4 text-[10px] text-[hsl(var(--muted-foreground))]"><CalendarDays size={14}/> Student view currently shows the full class timetable.</div>
        </section>
      </div>
    </main>
  );
}
