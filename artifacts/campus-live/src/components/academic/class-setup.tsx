"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetClassesQueryKey,
  getGetSectionsQueryKey,
  useCreateClass,
  useCreateSection,
  useGetClasses,
  useGetSections,
} from "@workspace/api-client-react";

type ExistingSection = { id: string; name: string };

function suggestSectionName(sections: ExistingSection[]) {
  const used = new Set(sections.map((section) => section.name.trim().toLowerCase()));
  for (let index = 0; index < 26; index += 1) {
    const label = String.fromCharCode(65 + index);
    if (!used.has(label.toLowerCase())) return label;
  }
  let suffix = 1;
  while (used.has(`Section ${suffix}`.toLowerCase())) suffix += 1;
  return `Section ${suffix}`;
}

export function ClassSetupPanel() {
  const queryClient = useQueryClient();
  const classes = useGetClasses({ includeArchived: true });
  const sections = useGetSections({ includeArchived: true });
  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("1");
  const [firstSectionName, setFirstSectionName] = useState("A");
  const normalizedName = name.trim();
  const existingClass = normalizedName
    ? classes.data?.items.find((item) => item.name.trim() === normalizedName)
    : undefined;
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
            onChange={(event) => {
              setName(event.target.value);
              create.reset();
            }}
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
          <button className="btn btn-primary min-h-10 w-full justify-center" disabled={!classes.data || create.isPending || Boolean(existingClass)}>
            {create.isPending ? "Creating…" : existingClass ? "Name already used" : "Create class"}
          </button>
        </div>
      </form>
      {classes.isLoading && <p role="status" className="mb-0 mt-3 text-xs text-[hsl(var(--muted-foreground))]">Checking existing classes…</p>}
      {classes.isError && <p role="alert" className="mb-0 mt-3 text-xs text-[hsl(var(--destructive))]">Could not check existing classes. Refresh this page before creating one.</p>}
      {existingClass && (
        <div role="status" className="mt-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-3 text-xs">
          <p className="mb-2 mt-0">
            <strong>{existingClass.name}</strong> already exists in Grade {existingClass.gradeLevel}. Add a section to this class, or choose a different class name.
          </p>
          {sections.data
            ? <AddSectionForm
                classId={existingClass.id}
                className={existingClass.name}
                existingSections={sections.data.items.filter((section) => section.classId === existingClass.id)}
              />
            : <p role="status" className="mb-0 mt-2 text-[hsl(var(--muted-foreground))]">Loading this class’s sections…</p>}
        </div>
      )}
      {create.isError && <p role="alert" className="mb-0 mt-3 text-xs text-[hsl(var(--destructive))]">{create.error.message}</p>}
      {create.isSuccess && <p role="status" className="mb-0 mt-3 text-xs text-[hsl(var(--primary))]">Class and first section created.</p>}
    </section>
  );
}

export function AddSectionForm({
  classId,
  className,
  existingSections = [],
}: {
  classId: string;
  className: string;
  existingSections?: ExistingSection[];
}) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const normalizedName = name.trim().toLowerCase();
  const duplicate = normalizedName
    ? existingSections.find((section) => section.name.trim().toLowerCase() === normalizedName)
    : undefined;
  const suggestedName = suggestSectionName(existingSections);
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
      <button
        type="button"
        className="btn btn-muted min-h-9 px-3 text-[11px]"
        onClick={() => {
          setName(suggestedName);
          create.reset();
          setIsOpen(true);
        }}
      >
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
          placeholder={`e.g. ${suggestedName}`}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            create.reset();
          }}
        />
        <span className="mt-1 block font-normal text-[hsl(var(--muted-foreground))]">
          Existing: {existingSections.length ? existingSections.map((section) => section.name).join(", ") : "none"} · Suggested: {suggestedName}
        </span>
      </label>
      <button className="btn btn-primary min-h-9 px-3 text-[11px]" disabled={create.isPending || Boolean(duplicate)}>
        {create.isPending ? "Adding…" : duplicate ? "Name already used" : "Save section"}
      </button>
      <button type="button" className="btn btn-muted min-h-9 px-3 text-[11px]" onClick={() => { create.reset(); setIsOpen(false); }}>
        Cancel
      </button>
      {duplicate && (
        <p role="alert" className="basis-full mb-0 text-xs text-[hsl(var(--destructive))]">
          {duplicate.name} already exists in {className}. Choose another name, such as {suggestedName}.
        </p>
      )}
      {create.isError && <p role="alert" className="basis-full mb-0 text-xs text-[hsl(var(--destructive))]">{create.error.message}</p>}
    </form>
  );
}
