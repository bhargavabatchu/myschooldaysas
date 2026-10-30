"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetClassesQueryKey,
  getGetSectionsQueryKey,
  useCreateClass,
  useCreateSection,
} from "@workspace/api-client-react";

export function ClassSetupPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("1");
  const [firstSectionName, setFirstSectionName] = useState("A");
  const create = useCreateClass({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetClassesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetSectionsQueryKey() }),
        ]);
        setName("");
        setGradeLevel("1");
        setFirstSectionName("A");
      },
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const grade = Number(gradeLevel);
    if (!Number.isInteger(grade) || grade < 1 || grade > 12) return;
    create.mutate({
      data: {
        name: name.trim(),
        gradeLevel: grade,
        firstSectionName: firstSectionName.trim(),
      },
    });
  }

  return (
    <section className="surface mb-5 p-4">
      <div>
        <h2 className="m-0 text-sm font-bold">Add a class and first section</h2>
        <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          Create the class and its first section together, then add students from the Students page.
        </p>
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-[hsl(var(--border))] pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold">
          Class name
          <input
            aria-label="Class name"
            className="field mt-1.5"
            required
            maxLength={80}
            placeholder="e.g. Grade 1"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold">
          Grade level
          <input
            aria-label="Grade level"
            className="field mt-1.5"
            required
            type="number"
            min={1}
            max={12}
            step={1}
            value={gradeLevel}
            onChange={(event) => setGradeLevel(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold">
          First section
          <input
            aria-label="First section name"
            className="field mt-1.5"
            required
            maxLength={40}
            placeholder="e.g. A"
            value={firstSectionName}
            onChange={(event) => setFirstSectionName(event.target.value)}
          />
        </label>
        <div className="flex items-end">
          <button className="btn btn-primary min-h-10 w-full justify-center" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create class"}
          </button>
        </div>
      </form>
      {create.isError && <p role="alert" className="mb-0 mt-3 text-xs text-[hsl(var(--destructive))]">{create.error.message}</p>}
      {create.isSuccess && <p role="status" className="mb-0 mt-3 text-xs text-[hsl(var(--primary))]">Class and first section created.</p>}
    </section>
  );
}

export function AddSectionForm({ classId, className }: { classId: string; className: string }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useCreateSection({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetClassesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetSectionsQueryKey() }),
        ]);
        setName("");
        setIsOpen(false);
      },
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({ data: { classId, name: name.trim() } });
  }

  if (!isOpen) {
    return (
      <button type="button" className="btn btn-muted min-h-9 px-3 text-[11px]" onClick={() => setIsOpen(true)}>
        Add section
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t border-[hsl(var(--border))] pt-3">
      <label className="min-w-40 flex-1 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
        New section for {className}
        <input
          aria-label={`New section for ${className}`}
          className="field mt-1 min-h-9"
          required
          maxLength={40}
          placeholder="e.g. B"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button className="btn btn-primary min-h-9 px-3 text-[11px]" disabled={create.isPending}>
        {create.isPending ? "Adding…" : "Save section"}
      </button>
      <button type="button" className="btn btn-muted min-h-9 px-3 text-[11px]" onClick={() => setIsOpen(false)}>
        Cancel
      </button>
      {create.isError && <p role="alert" className="basis-full mb-0 text-xs text-[hsl(var(--destructive))]">{create.error.message}</p>}
    </form>
  );
}
