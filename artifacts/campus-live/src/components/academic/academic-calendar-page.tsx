"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCalendarQueryKey,
  getGetSectionsQueryKey,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useGetCalendar,
  useGetClasses,
  useGetSections,
  useUpdateCalendarEvent,
} from "@workspace/api-client-react";
import type { CalendarEvent, CalendarEventInput, CalendarEventKind, CalendarEventScope } from "@workspace/api-client-react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import "./academic-calendar-page.css";

const adminRoles = ["super_admin", "org_admin", "campus_admin"];
const kinds: { value: CalendarEventKind; label: string }[] = [
  { value: "event", label: "School event" },
  { value: "holiday", label: "Holiday" },
  { value: "exam", label: "Exam" },
  { value: "ptm", label: "Parent–teacher meeting" },
  { value: "working_day", label: "Working day" },
];
const kindLabel = (kind: CalendarEventKind) => kinds.find((item) => item.value === kind)?.label ?? kind;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dateFromKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const monthTitle = (date: Date) => new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date);
const shortDate = (key: string) => new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(dateFromKey(key));
const longDate = (key: string) => new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(dateFromKey(key));

function moveMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function firstDateOfMonth(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`;
}

function lastDateOfMonth(date: Date) {
  return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function monthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offsetFromMonday = (first.getDay() + 6) % 7;
  const gridStart = new Date(date.getFullYear(), date.getMonth(), 1 - offsetFromMonday);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return { date: day, key: dateKey(day), inMonth: day.getMonth() === date.getMonth() };
  });
}

function eventTouchesDay(event: CalendarEvent, day: string) {
  return event.startDate <= day && event.endDate >= day;
}

type Props = { roles: string[] };

export function AcademicCalendarPage({ roles }: Props) {
  const queryClient = useQueryClient();
  const canManage = roles.some((role) => adminRoles.includes(role));
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [notice, setNotice] = useState("");
  const [operationError, setOperationError] = useState("");
  const [scope, setScope] = useState<CalendarEventScope>("org");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    kind: "event" as CalendarEventKind,
    startDate: dateKey(new Date()),
    endDate: dateKey(new Date()),
    description: "",
  });

  const params = useMemo(() => ({ from: firstDateOfMonth(month), to: lastDateOfMonth(month) }), [month]);
  const calendar = useGetCalendar(params, { query: { queryKey: getGetCalendarQueryKey(params) } });
  const classes = useGetClasses(undefined, { query: { enabled: canManage } });
  const sectionsParams = useMemo(() => classId ? { classId } : undefined, [classId]);
  const sections = useGetSections(sectionsParams, {
    query: { enabled: canManage && scope === "section", queryKey: getGetSectionsQueryKey(sectionsParams) },
  });
  const createEvent = useCreateCalendarEvent();
  const updateEvent = useUpdateCalendarEvent();
  const deleteEvent = useDeleteCalendarEvent();
  const events = calendar.data?.items ?? [];
  const days = useMemo(() => monthDays(month), [month]);
  const selectedEvents = events.filter((event) => eventTouchesDay(event, selectedDay));
  const loading = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;
  const visibleError = operationError || (createEvent.isError ? errorMessage(createEvent.error) : "")
    || (updateEvent.isError ? errorMessage(updateEvent.error) : "")
    || (deleteEvent.isError ? errorMessage(deleteEvent.error) : "");

  function resetComposer() {
    setComposerOpen(false);
    setEditing(null);
    setScope("org");
    setClassId("");
    setSectionId("");
    setDraft({ title: "", kind: "event", startDate: selectedDay, endDate: selectedDay, description: "" });
  }

  function startCreate() {
    setNotice("");
    setOperationError("");
    setEditing(null);
    setScope("org");
    setClassId("");
    setSectionId("");
    setDraft({ title: "", kind: "event", startDate: selectedDay, endDate: selectedDay, description: "" });
    setComposerOpen(true);
  }

  function startEdit(event: CalendarEvent) {
    setNotice("");
    setOperationError("");
    setEditing(event);
    setScope(event.scope);
    setClassId(event.scope === "class" ? event.scopeId ?? "" : "");
    setSectionId(event.scope === "section" ? event.scopeId ?? "" : "");
    setDraft({
      title: event.title,
      kind: event.kind,
      startDate: event.startDate,
      endDate: event.endDate,
      description: event.description,
    });
    setComposerOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setOperationError("");
    const form = new FormData(event.currentTarget);
    const input: CalendarEventInput = {
      title: draft.title.trim(),
      kind: draft.kind,
      startDate: draft.startDate,
      endDate: draft.endDate,
      scope,
      ...(scope === "class" ? { scopeId: classId } : {}),
      ...(scope === "section" ? { scopeId: String(form.get("sectionId") ?? "") } : {}),
      description: draft.description.trim(),
    };
    if (input.endDate < input.startDate) {
      setOperationError("The end date must be on or after the start date.");
      return;
    }
    if (scope !== "org" && !input.scopeId) {
      setOperationError("Choose a class or section for this event.");
      return;
    }
    const onSuccess = async () => {
      await queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() });
      setMonth(dateFromKey(input.startDate));
      setSelectedDay(input.startDate);
      setNotice(editing ? "Calendar event updated." : "Calendar event added.");
      resetComposer();
    };
    const onError = (error: unknown) => setOperationError(errorMessage(error));
    if (editing) {
      updateEvent.mutate({ eventId: editing.id, data: input }, { onSuccess, onError });
    } else {
      createEvent.mutate({ data: input }, { onSuccess, onError });
    }
  }

  function removeEvent(event: CalendarEvent) {
    if (!window.confirm(`Remove “${event.title}” from the school calendar?`)) return;
    setNotice("");
    setOperationError("");
    deleteEvent.mutate({ eventId: event.id }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() });
        setNotice("Calendar event removed.");
      },
      onError: (error) => setOperationError(errorMessage(error)),
    });
  }

  function changeMonth(amount: number) {
    const next = moveMonth(month, amount);
    setMonth(next);
    setSelectedDay(firstDateOfMonth(next));
  }

  function selectDay(key: string) {
    const date = dateFromKey(key);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    setSelectedDay(key);
  }

  return <div className="academic-calendar-page">
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]"><span className="h-px w-7 bg-[hsl(var(--accent))]" />School year at a glance</div>
        <h1 className="display m-0 text-[32px] font-extrabold leading-tight tracking-[-.045em] md:text-[38px]">Academic calendar</h1>
        <p className="mb-0 mt-2 max-w-2xl text-[13px] text-[hsl(var(--muted-foreground))]">School holidays, exams, meetings, and important dates in one place.</p>
      </div>
      {canManage && <button type="button" className="btn btn-primary self-start sm:self-auto" onClick={startCreate}><Plus size={16} />Add calendar event</button>}
    </header>

    {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[hsl(var(--status-good)/.3)] bg-[hsl(var(--status-good-bg))] px-4 py-3 text-sm font-semibold text-[hsl(var(--brand-mint-ink))]"><Check size={16} />{notice}</div>}
    {visibleError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.07)] px-4 py-3 text-sm text-[hsl(var(--destructive))]"><AlertCircle className="mt-0.5 shrink-0" size={16} />{visibleError}</div>}

    {composerOpen && canManage && <form onSubmit={submit} className="surface mb-5 space-y-4 border-l-4 border-l-[hsl(var(--accent))] p-4 sm:p-5" data-testid="calendar-event-form">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[hsl(var(--brand-mint))] text-[hsl(var(--brand-mint-ink))]"><CalendarDays size={16} /></span><div><h2 className="display m-0 text-lg font-extrabold">{editing ? "Edit calendar event" : "Add to the calendar"}</h2><p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">Share dates with the whole school, a class, or a section.</p></div></div>
        <button type="button" className="btn btn-muted min-h-9 px-2" aria-label="Close calendar event form" onClick={resetComposer}><X size={16} /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold sm:col-span-2">Event title<input className="field mt-1.5" required minLength={3} maxLength={160} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} placeholder="e.g. Independence Day assembly" /></label>
        <label className="text-xs font-semibold">Type<select className="field mt-1.5" value={draft.kind} onChange={(event) => setDraft((value) => ({ ...value, kind: event.target.value as CalendarEventKind }))}>{kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
        <label className="text-xs font-semibold">Audience<select className="field mt-1.5" value={scope} onChange={(event) => { setScope(event.target.value as CalendarEventScope); setClassId(""); }}><option value="org">Whole school</option><option value="class">A class</option><option value="section">A section</option></select></label>
        <label className="text-xs font-semibold">Starts<input className="field mt-1.5" type="date" required value={draft.startDate} onChange={(event) => setDraft((value) => ({ ...value, startDate: event.target.value }))} /></label>
        <label className="text-xs font-semibold">Ends<input className="field mt-1.5" type="date" required min={draft.startDate} value={draft.endDate} onChange={(event) => setDraft((value) => ({ ...value, endDate: event.target.value }))} /></label>
        {scope === "class" && <label className="text-xs font-semibold">Class<select className="field mt-1.5" required value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Choose a class</option>{classes.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {scope === "section" && <><label className="text-xs font-semibold">Class<select className="field mt-1.5" value={classId} onChange={(event) => { setClassId(event.target.value); setSectionId(""); }}><option value="">All classes</option>{classes.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs font-semibold">Section<select className="field mt-1.5" name="sectionId" required disabled={sections.isLoading} value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">{sections.isLoading ? "Loading sections…" : "Choose a section"}</option>{sections.data?.items.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.name}</option>)}</select></label></>}
      </div>
      <label className="block text-xs font-semibold">Details <span className="font-normal text-[hsl(var(--muted-foreground))]">Optional</span><textarea className="field mt-1.5 min-h-20 resize-y leading-6" maxLength={2000} rows={3} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="Add any useful details for families and staff." /></label>
      {(classes.isError || sections.isError) && <p role="alert" className="m-0 text-xs text-[hsl(var(--destructive))]">Class and section options could not be loaded. Try refreshing the page.</p>}
      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" className="btn btn-muted" onClick={resetComposer}>Cancel</button><button className="btn btn-primary" disabled={loading || (scope === "class" && !classes.data?.items.length) || (scope === "section" && !sections.data?.items.length)}>{loading ? "Saving…" : editing ? "Save changes" : "Add event"}<ArrowRight size={15} /></button></div>
    </form>}

    <section className="surface overflow-hidden" aria-label="School calendar">
      <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><CalendarDays size={18} /></span><div><h2 className="display m-0 text-lg font-extrabold">{monthTitle(month)}</h2><p className="mb-0 mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{calendar.data ? `${calendar.data.total} scheduled ${calendar.data.total === 1 ? "event" : "events"}` : "Loading events…"}</p></div></div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-muted min-h-9 px-3" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(dateKey(today)); }}>Today</button>
          <button type="button" className="btn btn-muted min-h-9 w-9 px-0" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={17} /></button>
          <button type="button" className="btn btn-muted min-h-9 w-9 px-0" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={17} /></button>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 p-3 sm:p-5">
          <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div className="py-2" key={day}>{day}</div>)}</div>
          {calendar.isLoading ? <div className="skeleton h-[420px]" aria-label="Loading academic calendar" />
            : calendar.isError ? <div role="alert" className="flex min-h-72 flex-col items-center justify-center text-center"><AlertCircle className="mb-3 text-[hsl(var(--destructive))]" size={22} /><strong className="display">Calendar unavailable</strong><span className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{errorMessage(calendar.error)}</span><button className="btn btn-muted mt-4" onClick={() => calendar.refetch()}>Try again</button></div>
              : <div className="calendar-grid grid grid-cols-7 overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                {days.map((day) => {
                  const dayEvents = events.filter((item) => eventTouchesDay(item, day.key));
                  const selected = day.key === selectedDay;
                  return <button type="button" key={day.key} onClick={() => selectDay(day.key)} aria-label={`${longDate(day.key)}${dayEvents.length ? `, ${dayEvents.length} events` : ""}`} aria-pressed={selected} className={`calendar-day-cell min-w-0 border-b border-r border-[hsl(var(--border))] p-1.5 text-left transition sm:p-2 ${day.inMonth ? "" : "calendar-day-outside"} ${selected ? "calendar-day-selected" : ""}`}>
                    <span className={`calendar-day-number grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${selected ? "bg-[hsl(var(--primary))] text-white" : ""}`}>{day.date.getDate()}</span>
                    <span className="calendar-day-events mt-1 flex flex-col gap-1">
                      {dayEvents.slice(0, 2).map((item) => <span key={item.id} className={`calendar-day-event calendar-kind-${item.kind}`}>{item.title}</span>)}
                      {dayEvents.length > 2 && <span className="calendar-more-events">+{dayEvents.length - 2} more</span>}
                    </span>
                    {dayEvents.length > 0 && <span className="calendar-mobile-dots mt-1 flex gap-1 sm:hidden" aria-hidden="true">{dayEvents.slice(0, 3).map((item) => <i key={item.id} className={`calendar-event-dot calendar-kind-${item.kind}`} />)}</span>}
                  </button>;
                })}
              </div>}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-[hsl(var(--muted-foreground))]" aria-label="Calendar event types">
            {kinds.map((kind) => <span key={kind.value} className="inline-flex items-center gap-1.5"><i className={`calendar-legend-dot calendar-kind-${kind.value}`} />{kind.label}</span>)}
          </div>
        </div>

        <aside className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 sm:p-5 lg:border-l lg:border-t-0" aria-live="polite">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div><div className="calendar-aside-kicker">SELECTED DAY</div><h3 className="display mb-0 mt-1 text-base font-extrabold">{longDate(selectedDay)}</h3></div>
            <button type="button" className="btn btn-muted min-h-9 px-2" aria-label="Previous day" onClick={() => selectDay(dateKey(new Date(dateFromKey(selectedDay).getFullYear(), dateFromKey(selectedDay).getMonth(), dateFromKey(selectedDay).getDate() - 1)))}><ArrowLeft size={15} /></button>
            <button type="button" className="btn btn-muted min-h-9 px-2" aria-label="Next day" onClick={() => selectDay(dateKey(new Date(dateFromKey(selectedDay).getFullYear(), dateFromKey(selectedDay).getMonth(), dateFromKey(selectedDay).getDate() + 1)))}><ArrowRight size={15} /></button>
          </div>
          {selectedEvents.length ? <div className="space-y-2">
            {selectedEvents.map((event) => <article className="calendar-agenda-item" key={event.id} data-testid={`calendar-event-${event.id}`}>
              <div className={`calendar-agenda-mark calendar-kind-${event.kind}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className={`calendar-kind-badge calendar-kind-${event.kind}`}>{kindLabel(event.kind)}</span><span className="calendar-agenda-scope">{event.scopeName}</span></div>
                <h4 className="display mb-0 mt-2 text-sm font-extrabold">{event.title}</h4>
                <p className="mb-0 mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{event.startDate === event.endDate ? shortDate(event.startDate) : `${shortDate(event.startDate)} – ${shortDate(event.endDate)}`}</p>
                {event.description && <p className="mb-0 mt-2 whitespace-pre-wrap text-xs leading-5 text-[hsl(var(--muted-foreground))]">{event.description}</p>}
                {canManage && <div className="mt-3 flex gap-2"><button type="button" className="btn btn-muted min-h-8 px-2 text-[10px]" onClick={() => startEdit(event)}><Pencil size={13} />Edit</button><button type="button" className="btn btn-muted min-h-8 px-2 text-[10px] text-[hsl(var(--destructive))]" disabled={deleteEvent.isPending} onClick={() => removeEvent(event)}><Trash2 size={13} />Remove</button></div>}
              </div>
            </article>)}
          </div> : <div className="calendar-empty-day"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Clock3 size={18} /></span><strong className="display mt-3 text-sm">Nothing scheduled</strong><span className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">No school dates for this day.</span>{canManage && <button type="button" className="btn btn-muted mt-3 min-h-9" onClick={startCreate}><Plus size={14} />Add a date</button>}</div>}
          {calendar.data?.total === 0 && !calendar.isLoading && <p className="mt-4 text-center text-[10px] text-[hsl(var(--muted-foreground))]">Your school calendar is ready for its first event.</p>}
        </aside>
      </div>
    </section>
    <div className="mt-3 flex items-center gap-2 px-1 text-[10px] text-[hsl(var(--muted-foreground))]"><ChevronLeft size={13} /><span>Calendar events show the dates relevant to your account.</span></div>
  </div>;
}
