"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTimetableQueryKey,
  useCreateTimetableSlot,
  useDeleteTimetableSlot,
  useGetAcademicTeacherAssignments,
  useGetSections,
  useGetTimetable,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { BookOpen, CalendarDays, CalendarPlus, MapPin, Trash2, UserRound } from "lucide-react";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const readableError = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";

export function TimetablePage({ canManage, isStudent = false }: { canManage: boolean; isStudent?: boolean }) {
  const queryClient = useQueryClient();
  const timetable = useGetTimetable();
  const assignments = useGetAcademicTeacherAssignments(undefined, { query: { enabled: canManage } });
  const sections = useGetSections();
  const create = useCreateTimetableSlot({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTimetableQueryKey() }),
    },
  });
  const remove = useDeleteTimetableSlot({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTimetableQueryKey() }),
    },
  });
  const [assignmentId, setAssignmentId] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:45");
  const [room, setRoom] = useState("");
  const [filterClassId, setFilterClassId] = useState("");
  const [filterSectionId, setFilterSectionId] = useState("");
  const assignment = useMemo(
    () => assignments.data?.items.find((item) => item.id === assignmentId),
    [assignments.data, assignmentId],
  );
  const sectionLabels = useMemo(
    () => new Map((sections.data?.items ?? []).map(section => [section.id, `${section.className} · ${section.name}`])),
    [sections.data],
  );
  const sectionById = useMemo(
    () => new Map((sections.data?.items ?? []).map((section) => [section.id, section])),
    [sections.data],
  );
  const classOptions = useMemo(
    () => Array.from(new Map(
      (sections.data?.items ?? []).map((section) => [
        section.classId,
        { id: section.classId, name: section.className },
      ]),
    ).values()),
    [sections.data],
  );
  const sectionOptions = useMemo(
    () => (sections.data?.items ?? []).filter((section) => section.classId === filterClassId),
    [sections.data, filterClassId],
  );
  const studentSectionLabel = sections.data?.items[0]
    ? `${sections.data.items[0].className} · ${sections.data.items[0].name}`
    : timetable.data?.items[0]?.sectionName ?? "";
  const sorted = [...(timetable.data?.items ?? [])].sort(
    (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
  );
  const filteredSlots = sorted.filter((slot) => {
    if (filterSectionId && slot.sectionId !== filterSectionId) return false;
    if (filterClassId && sectionById.get(slot.sectionId)?.classId !== filterClassId) return false;
    return true;
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignment || endTime <= startTime) return;
    create.mutate({
      data: {
        sectionId: assignment.sectionId,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
        weekday,
        startTime,
        endTime,
        room: room.trim() || null,
      },
    });
  }

  return (
    <div className="timetable-page">
      <header className="mb-7">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">Academic schedule</div>
        <h1 className="display m-0 text-[30px] font-extrabold leading-tight tracking-[-.045em] md:text-[36px]">Timetable</h1>
        <p className="mb-0 mt-2 max-w-2xl text-[13px] text-[hsl(var(--muted-foreground))]">View class schedules, assigned teachers, subjects, and rooms.</p>
      </header>

      {canManage && (
        <>
        <form onSubmit={submit} className="surface mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <label className="text-xs font-semibold lg:col-span-2">
            Teaching assignment
            <select
              className="field mt-1.5"
              value={assignmentId}
              onChange={(event) => setAssignmentId(event.target.value)}
              required
              aria-label="Teaching assignment"
            >
              <option value="">Choose class, subject, and teacher</option>
              {assignments.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                    {sectionLabels.get(item.sectionId) ?? item.sectionName} · {item.subjectName} · {item.teacherName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold">
            Day
            <select className="field mt-1.5" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
              {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">
            Start
            <input className="field mt-1.5" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
          </label>
          <label className="text-xs font-semibold">
            End
            <input className="field mt-1.5" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
          </label>
          <label className="text-xs font-semibold">
            Room
            <input className="field mt-1.5" maxLength={80} value={room} onChange={(event) => setRoom(event.target.value)} placeholder="Optional" />
          </label>
          <button className="btn btn-primary sm:col-span-2 lg:col-span-6" disabled={!assignment || endTime <= startTime || create.isPending}>
            <CalendarPlus size={15} />{create.isPending ? "Adding…" : "Add timetable slot"}
          </button>
          {(create.isError || assignments.isError) && (
            <p role="alert" className="text-xs text-[hsl(var(--destructive))] sm:col-span-2 lg:col-span-6">
              {readableError(create.error ?? assignments.error)}
            </p>
          )}
        </form>
        {assignments.data?.items.length === 0 && !assignments.isLoading && (
          <div className="surface mb-5 flex flex-col gap-3 p-4 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0">Assign a teacher to a section subject before scheduling its lessons.</p>
            <Link className="btn btn-muted min-h-9" href="/learning">Set up subjects &amp; teachers</Link>
          </div>
        )}
        </>
      )}

      {!isStudent && <section className="surface mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-semibold">
          Class
          <select
            className="field mt-1.5"
            value={filterClassId}
            onChange={(event) => {
              setFilterClassId(event.target.value);
              setFilterSectionId("");
            }}
            disabled={sections.isLoading || classOptions.length === 0}
            aria-label="Filter timetable by class"
          >
            <option value="">All classes</option>
            {classOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Section
          <select
            className="field mt-1.5"
            value={filterSectionId}
            onChange={(event) => setFilterSectionId(event.target.value)}
            disabled={!filterClassId || sections.isLoading}
            aria-label="Filter timetable by section"
          >
            <option value="">All sections in class</option>
            {sectionOptions.map((section) => (
              <option key={section.id} value={section.id}>{section.name}</option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-muted min-h-10"
          type="button"
          onClick={() => {
            setFilterClassId("");
            setFilterSectionId("");
          }}
          disabled={!filterClassId && !filterSectionId}
        >
          Clear filters
        </button>
      </section>}

      {timetable.isLoading ? (
        <div className="skeleton h-40" aria-label="Loading timetable" />
      ) : timetable.isError ? (
        <div className="surface p-5 text-sm text-[hsl(var(--destructive))]" role="alert">
          {readableError(timetable.error)}
        </div>
      ) : isStudent ? (
        filteredSlots.length === 0 ? (
          <div className="surface flex flex-col items-center p-8 text-center sm:p-10">
            <CalendarDays className="mb-3 text-[hsl(var(--primary))]" size={24} aria-hidden="true" />
            <h2 className="display m-0 text-lg font-bold">Your timetable isn’t available yet</h2>
            <p className="mb-0 mt-2 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Your school’s timetable will appear here when it has been added.
            </p>
          </div>
        ) : (
          <StudentWeeklyTimetable slots={filteredSlots} sectionLabel={studentSectionLabel} />
        )
      ) : filteredSlots.length === 0 ? (
        <div className="surface p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
          {filterClassId || filterSectionId
            ? "No timetable slots match these filters."
            : "No timetable slots are available for your account yet."}
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead className="bg-[hsl(var(--muted))] text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="px-4 py-3">Day & time</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Teacher</th>
                  <th className="px-4 py-3">Room</th>
                  {canManage && <th className="px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredSlots.map((slot) => (
                  <tr key={slot.id} className="border-t border-[hsl(var(--border))]">
                    <td className="px-4 py-3 text-xs font-semibold">{weekdays[slot.weekday]} · {slot.startTime}–{slot.endTime}</td>
                    <td className="px-4 py-3 text-xs">{sectionLabels.get(slot.sectionId) ?? slot.sectionName}</td>
                    <td className="px-4 py-3 text-xs">{slot.subjectName}</td>
                    <td className="px-4 py-3 text-xs">{slot.teacherName}</td>
                    <td className="px-4 py-3 text-xs">{slot.room || "—"}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <button
                          className="btn btn-muted min-h-8 px-2 text-[11px]"
                          aria-label={`Delete ${slot.subjectName} timetable slot`}
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Remove the ${slot.subjectName} slot for ${weekdays[slot.weekday]}?`)) {
                              remove.mutate({ slotId: slot.id });
                            }
                          }}
                        >
                          <Trash2 size={14} />Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {remove.isError && <p role="alert" className="p-3 text-xs text-[hsl(var(--destructive))]">{readableError(remove.error)}</p>}
        </div>
      )}
    </div>
  );
}

type StudentTimetableSlot = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  subjectName: string;
  teacherName: string;
  room: string | null;
};

function StudentWeeklyTimetable({ slots, sectionLabel }: { slots: StudentTimetableSlot[]; sectionLabel: string }) {
  const schedule = weekdays
    .map((day, weekday) => ({
      day,
      weekday,
      lessons: slots.filter(slot => slot.weekday === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .filter(item => item.lessons.length > 0);

  return (
    <div className="space-y-6" data-testid="student-weekly-timetable">
      <header className="mb-7 flex flex-col gap-5 border-b border-[hsl(var(--border))] pb-6 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
            <CalendarDays size={15} strokeWidth={2.2} aria-hidden="true" />
            My school day
          </div>
          <h2 className="display m-0 text-[30px] font-extrabold leading-[1.08] tracking-[-.05em] sm:text-[38px]">My timetable</h2>
          <p className="mb-0 mt-2 max-w-lg text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            Your lessons, teachers, and rooms — all in one clear view.
          </p>
        </div>
        {sectionLabel && (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2 text-xs font-bold text-[hsl(var(--secondary-foreground))]" aria-label={`Your class: ${sectionLabel}`}>
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
            {sectionLabel}
          </div>
        )}
      </header>

      <section aria-label="Weekly lessons">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="display m-0 text-xl font-bold tracking-[-.035em] sm:text-2xl">This week</h3>
            <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {slots.length} lessons <span aria-hidden="true">·</span> {schedule.length} school days
            </p>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] sm:inline-flex">
            Times shown for each lesson
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
          {schedule.map(({ day, weekday, lessons }) => (
            <section key={weekday} className="surface overflow-hidden" aria-labelledby={`student-timetable-day-${weekday}`}>
              <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-3.5 sm:px-5">
                <h4 id={`student-timetable-day-${weekday}`} className="display m-0 text-lg font-bold tracking-[-.03em]">{day}</h4>
                <span className="rounded-full bg-[hsl(var(--card))] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                  {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
                </span>
              </div>

              <ol className="m-0 list-none p-0">
                {lessons.map((slot, index) => (
                  <li key={slot.id} className={`relative grid grid-cols-[76px_minmax(0,1fr)] gap-3 px-4 py-4 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4 sm:px-5 ${index < lessons.length - 1 ? "border-b border-[hsl(var(--border))]" : ""}`}>
                    <div className="pt-0.5">
                      <div className="text-[13px] font-bold tabular-nums text-[hsl(var(--primary))]">{slot.startTime}</div>
                      <div className="mt-1 text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">to {slot.endTime}</div>
                    </div>
                    <div className="min-w-0 border-l-2 border-[hsl(var(--brand-mint))] pl-3.5 sm:pl-4">
                      <div className="flex items-start gap-2">
                        <BookOpen size={15} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                        <p className="m-0 text-[15px] font-bold leading-5 tracking-[-.015em]">{slot.subjectName}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <UserRound size={13} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">{slot.teacherName}</span>
                        </span>
                        {slot.room && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin size={13} className="shrink-0" aria-hidden="true" />
                            {slot.room}
                          </span>
                        )}
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
  );
}
