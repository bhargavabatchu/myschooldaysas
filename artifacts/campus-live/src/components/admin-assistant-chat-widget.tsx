import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAskAdminAssistant } from '@workspace/api-client-react';
import type { AdminAssistantAnswer } from '@workspace/api-client-react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  GraduationCap,
  Landmark,
  LoaderCircle,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

type AssistantTurn = {
  id: number;
  question: string;
  answer?: AdminAssistantAnswer;
  error?: boolean;
};

type AdminAssistantChatWidgetProps = {
  /** Set true while the legacy assistant route is active to open the widget. */
  openOnMount?: boolean;
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

function AssistantAnswer({
  answer,
  onAsk,
  disabled,
}: {
  answer: AdminAssistantAnswer;
  onAsk: (question: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/.16)] bg-[hsl(var(--primary)/.07)] px-2.5 py-1 text-[10px] font-bold text-[hsl(var(--primary))]">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
          {topicLabels[answer.topic]}
        </span>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">From school records</span>
      </div>

      <p className="m-0 whitespace-pre-wrap break-words text-[13px] leading-[1.65] text-[hsl(var(--foreground))]">
        {answer.answer}
      </p>

      {answer.facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-2">
          {answer.facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className="min-w-0 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.72)] px-3 py-2.5">
              <dt className="text-[9px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{fact.label}</dt>
              <dd className="mb-0 mt-1 break-words text-[13px] font-bold leading-snug text-[hsl(var(--foreground))]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {answer.students.length > 0 && (
        <section aria-label="Student matches" className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
          <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] px-3 py-2.5">
            <h3 className="m-0 text-[11px] font-bold text-[hsl(var(--foreground))]">Student matches</h3>
            <span className="text-[9px] font-medium text-[hsl(var(--muted-foreground))]">Limited results</span>
          </div>
          <ul className="m-0 max-h-40 list-none divide-y divide-[hsl(var(--border))] overflow-y-auto p-0">
            {answer.students.map((student, index) => (
              <li key={`${student.admissionNo}-${index}`} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="m-0 truncate text-xs font-bold text-[hsl(var(--foreground))]">{student.name}</p>
                  <p className="mb-0 mt-1 truncate text-[10px] text-[hsl(var(--muted-foreground))]">
                    {student.admissionNo} <span className="px-1 text-[hsl(var(--accent))]">/</span> {student.className} · {student.sectionName}
                  </p>
                </div>
                {student.outstandingPaise !== null && (
                  <div className="shrink-0 text-right">
                    <span className="block text-[8px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">Outstanding</span>
                    <span className="text-[10px] font-bold tabular-nums text-[hsl(var(--foreground))]">{formatPaise(student.outstandingPaise)}</span>
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
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-[11px] font-bold text-[hsl(var(--primary))] transition-colors hover:border-[hsl(var(--primary)/.35)] hover:bg-[hsl(var(--primary)/.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
        >
          <ArrowUpRight size={13} />
          {answer.sourceLabel}
        </a>
      )}

      {answer.suggestedQuestions.length > 0 && (
        <div className="border-t border-[hsl(var(--border))] pt-3">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">A useful next question</p>
          <div className="flex flex-col items-start gap-1.5">
            {answer.suggestedQuestions.map((suggestion, index) => (
              <button
                key={`${suggestion}-${index}`}
                type="button"
                disabled={disabled}
                onClick={() => onAsk(suggestion)}
                className="max-w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold leading-4 text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)/.06)] disabled:cursor-not-allowed disabled:opacity-50"
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

export function AdminAssistantChatWidget({ openOnMount = false }: AdminAssistantChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const nextId = useRef(1);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (openOnMount) {
      setIsOpen(true);
      setIsMinimized(false);
    }
  }, [openOnMount]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isOpen, isMinimized, turns]);

  const updateLatestPending = (submittedQuestion: string, update: Partial<AssistantTurn>) => {
    setTurns(current => {
      const pendingIndex = [...current].map(turn => turn.question).lastIndexOf(submittedQuestion);
      if (pendingIndex < 0) return current;
      return current.map((turn, index) => index === pendingIndex ? { ...turn, ...update } : turn);
    });
  };

  const ask = useAskAdminAssistant({
    mutation: {
      onSuccess: (answer, variables) => updateLatestPending(variables.data.question, { answer, error: false }),
      onError: (_error, variables) => updateLatestPending(variables.data.question, { error: true }),
    },
  });

  const submitQuestion = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || ask.isPending || trimmed.length > 300) return;
    const id = nextId.current;
    nextId.current += 1;
    setTurns(current => [...current, { id, question: trimmed }]);
    setQuestion('');
    ask.mutate({ data: { question: trimmed } });
  };

  const retryQuestion = (turn: AssistantTurn) => {
    if (ask.isPending) return;
    setTurns(current => current.map(item => item.id === turn.id ? { ...item, error: false, answer: undefined } : item));
    ask.mutate({ data: { question: turn.question } });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuestion(question);
  };

  const openWidget = () => {
    setIsOpen(true);
    setIsMinimized(false);
    window.setTimeout(() => questionInputRef.current?.focus(), 180);
  };

  const closeWidget = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  return (
    <div className="admin-assistant-widget fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen && (
        <section
          aria-label="Campus Live assistant"
          className={`admin-assistant-panel flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_24px_70px_hsl(var(--brand-ink)/.22),0_4px_14px_hsl(var(--brand-ink)/.08)] ${isMinimized ? 'h-auto' : 'h-[min(680px,calc(100dvh-7rem))] sm:h-[min(680px,calc(100dvh-8rem))]'}`}
        >
          <header className="relative flex shrink-0 items-center gap-3 bg-[hsl(var(--brand-forest))] px-4 py-3.5 text-[hsl(var(--brand-inverse))]">
            <div aria-hidden="true" className="absolute right-16 top-[-42px] h-28 w-28 rounded-full border border-white/10" />
            <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10">
              <GraduationCap size={20} strokeWidth={1.7} />
            </div>
            <div className="relative min-w-0 flex-1">
              <p className="m-0 text-[13px] font-bold leading-tight">Campus Live assistant</p>
              <p className="mb-0 mt-1 flex items-center gap-1.5 text-[10px] text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-accent))]" />
                School records · read-only
              </p>
            </div>
            <button
              type="button"
              aria-label={isMinimized ? 'Expand assistant' : 'Minimize assistant'}
              title={isMinimized ? 'Expand' : 'Minimize'}
              onClick={() => setIsMinimized(value => !value)}
              className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {isMinimized ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </button>
            <button
              type="button"
              aria-label="Close assistant"
              title="Close"
              onClick={closeWidget}
              className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X size={17} />
            </button>
          </header>

          {!isMinimized && (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.76)] px-4 py-2.5 text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">
                <ShieldCheck size={13} className="shrink-0 text-[hsl(var(--primary))]" />
                Answers use available school records. Nothing is changed or saved.
              </div>

              <div
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3.5 py-4 sm:px-4"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {turns.length === 0 ? (
                  <div className="animate-[arrive_.3s_ease_both]">
                    <div className="mb-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.62)] p-4">
                      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-[hsl(var(--primary))]">
                        <Sparkles size={13} /> Your school, clearly
                      </div>
                      <p className="m-0 text-[13px] leading-5 text-[hsl(var(--foreground))]">
                        Ask about fees, student records or attendance. I’ll point you to the records behind the answer.
                      </p>
                    </div>
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-bold text-[hsl(var(--muted-foreground))]">
                      <MessageCircle size={13} /> Try a question
                    </div>
                    <div className="space-y-2">
                      {starterQuestions.map(({ text, icon: Icon }) => (
                        <button
                          key={text}
                          type="button"
                          disabled={ask.isPending}
                          onClick={() => submitQuestion(text)}
                          className="group flex min-h-12 w-full items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5 text-left text-[11px] font-semibold leading-4 text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--primary)/.3)] hover:bg-[hsl(var(--primary)/.035)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[hsl(var(--accent)/.18)] text-[hsl(var(--primary))]">
                            <Icon size={14} />
                          </span>
                          <span className="flex-1">{text}</span>
                          <ArrowUpRight size={13} className="shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </button>
                      ))}
                    </div>
                    <p className="mb-0 mt-4 flex items-center gap-1.5 text-[9px] text-[hsl(var(--muted-foreground))]">
                      <Clock3 size={11} /> This conversation stays only in this page.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {turns.map(turn => (
                      <article key={turn.id} className="animate-[arrive_.24s_ease_both]">
                        <div className="ml-7 rounded-2xl rounded-tr-md bg-[hsl(var(--primary))] px-3.5 py-2.5 text-[12px] leading-5 text-[hsl(var(--primary-foreground))]">
                          <div className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-white/65">
                            <ArrowDownLeft size={11} /> Your question
                          </div>
                          <p className="m-0 whitespace-pre-wrap break-words">{turn.question}</p>
                        </div>

                        <div className="mt-2.5 flex items-start gap-2.5">
                          <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--primary))]">
                            <GraduationCap size={15} />
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            {turn.answer ? (
                              <AssistantAnswer answer={turn.answer} onAsk={submitQuestion} disabled={ask.isPending} />
                            ) : turn.error ? (
                              <div role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.22)] bg-[hsl(var(--destructive)/.05)] p-3">
                                <div className="flex items-start gap-2">
                                  <CircleAlert size={15} className="mt-0.5 shrink-0 text-[hsl(var(--destructive))]" />
                                  <div className="min-w-0">
                                    <p className="m-0 text-xs font-bold text-[hsl(var(--foreground))]">That answer didn’t come through.</p>
                                    <p className="mb-0 mt-1 text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Your question is still here. Please try again.</p>
                                    <button
                                      type="button"
                                      onClick={() => retryQuestion(turn)}
                                      disabled={ask.isPending}
                                      className="mt-2 text-[10px] font-bold text-[hsl(var(--primary))] underline decoration-[hsl(var(--primary)/.3)] underline-offset-4 disabled:opacity-50"
                                    >
                                      Try again
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div role="status" aria-live="polite" className="flex items-center gap-2.5 py-1">
                                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]">
                                  <LoaderCircle size={15} className="animate-spin" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="skeleton h-2.5 w-24" />
                                  <div className="skeleton mt-2 h-2.5 w-[76%]" />
                                  <span className="sr-only">Checking school records</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                    <div ref={conversationEndRef} />
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--background)/.78)] px-3.5 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-3">
                <form onSubmit={handleSubmit}>
                  <label htmlFor="campus-live-assistant-question" className="sr-only">Ask Campus Live a question</label>
                  <div className="flex items-end gap-2 rounded-2xl border border-[hsl(var(--input))] bg-[hsl(var(--card))] p-1.5 shadow-[0_4px_16px_hsl(var(--brand-ink)/.045)] transition-colors focus-within:border-[hsl(var(--primary)/.5)] focus-within:ring-2 focus-within:ring-[hsl(var(--primary)/.08)]">
                    <textarea
                      ref={questionInputRef}
                      id="campus-live-assistant-question"
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
                      placeholder="Ask about fees, students or attendance"
                      className="max-h-24 min-h-10 flex-1 resize-y border-0 bg-transparent px-2.5 py-2.5 text-[12px] leading-5 text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:ring-0"
                    />
                    <button
                      type="submit"
                      aria-label="Send question"
                      disabled={!question.trim() || ask.isPending || question.trim().length > 300}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {ask.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between px-1 text-[9px] text-[hsl(var(--muted-foreground))]">
                    <span className="inline-flex items-center gap-1"><Check size={10} /> Read-only answers</span>
                    <span>{question.length}/300</span>
                  </div>
                </form>
              </div>
            </>
          )}
        </section>
      )}

      {isOpen ? (
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className={`admin-assistant-launcher group inline-flex h-12 items-center gap-2.5 rounded-full border border-[hsl(var(--primary)/.2)] bg-[hsl(var(--card))] px-3.5 text-[11px] font-bold text-[hsl(var(--foreground))] shadow-[0_8px_24px_hsl(var(--brand-ink)/.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_hsl(var(--brand-ink)/.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))] ${isMinimized ? '' : 'hidden'}`}
          aria-label="Reopen minimized assistant"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[hsl(var(--brand-forest))] text-[hsl(var(--brand-inverse))]">
            <GraduationCap size={16} />
          </span>
          Assistant minimized
          <ChevronUp size={14} className="ml-1 text-[hsl(var(--muted-foreground))]" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openWidget}
          className="admin-assistant-launcher group inline-flex h-14 items-center gap-3 rounded-full border border-[hsl(var(--primary)/.24)] bg-[hsl(var(--brand-forest))] pl-2 pr-5 text-[12px] font-bold text-[hsl(var(--brand-inverse))] shadow-[0_10px_28px_hsl(var(--brand-ink)/.23)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_hsl(var(--brand-ink)/.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
          aria-label="Open Campus Live assistant"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10 transition-transform duration-200 group-hover:scale-105">
            <MessageCircle size={19} />
          </span>
          Ask Campus Live
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--brand-accent))]" />
        </button>
      )}
    </div>
  );
}

export default AdminAssistantChatWidget;
