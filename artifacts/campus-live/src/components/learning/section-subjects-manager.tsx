import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSectionSubjectsQueryKey,
  useGetClasses,
  useGetSectionSubjects,
  useGetSections,
  useUpdateSectionSubjects,
} from "@workspace/api-client-react";
import { BookOpenCheck, Save } from "lucide-react";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Please try again.";

export function SectionSubjectsManager({ onSaved }: { onSaved: () => void }) {
  const client = useQueryClient();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const classes = useGetClasses();
  const sections = useGetSections();
  const sectionOptions = useMemo(
    () => (sections.data?.items ?? []).filter(section =>
      section.classId === classId && section.isActive && section.classIsActive,
    ),
    [sections.data, classId],
  );
  const subjects = useGetSectionSubjects(sectionId, { query: { enabled: Boolean(sectionId) } });
  const offeredIds = useMemo(
    () => (subjects.data?.items ?? []).filter(subject => subject.isActive && subject.isOffered).map(subject => subject.subjectId),
    [subjects.data],
  );
  const hasChanges = selectedIds.length !== offeredIds.length || selectedIds.some(id => !offeredIds.includes(id));
  const save = useUpdateSectionSubjects({
    mutation: {
      onSuccess: page => {
        const updatedIds = page.items.filter(subject => subject.isActive && subject.isOffered).map(subject => subject.subjectId);
        setSelectedIds(updatedIds);
        client.setQueryData(getGetSectionSubjectsQueryKey(sectionId), page);
        onSaved();
      },
    },
  });

  useEffect(() => {
    setSelectedIds(offeredIds);
  }, [offeredIds]);

  const selectedClass = classes.data?.items.find(item => item.id === classId);
  const currentError = classes.error || sections.error || subjects.error || save.error;

  return (
    <section className="surface overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-[hsl(var(--border))] p-5 sm:flex-row sm:items-center">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
          <BookOpenCheck size={18} />
        </div>
        <div>
          <h2 className="display m-0 text-lg font-extrabold">Subjects by class and section</h2>
          <p className="mb-0 mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
            New sections start with the eight common subjects. Changes here affect only the selected section.
          </p>
        </div>
      </header>

      <div className="grid gap-3 border-b border-[hsl(var(--border))] p-4 sm:grid-cols-2">
        <label className="text-xs font-bold">
          Class
          <select
            className="field mt-1.5 min-h-10 text-xs"
            value={classId}
            onChange={event => {
              setClassId(event.target.value);
              setSectionId("");
            }}
          >
            <option value="">Choose class</option>
            {(classes.data?.items ?? []).filter(item => item.isActive).map(item =>
              <option key={item.id} value={item.id}>{item.name}</option>,
            )}
          </select>
        </label>
        <label className="text-xs font-bold">
          Section
          <select
            className="field mt-1.5 min-h-10 text-xs"
            value={sectionId}
            disabled={!classId}
            onChange={event => setSectionId(event.target.value)}
          >
            <option value="">Choose section</option>
            {sectionOptions.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>
        </label>
      </div>

      {!sectionId ? (
        <p className="m-0 p-5 text-xs text-[hsl(var(--muted-foreground))]">
          {selectedClass ? `Choose a section in ${selectedClass.name} to manage its subjects.` : "Choose a class and section to manage subjects."}
        </p>
      ) : subjects.isLoading ? (
        <div className="space-y-3 p-5"><div className="skeleton h-10" /><div className="skeleton h-10" /></div>
      ) : subjects.isError ? (
        <div className="p-5 text-sm text-[hsl(var(--destructive))]" role="alert">{errorMessage(subjects.error)}</div>
      ) : (subjects.data?.items.length ?? 0) === 0 ? (
        <p className="m-0 p-5 text-xs text-[hsl(var(--muted-foreground))]">Add subjects to the school catalog first.</p>
      ) : (
        <>
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {(subjects.data?.items ?? []).map(subject => (
              <label
                key={subject.subjectId}
                className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 text-xs ${
                  subject.isActive
                    ? "border-[hsl(var(--border))] bg-[hsl(var(--background))]"
                    : "cursor-not-allowed border-[hsl(var(--border))] opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-[hsl(var(--primary))]"
                  checked={selectedIds.includes(subject.subjectId)}
                  disabled={!subject.isActive || save.isPending}
                  onChange={event => setSelectedIds(current =>
                    event.target.checked
                      ? [...new Set([...current, subject.subjectId])]
                      : current.filter(id => id !== subject.subjectId),
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{subject.name}</span>
                  <span className="mt-0.5 block text-[10px] text-[hsl(var(--muted-foreground))]">
                    {subject.code || "No code"}{!subject.isActive ? " · inactive in catalog" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-3 border-t border-[hsl(var(--border))] p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">
              {selectedIds.length} subject{selectedIds.length === 1 ? "" : "s"} selected. Existing marks and timetable history are retained.
            </p>
            <button
              className="btn btn-primary"
              disabled={!hasChanges || save.isPending}
              onClick={() => save.mutate({ sectionId, data: { subjectIds: selectedIds } })}
            >
              <Save size={15} />{save.isPending ? "Saving…" : "Save section subjects"}
            </button>
          </div>
        </>
      )}
      {currentError && (classes.isError || sections.isError || save.isError) && (
        <p className="m-0 px-5 pb-4 text-xs text-[hsl(var(--destructive))]" role="alert">{errorMessage(currentError)}</p>
      )}
    </section>
  );
}
