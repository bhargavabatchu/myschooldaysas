"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAcademicYearsQueryKey,
  useCreateAcademicYear,
  useGetAcademicYears,
  useSetCurrentAcademicYear,
} from "@workspace/api-client-react";
import { CalendarRange, Check, CirclePlus } from "lucide-react";

export function AcademicYearsPanel() {
  const queryClient = useQueryClient();
  const years = useGetAcademicYears();
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");

  const create = useCreateAcademicYear({
    mutation: {
      onSuccess: async (year) => {
        setDraft("");
        setNotice(`${year.academicYear} added. Choose “Set as current” when it becomes the active school year.`);
        await queryClient.invalidateQueries({ queryKey: getGetAcademicYearsQueryKey() });
      },
      onError: (error) => setNotice(error.message || "The academic year could not be added."),
    },
  });
  const setCurrent = useSetCurrentAcademicYear({
    mutation: {
      onSuccess: async (year) => {
        setNotice(`${year.academicYear} is now the current academic year.`);
        await queryClient.invalidateQueries({ queryKey: getGetAcademicYearsQueryKey() });
      },
      onError: (error) => setNotice(error.message || "The current academic year could not be changed."),
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const academicYear = draft.trim();
    if (academicYear.length < 4 || academicYear.length > 24) {
      setNotice("Enter an academic year label between 4 and 24 characters.");
      return;
    }
    create.mutate({ data: { academicYear } });
  }

  const items = years.data?.items ?? [];
  const pending = create.isPending || setCurrent.isPending;

  return (
    <section className="surface mb-5 p-4 sm:p-5" aria-labelledby="academic-years-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
            <CalendarRange size={18} />
          </span>
          <div>
            <p className="eyebrow">School setup</p>
            <h2 id="academic-years-heading" className="display m-0 text-lg font-bold">Academic years</h2>
            <p className="mb-0 mt-1 max-w-2xl text-xs text-[hsl(var(--muted-foreground))]">
              Add each year here once, then choose it in admissions, enrollment, promotion, and fees.
            </p>
          </div>
        </div>
      </div>

      <form className="mt-4 flex flex-wrap items-end gap-3 border-t border-[hsl(var(--border))] pt-4" onSubmit={submit}>
        <label className="min-w-56 flex-1 text-xs font-semibold">
          Add an academic year
          <input
            className="field mt-1.5"
            required
            minLength={4}
            maxLength={24}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. 2027-28"
            disabled={pending}
          />
        </label>
        <button className="btn btn-primary min-h-10 px-4 text-xs" disabled={draft.trim().length < 4 || pending}>
          <CirclePlus size={15} />{create.isPending ? "Adding…" : "Add year"}
        </button>
      </form>

      {years.isLoading && <p className="mb-0 mt-4 text-xs text-[hsl(var(--muted-foreground))]">Loading academic years…</p>}
      {years.isError && <p role="alert" className="mb-0 mt-4 text-xs text-[hsl(var(--destructive))]">Academic years could not be loaded. Refresh and try again.</p>}
      {!years.isLoading && !years.isError && items.length === 0 && (
        <p className="mb-0 mt-4 rounded-lg bg-[hsl(var(--secondary))] p-3 text-xs text-[hsl(var(--muted-foreground))]">
          No academic years are set up yet. Add a year above, then mark it current.
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
          <table className="w-full min-w-[450px] text-left text-xs">
            <thead className="bg-[hsl(var(--muted))] text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              <tr><th className="px-3 py-2.5">Academic year</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Action</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-3 font-semibold">{item.academicYear}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                      item.status === "current"
                        ? "bg-[hsl(var(--status-good-bg))] text-[hsl(var(--brand-mint-ink))]"
                        : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                    }`}>
                      {item.status === "current" && <Check size={12} />}
                      {item.status === "current" ? "Current" : item.status === "planned" ? "Planned" : "Completed"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {item.status !== "current" && (
                      <button
                        type="button"
                        className="btn btn-muted min-h-8 px-3 text-[11px]"
                        disabled={pending}
                        onClick={() => {
                          setNotice("");
                          setCurrent.mutate({ yearId: item.id });
                        }}
                      >
                        {setCurrent.isPending ? "Updating…" : "Set as current"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {notice && (
        <p role="status" className={`mb-0 mt-3 text-xs ${
          create.isError || setCurrent.isError ? "text-[hsl(var(--destructive))]" : "text-[hsl(var(--primary))]"
        }`}>{notice}</p>
      )}
      <p className="mb-0 mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">
        Changing the current year updates the dashboard summary and default for new actions. It does not move students or change existing fees.
      </p>
    </section>
  );
}
