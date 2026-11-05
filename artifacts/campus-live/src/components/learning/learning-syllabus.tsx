import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetLearningSyllabusQueryKey,
  useCreateLearningSyllabusLesson,
  useCreateLearningSyllabusMaterial,
  useCreateLearningSyllabusTopic,
  useDeleteLearningSyllabusLesson,
  useDeleteLearningSyllabusMaterial,
  useDeleteLearningSyllabusTopic,
  useGetLearningSyllabus,
  useUpdateLearningSyllabusLesson,
  useUpdateLearningSyllabusMaterial,
  useUpdateLearningSyllabusTopic,
} from '@workspace/api-client-react';
import type {
  LearningSyllabus,
  LearningSyllabusLesson,
  LearningSyllabusMaterial,
  LearningSyllabusMaterialInput,
  LearningSyllabusTopic,
} from '@workspace/api-client-react';
import {
  BookOpen,
  CirclePlay,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';

type Props = { canManage: boolean; onNotice: (message: string) => void };
type TextDraft = { title: string; description: string };
type MaterialDraft = LearningSyllabusMaterialInput;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

export function LearningSyllabus({ canManage, onNotice }: Props) {
  const queryClient = useQueryClient();
  const syllabus = useGetLearningSyllabus();
  const addLesson = useCreateLearningSyllabusLesson();
  const updateLesson = useUpdateLearningSyllabusLesson();
  const deleteLesson = useDeleteLearningSyllabusLesson();
  const addTopic = useCreateLearningSyllabusTopic();
  const updateTopic = useUpdateLearningSyllabusTopic();
  const deleteTopic = useDeleteLearningSyllabusTopic();
  const addMaterial = useCreateLearningSyllabusMaterial();
  const updateMaterial = useUpdateLearningSyllabusMaterial();
  const deleteMaterial = useDeleteLearningSyllabusMaterial();
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [lessonForm, setLessonForm] = useState<'create' | string | null>(null);
  const [topicForm, setTopicForm] = useState<{ lessonId: string; topicId?: string } | null>(null);
  const [materialForm, setMaterialForm] = useState<{ topicId: string; materialId?: string } | null>(null);

  const items = syllabus.data?.items ?? [];
  const classes = useMemo(() => {
    const unique = new Map<string, string>();
    items.forEach((item) => unique.set(item.classId, item.className));
    return Array.from(unique, ([id, name]) => ({ id, name }));
  }, [items]);
  const selectedClassId = classes.some((item) => item.id === classId) ? classId : classes[0]?.id ?? '';
  const subjects = items.filter((item) => item.classId === selectedClassId);
  const selectedSubjectId = subjects.some((item) => item.subjectId === subjectId)
    ? subjectId
    : subjects[0]?.subjectId ?? '';
  const active = items.find((item) => item.classId === selectedClassId && item.subjectId === selectedSubjectId) ?? null;
  const isSaving = addLesson.isPending || updateLesson.isPending || deleteLesson.isPending
    || addTopic.isPending || updateTopic.isPending || deleteTopic.isPending
    || addMaterial.isPending || updateMaterial.isPending || deleteMaterial.isPending;
  const failure = addLesson.error || updateLesson.error || deleteLesson.error
    || addTopic.error || updateTopic.error || deleteTopic.error
    || addMaterial.error || updateMaterial.error || deleteMaterial.error;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetLearningSyllabusQueryKey() });

  const saveLesson = (draft: TextDraft, editing?: LearningSyllabusLesson) => {
    if (!active) return;
    if (editing) {
      updateLesson.mutate({ lessonId: editing.id, data: draft }, {
        onSuccess: () => { setLessonForm(null); invalidate(); onNotice('Lesson updated.'); },
      });
      return;
    }
    addLesson.mutate({
      data: { classId: active.classId, subjectId: active.subjectId, ...draft },
    }, {
      onSuccess: () => { setLessonForm(null); invalidate(); onNotice('Lesson added to the class syllabus.'); },
    });
  };

  const saveTopic = (draft: TextDraft, lessonId: string, editing?: LearningSyllabusTopic) => {
    if (editing) {
      updateTopic.mutate({ topicId: editing.id, data: draft }, {
        onSuccess: () => { setTopicForm(null); invalidate(); onNotice('Topic updated.'); },
      });
      return;
    }
    addTopic.mutate({ lessonId, data: draft }, {
      onSuccess: () => { setTopicForm(null); invalidate(); onNotice('Topic added.'); },
    });
  };

  const saveMaterial = (draft: MaterialDraft, topicId: string, editing?: LearningSyllabusMaterial) => {
    if (editing) {
      updateMaterial.mutate({ materialId: editing.id, data: draft }, {
        onSuccess: () => { setMaterialForm(null); invalidate(); onNotice('Learning material updated.'); },
      });
      return;
    }
    addMaterial.mutate({ topicId, data: draft }, {
      onSuccess: () => { setMaterialForm(null); invalidate(); onNotice('Learning material added.'); },
    });
  };

  if (syllabus.isLoading) return <div className="surface space-y-4 p-5" aria-label="Loading syllabus">
    <div className="skeleton h-10 w-full"/><div className="skeleton h-28 w-full"/><div className="skeleton h-28 w-full"/>
  </div>;

  if (syllabus.error) return <section className="surface p-6 text-center">
    <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{errorMessage(syllabus.error)}</p>
    <button className="btn btn-muted" onClick={() => syllabus.refetch()}>Retry</button>
  </section>;

  const renderLesson = (lesson: LearningSyllabusLesson) => {
    const editing = lessonForm === lesson.id;
    return <article key={lesson.id} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-white/70">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><BookOpen size={17}/></div>
          <div><h3 className="m-0 text-sm font-extrabold">{lesson.title}</h3>{lesson.description && <p className="mb-0 mt-1 whitespace-pre-wrap text-xs leading-5 text-[hsl(var(--muted-foreground))]">{lesson.description}</p>}</div>
        </div>
        {canManage && <div className="flex gap-1">
          <button className="btn btn-quiet btn-sm" aria-label={`Edit ${lesson.title}`} onClick={() => { setLessonForm(lesson.id); setTopicForm(null); setMaterialForm(null); }}><Pencil size={14}/></button>
          <button className="btn btn-quiet btn-sm text-[hsl(var(--destructive))]" aria-label={`Delete ${lesson.title}`} disabled={isSaving} onClick={() => {
            if (window.confirm(`Delete “${lesson.title}” and all its topics and materials?`)) {
              deleteLesson.mutate({ lessonId: lesson.id }, { onSuccess: () => { invalidate(); onNotice('Lesson and its content removed.'); } });
            }
          }}><Trash2 size={14}/></button>
        </div>}
      </div>
      {editing && <div className="px-4 pb-4"><TextEditor initial={{ title: lesson.title, description: lesson.description }} saving={isSaving} submitLabel="Save lesson" onCancel={() => setLessonForm(null)} onSave={(draft) => saveLesson(draft, lesson)}/></div>}
      <div className="space-y-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
        {!lesson.topics.length && <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">Topics and their learning resources will appear here.</p>}
        {lesson.topics.map((topic) => renderTopic(topic, lesson.id))}
        {canManage && topicForm?.lessonId === lesson.id && !topicForm.topicId && <TextEditor saving={isSaving} submitLabel="Add topic" onCancel={() => setTopicForm(null)} onSave={(draft) => saveTopic(draft, lesson.id)}/>}
        {canManage && <button className="btn btn-muted btn-sm" onClick={() => { setTopicForm({ lessonId: lesson.id }); setLessonForm(null); setMaterialForm(null); }}><Plus size={14}/>Add topic</button>}
      </div>
    </article>;
  };

  const renderTopic = (topic: LearningSyllabusTopic, lessonId: string) => {
    const editing = topicForm?.topicId === topic.id;
    return <section key={topic.id} className="rounded-xl border border-[hsl(var(--border))] bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h4 className="m-0 text-xs font-extrabold">{topic.title}</h4>{topic.description && <p className="mb-0 mt-1 whitespace-pre-wrap text-xs leading-5 text-[hsl(var(--muted-foreground))]">{topic.description}</p>}</div>
        {canManage && <div className="flex gap-1">
          <button className="btn btn-quiet btn-sm" aria-label={`Edit ${topic.title}`} onClick={() => { setTopicForm({ lessonId, topicId: topic.id }); setLessonForm(null); setMaterialForm(null); }}><Pencil size={13}/></button>
          <button className="btn btn-quiet btn-sm text-[hsl(var(--destructive))]" aria-label={`Delete ${topic.title}`} disabled={isSaving} onClick={() => {
            if (window.confirm(`Delete “${topic.title}” and its learning materials?`)) {
              deleteTopic.mutate({ topicId: topic.id }, { onSuccess: () => { invalidate(); onNotice('Topic and its materials removed.'); } });
            }
          }}><Trash2 size={13}/></button>
        </div>}
      </div>
      {editing && <div className="mt-3"><TextEditor initial={{ title: topic.title, description: topic.description }} saving={isSaving} submitLabel="Save topic" onCancel={() => setTopicForm(null)} onSave={(draft) => saveTopic(draft, lessonId, topic)}/></div>}
      <div className="mt-3 space-y-2">
        {topic.materials.map((material) => renderMaterial(material, topic.id))}
        {canManage && materialForm?.topicId === topic.id && <MaterialEditor
          initial={materialForm.materialId ? topic.materials.find((item) => item.id === materialForm.materialId) : undefined}
          saving={isSaving}
          onCancel={() => setMaterialForm(null)}
          onSave={(draft) => saveMaterial(draft, topic.id, topic.materials.find((item) => item.id === materialForm.materialId))}
        />}
        {canManage && <button className="btn btn-quiet btn-sm" onClick={() => { setMaterialForm({ topicId: topic.id }); setLessonForm(null); setTopicForm(null); }}><Plus size={13}/>Add document or video</button>}
        {!topic.materials.length && !canManage && <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">No materials shared for this topic yet.</p>}
      </div>
    </section>;
  };

  const renderMaterial = (material: LearningSyllabusMaterial, topicId: string) => {
    const Icon = material.kind === 'video' ? CirclePlay : material.kind === 'document' ? FileText : Link2;
    if (materialForm?.materialId === material.id) return <MaterialEditor
      key={material.id}
      initial={material}
      saving={isSaving}
      onCancel={() => setMaterialForm(null)}
      onSave={(draft) => saveMaterial(draft, topicId, material)}
    />;
    return <div key={material.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[hsl(var(--background))] px-3 py-2.5">
      <a href={material.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 text-xs font-bold text-[hsl(var(--primary))] hover:underline">
        <Icon size={15} className="shrink-0"/><span className="truncate">{material.title}</span><ExternalLink size={12} className="shrink-0"/>
        <span className="sr-only">opens in a new tab</span>
      </a>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{material.kind}</span>
        {canManage && <><button className="btn btn-quiet btn-sm" aria-label={`Edit ${material.title}`} onClick={() => { setMaterialForm({ topicId, materialId: material.id }); setLessonForm(null); setTopicForm(null); }}><Pencil size={13}/></button>
          <button className="btn btn-quiet btn-sm text-[hsl(var(--destructive))]" aria-label={`Delete ${material.title}`} disabled={isSaving} onClick={() => {
            if (window.confirm(`Remove “${material.title}” from this topic?`)) {
              deleteMaterial.mutate({ materialId: material.id }, { onSuccess: () => { invalidate(); onNotice('Learning material removed.'); } });
            }
          }}><Trash2 size={13}/></button></>}
      </div>
      {material.description && <p className="basis-full m-0 pl-6 text-xs text-[hsl(var(--muted-foreground))]">{material.description}</p>}
    </div>;
  };

  return <section className="space-y-4">
    <header className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><BookOpen size={19}/></div>
        <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[.17em] text-[hsl(var(--primary))]">Class curriculum</p><h2 className="display m-0 text-lg font-extrabold">Syllabus & learning materials</h2><p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">Shared by subject across all sections in the class.</p></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Class<select className="field mt-1 min-h-10 text-xs" value={selectedClassId} onChange={(event) => { setClassId(event.target.value); setSubjectId(''); }}><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Subject<select className="field mt-1 min-h-10 text-xs" value={selectedSubjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Select subject</option>{subjects.map((item) => <option key={item.subjectId} value={item.subjectId}>{item.subjectName}</option>)}</select></label>
      </div>
    </header>

    {failure && <div role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">{errorMessage(failure)}</div>}
    {!items.length ? <div className="surface p-8 text-center">
      <BookOpen className="mx-auto text-[hsl(var(--muted-foreground))]" size={24}/>
      <h3 className="display mt-3 text-base font-extrabold">{canManage ? 'No class subjects available' : 'No syllabus shared yet'}</h3>
      <p className="mx-auto mb-0 mt-1 max-w-lg text-sm text-[hsl(var(--muted-foreground))]">{canManage ? 'Assign subjects to active class sections first. Their class-shared syllabus will appear here.' : 'Your school has not shared syllabus content for your class yet.'}</p>
    </div> : !active ? null : <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[hsl(var(--secondary)/.6)] px-4 py-3">
        <div><p className="m-0 text-[10px] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{active.className} · Shared across sections</p><h3 className="display m-0 mt-1 text-base font-extrabold">{active.subjectName}</h3></div>
        {canManage && <button className="btn btn-primary btn-sm" onClick={() => { setLessonForm('create'); setTopicForm(null); setMaterialForm(null); }}><Plus size={14}/>Add lesson</button>}
      </div>
      {lessonForm === 'create' && <TextEditor saving={isSaving} submitLabel="Add lesson" onCancel={() => setLessonForm(null)} onSave={(draft) => saveLesson(draft)}/>}
      {!active.lessons.length ? <div className="surface p-7 text-center">
        <h4 className="m-0 text-sm font-bold">{canManage ? 'Start this syllabus' : 'No lessons published yet'}</h4>
        <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">{canManage ? 'Add the first lesson, then organize it into topics and resource links.' : 'Lessons, topics and learning links will show here when the school adds them.'}</p>
      </div> : <div className="space-y-3">{active.lessons.map(renderLesson)}</div>}
    </div>}
  </section>;
}

function TextEditor({ initial, saving, submitLabel, onSave, onCancel }: {
  initial?: TextDraft;
  saving: boolean;
  submitLabel: string;
  onSave: (draft: TextDraft) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  return <form className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-white p-3" onSubmit={(event) => { event.preventDefault(); onSave({ title: title.trim(), description: description.trim() }); }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold">Title<input required maxLength={180} className="field mt-1.5 min-h-10 text-xs" value={title} onChange={(event) => setTitle(event.target.value)}/></label>
      <label className="text-xs font-bold">Description<textarea maxLength={6000} rows={2} className="field mt-1.5 resize-y text-xs" value={description} onChange={(event) => setDescription(event.target.value)}/></label>
    </div>
    <div className="flex justify-end gap-2"><button type="button" className="btn btn-muted btn-sm" onClick={onCancel}><X size={13}/>Cancel</button><button className="btn btn-primary btn-sm" disabled={saving || !title.trim()}><Save size={13}/>{saving ? 'Saving…' : submitLabel}</button></div>
  </form>;
}

function MaterialEditor({ initial, saving, onSave, onCancel }: {
  initial?: LearningSyllabusMaterial;
  saving: boolean;
  onSave: (draft: MaterialDraft) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState<MaterialDraft['kind']>(initial?.kind ?? 'document');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  return <form className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-white p-3" onSubmit={(event) => {
    event.preventDefault();
    onSave({ title: title.trim(), kind, url: url.trim(), description: description.trim() });
  }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold">Resource title<input required maxLength={180} className="field mt-1.5 min-h-10 text-xs" value={title} onChange={(event) => setTitle(event.target.value)}/></label>
      <label className="text-xs font-bold">Type<select className="field mt-1.5 min-h-10 text-xs" value={kind} onChange={(event) => setKind(event.target.value as MaterialDraft['kind'])}><option value="document">Document</option><option value="video">Learning video</option><option value="link">Other link</option></select></label>
      <label className="text-xs font-bold sm:col-span-2">Secure link (HTTPS)<input required type="url" maxLength={2048} placeholder="https://…" className="field mt-1.5 min-h-10 text-xs" value={url} onChange={(event) => setUrl(event.target.value)}/></label>
      <label className="text-xs font-bold sm:col-span-2">Short note<textarea maxLength={3000} rows={2} className="field mt-1.5 resize-y text-xs" value={description} onChange={(event) => setDescription(event.target.value)}/></label>
    </div>
    <div className="flex justify-end gap-2"><button type="button" className="btn btn-muted btn-sm" onClick={onCancel}><X size={13}/>Cancel</button><button className="btn btn-primary btn-sm" disabled={saving || !title.trim() || !url.trim()}><Save size={13}/>{saving ? 'Saving…' : initial ? 'Save link' : 'Add link'}</button></div>
  </form>;
}
