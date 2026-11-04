"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetClassesQueryKey,
  getGetSectionsQueryKey,
  getGetStudentsQueryKey,
  useGetAcademicYears,
  usePromoteStudents,
} from "@workspace/api-client-react";
import type { ClassSummary, SectionSummary } from "@workspace/api-client-react";
import { ArrowUpRight, ChevronDown, GraduationCap } from "lucide-react";
import { AcademicYearSelect } from "./academic-year-select";

const readableError = (error: unknown) => error instanceof Error ? error.message : "Unable to promote students.";

export function ClassPromotionWizard({
  classes,
  sections,
}: {
  classes: ClassSummary[];
  sections: SectionSummary[];
}) {
  const queryClient = useQueryClient();
  const academicYears = useGetAcademicYears();
  const academicYearItems = academicYears.data?.items ?? [];
  const [open, setOpen] = useState(false);
  const [fromClassId, setFromClassId] = useState("");
  const [toClassId, setToClassId] = useState("");
  const [fromAcademicYear, setFromAcademicYear] = useState("");
  const [toAcademicYear, setToAcademicYear] = useState("");
  const [sectionMap, setSectionMap] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!classes.length) return;
    if (!classes.some((item) => item.id === fromClassId)) setFromClassId(classes[0]!.id);
    const targetIsValid = classes.some((item) => item.id === toClassId && item.id !== fromClassId);
    if (!targetIsValid) {
      setToClassId(classes.find((item) => item.id !== fromClassId)?.id ?? "");
    }
  }, [classes, fromClassId, toClassId]);

  const sourceSections = useMemo(
    () => sections.filter((section) => section.classId === fromClassId),
    [sections, fromClassId],
  );
  const targetSections = useMemo(
    () => sections.filter((section) => section.classId === toClassId),
    [sections, toClassId],
  );
  const currentYear = academicYearItems.find((year) => year.status === "current")?.academicYear ?? "";
  const targetYearItems = useMemo(
    () => academicYearItems.filter((year) => year.status !== "completed" && year.academicYear !== fromAcademicYear),
    [academicYearItems, fromAcademicYear],
  );

  useEffect(() => {
    setSectionMap((current) => Object.fromEntries(sourceSections.map((source) => {
      const existing = current[source.id];
      if (targetSections.some((target) => target.id === existing)) return [source.id, existing];
      const matchingName = targetSections.find((target) => target.name === source.name);
      return [source.id, matchingName?.id ?? targetSections[0]?.id ?? ""];
    })));
    setConfirmed(false);
  }, [sourceSections, targetSections]);

  useEffect(() => {
    if (!currentYear) return;
    setFromAcademicYear((current) => current && academicYearItems.some((year) => year.academicYear === current)
      ? current
      : currentYear);
  }, [academicYearItems, currentYear]);

  useEffect(() => {
    const fallback = targetYearItems.find((year) => year.status === "planned")?.academicYear
      ?? targetYearItems[0]?.academicYear
      ?? "";
    setToAcademicYear((current) => targetYearItems.some((year) => year.academicYear === current) ? current : fallback);
  }, [targetYearItems]);

  const promote = usePromoteStudents({
    mutation: {
      onSuccess: (result) => {
        setSuccessMessage(`${result.promotedCount} student${result.promotedCount === 1 ? "" : "s"} promoted. Previous enrollments remain in history.`);
        setConfirmed(false);
        queryClient.invalidateQueries({ queryKey: getGetStudentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSectionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClassesQueryKey() });
      },
    },
  });

  const mappingReady = sourceSections.length > 0
    && targetSections.length > 0
    && sourceSections.every((section) => targetSections.some((target) => target.id === sectionMap[section.id]));
  const yearsReady = academicYearItems.some((year) => year.academicYear === fromAcademicYear)
    && targetYearItems.some((year) => year.academicYear === toAcademicYear)
    && fromAcademicYear !== toAcademicYear;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || !mappingReady || !yearsReady || !fromClassId || !toClassId) return;
    setSuccessMessage("");
    promote.mutate({
      data: {
        fromClassId,
        toClassId,
        fromAcademicYear: fromAcademicYear.trim(),
        toAcademicYear: toAcademicYear.trim(),
        sectionMap,
      },
    });
  }

  return (
    <section className="surface mb-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
            <GraduationCap size={17} />
          </div>
          <div>
            <h2 className="m-0 text-sm font-bold">Promote a class</h2>
            <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">Move a cohort into a new class and academic year while keeping past enrollments.</p>
          </div>
        </div>
        <button className="btn btn-muted min-h-9 px-3 text-xs" type="button" onClick={() => setOpen((value) => !value)}>
          <ChevronDown size={15} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          {open ? "Close" : "Set up promotion"}
        </button>
      </div>

      {successMessage && <p role="status" className="mb-0 mt-3 text-xs text-[hsl(var(--primary))]">{successMessage}</p>}

      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-[hsl(var(--border))] pt-4 md:grid-cols-2">
          <label className="text-xs font-semibold">Promote from class
            <select className="field mt-1.5" required value={fromClassId} onChange={(event) => { setFromClassId(event.target.value); setConfirmed(false); }}>
              <option value="">Select source class</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">Promote to class
            <select className="field mt-1.5" required value={toClassId} onChange={(event) => { setToClassId(event.target.value); setConfirmed(false); }}>
              <option value="">Select target class</option>
              {classes.filter((item) => item.id !== fromClassId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <AcademicYearSelect
            label="Current academic year"
            items={academicYearItems}
            value={fromAcademicYear}
            onChange={(value) => { setFromAcademicYear(value); setConfirmed(false); }}
            disabled={academicYears.isLoading || promote.isPending}
          />
          <AcademicYearSelect
            label="New academic year"
            items={targetYearItems}
            value={toAcademicYear}
            onChange={(value) => { setToAcademicYear(value); setConfirmed(false); }}
            disabled={academicYears.isLoading || promote.isPending}
          />
          {academicYearItems.length === 0 && !academicYears.isLoading && (
            <p className="m-0 text-xs text-[hsl(var(--muted-foreground))] md:col-span-2">
              Add the current and next year in <a className="font-semibold text-[hsl(var(--primary))]" href="/calendar">Academic calendar</a> first.
            </p>
          )}
          {academicYearItems.length > 0 && targetYearItems.length === 0 && (
            <p className="m-0 text-xs text-[hsl(var(--muted-foreground))] md:col-span-2">
              Add a planned year in <a className="font-semibold text-[hsl(var(--primary))]" href="/calendar">Academic calendar</a> before promoting this class.
            </p>
          )}
          {academicYears.isError && <p role="alert" className="m-0 text-xs text-[hsl(var(--destructive))] md:col-span-2">Academic years could not be loaded. Refresh and try again.</p>}

          {sourceSections.length > 0 && (
            <fieldset className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-3 md:col-span-2">
              <legend className="px-1 text-xs font-semibold">Map source sections to destination sections</legend>
              {sourceSections.map((source) => (
                <label key={source.id} className="grid gap-2 text-xs font-semibold sm:grid-cols-[1fr_1fr] sm:items-center">
                  <span>{source.name}</span>
                  <select
                    className="field"
                    required
                    value={sectionMap[source.id] ?? ""}
                    onChange={(event) => {
                      setSectionMap((current) => ({ ...current, [source.id]: event.target.value }));
                      setConfirmed(false);
                    }}
                  >
                    <option value="">Select destination section</option>
                    {targetSections.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                  </select>
                </label>
              ))}
            </fieldset>
          )}

          {!sourceSections.length && fromClassId && <p className="m-0 text-xs text-[hsl(var(--muted-foreground))] md:col-span-2">The source class has no sections.</p>}
          {sourceSections.length > 0 && !targetSections.length && <p className="m-0 text-xs text-[hsl(var(--destructive))] md:col-span-2">The target class has no sections yet.</p>}
          <p className="m-0 rounded-lg bg-[hsl(var(--secondary))] p-3 text-xs text-[hsl(var(--muted-foreground))] md:col-span-2">
            Promotion is all-or-nothing. Active enrollment records in the current year will close, new records will be created in the target year, and previous records will remain visible in each student’s enrollment history. The server checks destination capacity before saving.
          </p>
          {promote.isError && <p role="alert" className="m-0 text-xs text-[hsl(var(--destructive))] md:col-span-2">{readableError(promote.error)}</p>}
          <label className="flex items-start gap-2 text-xs font-normal text-[hsl(var(--muted-foreground))] md:col-span-2">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={promote.isPending} />
            <span>I reviewed the classes, academic years, and section mappings.</span>
          </label>
          <div className="flex justify-end md:col-span-2">
            <button
              className="btn btn-primary min-h-9 px-4 text-xs"
              disabled={!confirmed || !mappingReady || !yearsReady || promote.isPending}
            >
              <ArrowUpRight size={15} />{promote.isPending ? "Promoting…" : "Promote students"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
