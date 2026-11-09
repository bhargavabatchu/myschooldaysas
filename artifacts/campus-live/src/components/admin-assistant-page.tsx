import { useState, type FormEvent } from 'react';
import { useAskAdminAssistant } from '@workspace/api-client-react';
import type { AdminAssistantAnswer } from '@workspace/api-client-react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  Clock3,
  GraduationCap,
  Landmark,
  LoaderCircle,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

type AssistantTurn = {
  id: number;
  question: string;
  answer?: AdminAssistantAnswer;
  error?: boolean;
};

const starterQuestions = [
  { text: 'How much fee is still outstanding?', icon: Landmark },
  { text: 'How many active students are in each class?', icon: Users },
  { text: 'What can I ask Campus Live?', icon: BookOpen },
];

const topicLabels: Record<AdminAssistantAnswer['topic'], string> = {
  fees: 'Fees',
  students: 'Students',
  attendance: 'Attendance',
  help: 'Help',
};

function formatPaise(amount: number | null) {
  if (amount === null) return 'Not provided';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

function AssistantAnswer({ answer, onAsk }: { answer: AdminAssistantAnswer; onAsk: (question: string) => void }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/.16)] bg-[hsl(var(--primary)/.07)] px-2.5 py-1 text-[11px] font-bold text-[hsl(var(--primary))]">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
          {topicLabels[answer.topic]}
        </span>
      </div>

      <p className="m-0 whitespace-pre-wrap text-[14px] leading-7 text-[hsl(var(--foreground))] sm:text-[15px]">
        {answer.answer}
      </p>

      {answer.facts.length > 0 && (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {answer.facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.72)] px-3.5 py-3">
              <dt className="text-[10px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">{fact.label}</dt>
              <dd className="mb-0 mt-1.5 break-words text-[15px] font-bold leading-snug text-[hsl(var(--foreground))]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {answer.students.length > 0 && (
        <section aria-label="Student matches" className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
          <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] px-3.5 py-3">
            <h3 className="m-0 text-xs font-bold text-[hsl(var(--foreground))]">Student matches</h3>
            <span className="text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Limited results</span>
          </div>
          <ul className="m-0 list-none divide-y divide-[hsl(var(--border))] p-0">
            {answer.students.map((student, index) => (
              <li key={`${student.admissionNo}-${index}`} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-bold text-[hsl(var(--foreground))]">{student.name}</p>
                  <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    {student.admissionNo} <span className="px-1 text-[hsl(var(--accent))]">/</span> {student.className} · {student.sectionName}
                  </p>
                </div>
                {student.outstandingPaise !== null && (
                  <div className="shrink-0 sm:text-right">
                    <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Outstanding</span>
                    <span className="text-xs font-bold tabular-nums text-[hsl(var(--foreground))]">{formatPaise(student.outstandingPaise)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {answer.sourceLabel && answer.sourceHref && (
        <a
          href={answer.sourceHref}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs font-bold text-[hsl(var(--primary))] transition hover:border-[hsl(var(--primary)/.35)] hover:bg-[hsl(var(--primary)/.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
        >
          <ArrowUpRight size={14} />
          {answer.sourceLabel}
        </a>
      )}

      {answer.suggestedQuestions.length > 0 && (
        <div className="border-t border-[hsl(var(--border))] pt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">You could also ask</p>
          <div className="flex flex-wrap gap-2">
            {answer.suggestedQuestions.map((suggestion, index) => (
              <button
                key={`${suggestion}-${index}`}
                type="button"
                onClick={() => onAsk(suggestion)}
                className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background)/.65)] px-3 py-1.5 text-left text-[11px] font-semibold leading-4 text-[hsl(var(--primary))] transition hover:border-[hsl(var(--primary)/.3)] hover:bg-[hsl(var(--primary)/.05)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminAssistantPage() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [nextId, setNextId] = useState(1);

  const ask = useAskAdminAssistant({
    mutation: {
      onSuccess: (answer, variables) => {
        setTurns(current => {
          const pendingIndex = [...current].map(turn => turn.question).lastIndexOf(variables.data.question);
          if (pendingIndex < 0) return current;
          return current.map((turn, index) => index === pendingIndex ? { ...turn, answer } : turn);
        });
      },
      onError: (_error, variables) => {
        setTurns(current => {
          const pendingIndex = [...current].map(turn => turn.question).lastIndexOf(variables.data.question);
          if (pendingIndex < 0) return current;
          return current.map((turn, index) => index === pendingIndex ? { ...turn, error: true } : turn);
        });
      },
    },
  });

  const submitQuestion = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || ask.isPending || trimmed.length > 300) return;
    setTurns(current => [...current, { id: nextId, question: trimmed }]);
    setNextId(current => current + 1);
    setQuestion('');
    ask.mutate({ data: { question: trimmed } });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuestion(question);
  };

  return (
    <main className="mx-auto w-full max-w-[1120px]">
      <header className="mb-6 border-b border-[hsl(var(--border))] pb-5 sm:mb-8 sm:pb-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[hsl(var(--primary)/.09)]"><Sparkles size={13} /></span>
              Campus Live · Administrator desk
            </div>
            <h1 className="display m-0 text-[30px] font-extrabold leading-tight tracking-[-.045em] text-[hsl(var(--foreground))] sm:text-[38px]">Ask your school, clearly.</h1>
            <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              A read-only assistant for the everyday questions behind student, fee and attendance records.
            </p>
          </div>
          <div className="flex w-fit items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] px-3 py-2 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
            <ShieldCheck size={14} className="text-[hsl(var(--primary))]" />
            Administrator access
          </div>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8">
        <section className="min-w-0" aria-label="Assistant conversation">
          {turns.length === 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_12px_36px_hsl(var(--brand-ink)/.035)]">
              <div className="relative overflow-hidden bg-[hsl(var(--brand-forest))] px-5 py-6 text-[hsl(var(--brand-inverse))] sm:px-8 sm:py-8">
                <div aria-hidden="true" className="absolute -right-10 -top-16 h-56 w-56 rounded-full border border-white/10" />
                <div aria-hidden="true" className="absolute -right-2 -top-8 h-40 w-40 rounded-full border border-white/10" />
                <div className="relative flex items-start gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10"><GraduationCap size={22} strokeWidth={1.7} /></div>
                  <div>
                    <p className="m-0 text-[10px] font-bold uppercase tracking-[.17em] text-white/65">A steady hand for school operations</p>
                    <h2 className="display mb-0 mt-2 max-w-lg text-[20px] font-bold leading-snug tracking-[-.02em] sm:text-[24px]">Start with a question. Get a grounded answer.</h2>
                    <p className="mb-0 mt-2 max-w-lg text-xs leading-5 text-white/70">Campus Live checks available school records and points you to the right place to continue.</p>
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-bold text-[hsl(var(--muted-foreground))]">
                  <MessageSquareText size={14} /> Try a question
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {starterQuestions.map(({ text, icon: Icon }) => (
                    <button
                      key={text}
                      type="button"
                      disabled={ask.isPending}
                      onClick={() => submitQuestion(text)}
                      className="group flex min-h-[76px] items-start gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.55)] p-3 text-left text-xs font-semibold leading-5 text-[hsl(var(--foreground))] transition hover:border-[hsl(var(--primary)/.3)] hover:bg-[hsl(var(--primary)/.045)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Icon size={15} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" />
                      <span>{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {turns.map(turn => (
                <article key={turn.id} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_8px_28px_hsl(var(--brand-ink)/.03)]">
                  <div className="flex gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.36)] px-4 py-4 sm:px-5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><ArrowDownLeft size={15} /></div>
                    <div className="min-w-0">
                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Your question</span>
                      <p className="m-0 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[hsl(var(--foreground))]">{turn.question}</p>
                    </div>
                  </div>
                  <div className="px-4 py-4 sm:px-5 sm:py-5">
                    {turn.answer ? (
                      <AssistantAnswer answer={turn.answer} onAsk={submitQuestion} />
                    ) : turn.error ? (
                      <div role="alert" className="flex items-start gap-3 rounded-xl border border-[hsl(var(--destructive)/.22)] bg-[hsl(var(--destructive)/.05)] p-3.5">
                        <CircleAlert size={17} className="mt-0.5 shrink-0 text-[hsl(var(--destructive))]" />
                        <div className="min-w-0 flex-1">
                          <p className="m-0 text-sm font-bold text-[hsl(var(--foreground))]">That answer didn’t come through.</p>
                          <p className="mb-0 mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Your question is still here. Please try again.</p>
                          <button type="button" onClick={() => submitQuestion(turn.question)} disabled={ask.isPending} className="mt-2 text-xs font-bold text-[hsl(var(--primary))] underline decoration-[hsl(var(--primary)/.3)] underline-offset-4 disabled:opacity-50">Try again</button>
                        </div>
                      </div>
                    ) : (
                      <div role="status" aria-live="polite" className="flex items-center gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]"><LoaderCircle size={16} className="animate-spin" /></div>
                        <div className="flex-1">
                          <div className="skeleton h-3 w-28" />
                          <div className="skeleton mt-2 h-3 w-[78%]" />
                        </div>
                        <span className="sr-only">Checking school records</span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {turns.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[10px] text-[hsl(var(--muted-foreground))]">
              <span className="inline-flex items-center gap-1.5"><Clock3 size={12} /> This conversation lives only in this page.</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} /> Read-only · no changes to records</span>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--accent)/.16)] text-[hsl(var(--foreground))]"><BookOpen size={15} /></div>
              <h2 className="m-0 text-sm font-bold text-[hsl(var(--foreground))]">A useful place to start</h2>
            </div>
            <p className="mb-0 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Ask about school fees, student records or attendance. If a question is outside the assistant’s scope, it will help you find a better next step.</p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.42)] p-4 sm:p-5">
            <h2 className="m-0 text-[10px] font-bold uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Designed for trust</h2>
            <ul className="mb-0 mt-3 space-y-3 pl-0 text-xs leading-5 text-[hsl(var(--foreground))]">
              <li className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" /><span>Answers are based on available school records.</span></li>
              <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" /><span>This assistant cannot edit or submit records.</span></li>
              <li className="flex items-start gap-2"><Clock3 size={14} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" /><span>Questions are not saved as chat history.</span></li>
            </ul>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-[hsl(var(--border))] bg-[hsl(var(--background)/.96)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[820px]">
          <label htmlFor="admin-assistant-question" className="sr-only">Ask Campus Live a question</label>
          <div className="flex items-end gap-2 rounded-2xl border border-[hsl(var(--input))] bg-[hsl(var(--card))] p-2 shadow-[0_8px_30px_hsl(var(--brand-ink)/.07)] focus-within:border-[hsl(var(--primary)/.55)] focus-within:ring-2 focus-within:ring-[hsl(var(--primary)/.10)]">
            <textarea
              id="admin-assistant-question"
              rows={1}
              maxLength={300}
              value={question}
              onChange={event => setQuestion(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitQuestion(question);
                }
              }}
              placeholder="Ask about fees, students or attendance…"
              className="max-h-32 min-h-11 flex-1 resize-y border-0 bg-transparent px-2.5 py-3 text-sm leading-5 text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:ring-0"
            />
            <button
              type="submit"
              disabled={!question.trim() || ask.isPending || question.trim().length > 300}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {ask.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
              <span className="hidden sm:inline">{ask.isPending ? 'Checking' : 'Ask'}</span>
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-[hsl(var(--muted-foreground))]">
            <span>Read-only answers · no record changes</span>
            <span>{question.length}/300</span>
          </div>
          {ask.isError && turns.length === 0 && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-[hsl(var(--destructive)/.2)] bg-[hsl(var(--destructive)/.05)] px-3 py-2.5 text-xs text-[hsl(var(--foreground))]">
              <CircleAlert size={15} className="mt-0.5 shrink-0 text-[hsl(var(--destructive))]" />
              We couldn’t reach Campus Live. Please check your connection and try again.
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

export default AdminAssistantPage;
