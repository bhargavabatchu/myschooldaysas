"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetStudentsQueryKey, useUpdateEnrollmentYear } from "@workspace/api-client-react";
import type { AcademicYear } from "@workspace/api-client-react";

export function EnrollmentYearField({
  enrollmentId,
  academicYear,
  items,
  loading = false,
  error = false,
}: {
  enrollmentId: string;
  academicYear: string;
  items: AcademicYear[];
  loading?: boolean;
  error?: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(academicYear);
  const update = useUpdateEnrollmentYear({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStudentsQueryKey() }),
    },
  });

  useEffect(() => setDraft(academicYear), [academicYear]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!items.some((year) => year.academicYear === value) || value === academicYear) return;
    update.mutate({ enrollmentId, data: { academicYear: value } });
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <select
        aria-label="Academic year"
        className="field min-h-9 w-32"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={loading || error || update.isPending}
      >
        <option value="">Choose year</option>
        {items.map((year) => <option key={year.id} value={year.academicYear}>{year.academicYear}</option>)}
      </select>
      <button
        className="btn btn-muted min-h-9 px-3 text-[11px]"
        disabled={!items.some((year) => year.academicYear === draft) || draft === academicYear || update.isPending}
      >
        {update.isPending ? "Saving…" : "Save"}
      </button>
      {(error || update.isError) && <span role="alert" className="sr-only">{update.isError ? update.error.message : "Academic years could not be loaded."}</span>}
    </form>
  );
}
