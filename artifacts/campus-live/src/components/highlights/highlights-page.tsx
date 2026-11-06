import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  useCreateSchoolHighlight,
  useGetClasses,
  useGetSchoolHighlights,
  useGetSections,
  getGetSchoolHighlightsQueryKey,
  getGetSectionsQueryKey,
} from '@workspace/api-client-react';
import type { SchoolHighlight, SchoolHighlightInput } from '@workspace/api-client-react';
import { Award, CalendarDays, ImagePlus, LoaderCircle, Newspaper, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import { getAccessToken, refreshRememberedSession } from '../../auth-token';

const categoryLabels = {
  achievement: 'Achievement',
  event: 'School event',
  school_news: 'School news',
} as const;

const categoryTone = {
  achievement: 'bg-[hsl(var(--brand-mint))] text-[hsl(var(--brand-mint-ink))]',
  event: 'bg-[hsl(var(--accent)/.18)] text-[hsl(var(--foreground))]',
  school_news: 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]',
} as const;

function formatPublishedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently shared' : new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again in a moment.';
}

async function fetchPhotoBlob(id: string) {
  const request = async (token: string | null) => fetch(`/api/highlights/${encodeURIComponent(id)}/photo`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}`, Accept: 'image/*' } : { Accept: 'image/*' },
  });
  let response = await request(getAccessToken());
  if (response.status === 401) response = await request(await refreshRememberedSession());
  if (!response.ok) throw new Error(response.status === 404 ? 'Photo is no longer available.' : 'Photo could not be loaded.');
  return response.blob();
}

function HighlightPhoto({ highlight, compact = false }: { highlight: SchoolHighlight; compact?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    if (!highlight.photoUrl) return;
    void fetchPhotoBlob(highlight.id).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [highlight.id, highlight.photoUrl]);
  if (!highlight.photoUrl) return null;
  if (failed) return <div role="status" className={`grid place-items-center rounded-xl bg-[hsl(var(--muted))] text-[10px] text-[hsl(var(--muted-foreground))] ${compact ? 'h-28' : 'h-40'}`}>Photo is temporarily unavailable.</div>;
  return src
    ? <img src={src} alt={highlight.photoAlt ?? ''} className={`w-full object-cover ${compact ? 'h-36 rounded-xl' : 'max-h-[430px] min-h-[200px] rounded-2xl'}`} loading="lazy" />
    : <div className={`skeleton w-full ${compact ? 'h-36 rounded-xl' : 'h-64 rounded-2xl'}`} role="status" aria-label="Loading school photo" />;
}

export function HighlightCard({ highlight, compact = false }: { highlight: SchoolHighlight; compact?: boolean }) {
  const CategoryIcon = highlight.category === 'achievement' ? Award : highlight.category === 'event' ? CalendarDays : Newspaper;
  return (
    <article className={`surface overflow-hidden ${compact ? 'p-3.5' : 'p-4 sm:p-6'}`} data-testid={`highlight-${highlight.id}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[14px] ${categoryTone[highlight.category]}`}>
          <CategoryIcon size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`tag ${categoryTone[highlight.category]}`}>{categoryLabels[highlight.category]}</span>
            {highlight.audience !== 'school' && highlight.audienceName && <span className="tag">{highlight.audienceName}</span>}
          </div>
          <h3 className={`display m-0 mt-2 font-extrabold leading-tight tracking-[-.025em] ${compact ? 'text-[15px]' : 'text-[20px] sm:text-[23px]'}`}>{highlight.title}</h3>
          <p className="m-0 mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{formatPublishedAt(highlight.publishedAt)} <span aria-hidden="true">·</span> {highlight.authorName}</p>
        </div>
      </div>
      <p className={`whitespace-pre-wrap leading-relaxed text-[hsl(var(--foreground)/.82)] ${compact ? 'mb-0 mt-3 line-clamp-3 text-[11px]' : 'mb-0 mt-4 text-[13px]'}`}>{highlight.body}</p>
      {!compact && highlight.photoUrl && <div className="mt-4"><HighlightPhoto highlight={highlight} /></div>}
      {compact && highlight.photoUrl && <div className="mt-3"><HighlightPhoto highlight={highlight} compact /></div>}
    </article>
  );
}

function imageToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const localUrl = URL.createObjectURL(file);
    image.onload = async () => {
      URL.revokeObjectURL(localUrl);
      const maxEdge = 1800;
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('This photo could not be prepared. Choose another image.'));
      context.fillStyle = '#f8f6ef';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const baseWidth = canvas.width;
      const baseHeight = canvas.height;
      let blob: Blob | null = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        canvas.width = Math.max(1, Math.round(baseWidth * Math.pow(0.78, attempt)));
        canvas.height = Math.max(1, Math.round(baseHeight * Math.pow(0.78, attempt)));
        const drawContext = canvas.getContext('2d');
        if (!drawContext) return reject(new Error('This photo could not be prepared. Choose another image.'));
        drawContext.fillStyle = '#f8f6ef';
        drawContext.fillRect(0, 0, canvas.width, canvas.height);
        drawContext.drawImage(image, 0, 0, canvas.width, canvas.height);
        const quality = Math.max(0.4, 0.82 - attempt * 0.07);
        blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/jpeg', quality));
        if (blob && blob.size < 550 * 1024) break;
      }
      if (!blob || blob.size >= 550 * 1024) return reject(new Error('This photo is too large to prepare. Choose a smaller image.'));
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Photo conversion failed.'));
      reader.onerror = () => reject(new Error('Photo conversion failed.'));
      reader.readAsDataURL(blob);
    };
    image.onerror = () => { URL.revokeObjectURL(localUrl); reject(new Error('Choose a valid image file.')); };
    image.src = localUrl;
  });
}

function CreateHighlightForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateSchoolHighlight();
  const classes = useGetClasses();
  const [audience, setAudience] = useState<'school' | 'class' | 'section'>('school');
  const [classId, setClassId] = useState('');
  const sectionParams = useMemo(() => classId ? { classId } : undefined, [classId]);
  const sections = useGetSections(sectionParams, { query: { enabled: audience === 'section' && !!classId, queryKey: getGetSectionsQueryKey(sectionParams) } });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<SchoolHighlightInput['category']>('school_news');
  const [audienceId, setAudienceId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoAlt, setPhotoAlt] = useState('');
  const [consent, setConsent] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const onPhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLocalError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setLocalError('Choose a JPEG, PNG, or WebP photo.'); return; }
    if (file.size > 15 * 1024 * 1024) { setLocalError('Choose a photo smaller than 15 MB.'); return; }
    setPhotoBusy(true);
    try { setPhotoDataUrl(await imageToCompressedDataUrl(file)); }
    catch (error) { setLocalError(errorMessage(error)); setPhotoDataUrl(''); }
    finally { setPhotoBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError('');
    if (audience !== 'school' && !audienceId) { setLocalError(`Choose a ${audience} for this highlight.`); return; }
    if (photoDataUrl && (!consent || photoAlt.trim().length < 3)) { setLocalError('Confirm photo permission and add descriptive alt text.'); return; }
    const selectedClass = (classes.data?.items ?? []).find(item => item.id === audienceId);
    const selectedSection = (sections.data?.items ?? []).find(item => item.id === audienceId);
    const data: SchoolHighlightInput = {
      title: title.trim(),
      body: body.trim(),
      category,
      audience,
      ...(audience !== 'school' ? { audienceId } : {}),
      ...(expiresAt ? { expiresAt: new Date(`${expiresAt}T23:59:00`).toISOString() } : {}),
      ...(photoDataUrl ? { photoDataUrl, photoAlt: photoAlt.trim(), photoConsentConfirmed: true } : {}),
      ...(audience === 'class' && selectedClass ? { audienceId: selectedClass.id } : {}),
      ...(audience === 'section' && selectedSection ? { audienceId: selectedSection.id } : {}),
    };
    create.mutate({ data }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetSchoolHighlightsQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetSchoolHighlightsQueryKey({ limit: 3 }) });
        onClose();
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-[hsl(var(--foreground)/.48)] p-0 backdrop-blur-sm sm:place-items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="publish-highlight-title" className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5 shadow-xl sm:rounded-[24px] sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><p className="m-0 text-[10px] font-extrabold uppercase tracking-[.16em] text-[hsl(var(--primary))]">School noticeboard</p><h2 id="publish-highlight-title" className="display m-0 mt-1 text-2xl font-extrabold tracking-tight">Share a highlight</h2><p className="m-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">A school-controlled update for the right audience.</p></div>
          <button type="button" onClick={onClose} aria-label="Close publish form" className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--secondary))]"><X size={17}/></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-bold">Headline<input className="field mt-1.5" minLength={3} maxLength={160} required value={title} onChange={event => setTitle(event.target.value)} placeholder="What’s worth celebrating?" /></label>
          <label className="block text-xs font-bold">Story<textarea className="field mt-1.5 min-h-32 resize-y" maxLength={3000} required value={body} onChange={event => setBody(event.target.value)} placeholder="Share the details with your school community." /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-bold">Highlight type<select className="field mt-1.5" value={category} onChange={event => setCategory(event.target.value as SchoolHighlightInput['category'])}><option value="school_news">School news</option><option value="achievement">Achievement</option><option value="event">School event</option></select></label>
            <label className="block text-xs font-bold">Visible to<select className="field mt-1.5" value={audience} onChange={event => { const next = event.target.value as typeof audience; setAudience(next); setAudienceId(''); }}><option value="school">Whole school</option><option value="class">A class</option><option value="section">A section</option></select></label>
          </div>
          {audience !== 'school' && <div className="grid gap-3 sm:grid-cols-2">
            {audience === 'section' && <label className="block text-xs font-bold">Class<select className="field mt-1.5" value={classId} onChange={event => { setClassId(event.target.value); setAudienceId(''); }} required><option value="">Select class</option>{(classes.data?.items ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{classes.isError && <span className="mt-1 block text-[10px] text-[hsl(var(--destructive))]">Classes unavailable. Retry from Classes.</span>}</label>}
            <label className="block text-xs font-bold">{audience === 'class' ? 'Class' : 'Section'}<select className="field mt-1.5" value={audienceId} onChange={event => setAudienceId(event.target.value)} required disabled={audience === 'section' && (!classId || sections.isLoading)}><option value="">Select {audience}</option>{audience === 'class' ? (classes.data?.items ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>) : (sections.data?.items ?? []).map(item => <option key={item.id} value={item.id}>{item.className} · {item.name}</option>)}</select>{audience === 'section' && sections.isError && <span className="mt-1 block text-[10px] text-[hsl(var(--destructive))]">Sections could not load. Change the class and try again.</span>}</label>
          </div>}
          <label className="block text-xs font-bold">Keep visible until <span className="font-normal text-[hsl(var(--muted-foreground))]">(optional)</span><input type="date" className="field mt-1.5" min={new Date().toISOString().slice(0, 10)} value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
          <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-4">
            {!photoDataUrl ? <label className="flex cursor-pointer items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><ImagePlus size={18}/></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold">Add a photo <span className="font-normal text-[hsl(var(--muted-foreground))]">· optional</span></span><span className="mt-1 block text-[10px] text-[hsl(var(--muted-foreground))]">Compressed securely before upload. Under 550 KiB.</span></span><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPhotoChange} disabled={photoBusy}/></label> : <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-xs font-bold">Photo ready to attach</span><button type="button" className="btn btn-muted min-h-8 px-3 text-xs" onClick={() => { setPhotoDataUrl(''); setPhotoAlt(''); setConsent(false); }}>Remove</button></div><img className="max-h-52 w-full rounded-xl object-cover" src={photoDataUrl} alt="Selected photo preview"/><label className="block text-xs font-bold">Describe the photo for accessibility<textarea className="field mt-1.5 min-h-20" required minLength={3} maxLength={180} value={photoAlt} onChange={event => setPhotoAlt(event.target.value)} placeholder="Describe the people, place, or moment shown." /></label><label className="flex items-start gap-2 text-[11px] leading-relaxed"><input className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)}/><span>I confirm the school has permission to share this photo with the selected audience.</span></label></div>}
            {photoBusy && <p className="m-0 mt-2 flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]"><LoaderCircle size={13} className="animate-spin"/>Preparing a private school photo…</p>}
          </div>
          {(localError || create.isError) && <p role="alert" className="m-0 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-xs text-[hsl(var(--destructive))]">{localError || errorMessage(create.error)}</p>}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end"><button type="button" className="btn btn-muted" onClick={onClose}>Cancel</button><button type="submit" disabled={create.isPending || photoBusy} className="btn btn-primary">{create.isPending ? <LoaderCircle size={16} className="animate-spin"/> : <Plus size={16}/>}Publish highlight</button></div>
        </form>
      </section>
    </div>
  );
}

export function HighlightsPage({ roles }: { roles: string[] }) {
  const canPublish = roles.some(role => ['super_admin', 'org_admin', 'campus_admin'].includes(role));
  const [compose, setCompose] = useState(false);
  const highlights = useGetSchoolHighlights({ limit: 30 });
  const items = highlights.data?.items ?? [];
  return <main className="mx-auto max-w-5xl space-y-6" data-testid="highlights-page">
    <header className="relative overflow-hidden rounded-[24px] bg-[hsl(var(--brand-forest))] px-5 py-7 text-[hsl(var(--brand-inverse))] sm:px-8 sm:py-9">
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-20 h-60 w-60 rounded-full border border-white/10"/><div aria-hidden="true" className="pointer-events-none absolute -right-1 -top-12 h-44 w-44 rounded-full border border-white/10"/>
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-xl"><p className="m-0 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.18em] text-[hsl(var(--classroom-ready))]"><Sparkles size={14}/>The school noticeboard</p><h1 className="display m-0 mt-3 text-[32px] font-extrabold leading-tight tracking-[-.04em] sm:text-[42px]">Good things happen<br className="hidden sm:block"/> here every day.</h1><p className="m-0 mt-3 max-w-md text-sm leading-relaxed text-white/70">Milestones, moments and school news, shared by your school for your school.</p></div>{canPublish && <button className="btn min-h-11 self-start bg-[hsl(var(--brand-accent))] text-[hsl(var(--brand-ink))] sm:self-auto" onClick={() => setCompose(true)}><Plus size={17}/>Share a highlight</button>}</div>
      {!canPublish && <p className="relative mb-0 mt-5 flex items-center gap-2 text-[10px] text-white/60"><ShieldCheck size={14}/>Highlights are shared by school administrators.</p>}
    </header>
    <section aria-labelledby="recent-highlights-title">
      <div className="mb-3 flex items-end justify-between gap-3"><div><p className="m-0 text-[9px] font-extrabold uppercase tracking-[.18em] text-[hsl(var(--primary))]">From your school</p><h2 id="recent-highlights-title" className="display m-0 mt-1 text-xl font-extrabold tracking-tight">Recent highlights</h2></div><span className="text-[10px] text-[hsl(var(--muted-foreground))]">{highlights.data ? `${highlights.data.total} shared` : 'School updates'}</span></div>
      {highlights.isLoading ? <div className="space-y-3" aria-label="Loading school highlights"><div className="skeleton h-36"/><div className="skeleton h-36"/></div>
        : highlights.isError ? <div role="alert" className="surface p-5 text-center"><p className="m-0 text-sm font-bold">Highlights could not be loaded.</p><p className="m-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">{errorMessage(highlights.error)}</p><button className="btn btn-muted mt-3" onClick={() => highlights.refetch()}>Try again</button></div>
          : items.length ? <div className="grid gap-3">{items.map(item => <HighlightCard key={item.id} highlight={item}/>)}</div>
            : <div className="surface flex flex-col items-center px-5 py-10 text-center"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Newspaper size={21}/></div><h3 className="display mb-0 mt-4 text-lg font-extrabold">A little quiet, for now.</h3><p className="mb-0 mt-1 max-w-sm text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{canPublish ? 'Share the first update your school community will see here.' : 'School news, events and achievements will appear here when shared by an administrator.'}</p>{canPublish && <button className="btn btn-primary mt-4" onClick={() => setCompose(true)}><Plus size={15}/>Share the first highlight</button>}</div>}
    </section>
    {compose && <CreateHighlightForm onClose={() => setCompose(false)}/>}
  </main>;
}

export function LatestSchoolHighlights() {
  const highlights = useGetSchoolHighlights({ limit: 3 });
  const items = highlights.data?.items ?? [];
  return <section aria-labelledby="latest-school-highlights" data-testid="dashboard-school-highlights">
    <div className="mb-3 flex items-end justify-between gap-3"><div><p className="m-0 text-[9px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Around school</p><h2 id="latest-school-highlights" className="display m-0 mt-1 text-[17px] font-extrabold">Latest highlights</h2></div><Link href="/highlights" className="text-[10px] font-bold text-[hsl(var(--primary))]">All highlights <span aria-hidden="true">→</span></Link></div>
    {highlights.isLoading ? <div className="space-y-2" aria-label="Loading school highlights"><div className="skeleton h-24"/><div className="skeleton h-24"/></div>
      : highlights.isError ? <div role="alert" className="surface p-4 text-[10px]"><p className="m-0">School highlights are unavailable.</p><button type="button" className="mt-2 font-bold text-[hsl(var(--primary))] underline" onClick={() => highlights.refetch()}>Try again</button></div>
        : items.length ? <div className="grid gap-2">{items.map(item => <HighlightCard key={item.id} highlight={item} compact/>)}</div>
          : <div className="surface rounded-xl border-dashed p-4 text-center text-[10px] text-[hsl(var(--muted-foreground))]">Your school’s latest news and moments will show up here.</div>}
  </section>;
}
