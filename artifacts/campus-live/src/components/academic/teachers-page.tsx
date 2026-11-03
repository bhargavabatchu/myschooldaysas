import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  Mail,
  Plus,
  UsersRound,
} from "lucide-react";
import {
  getGetAcademicTeachersQueryKey,
  useCreateTeacherAccount,
  useGetAcademicTeachers,
} from "@workspace/api-client-react";
import type { CreatedTeacherAccount } from "@workspace/api-client-react";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Please try again.";

export function TeachersPage() {
  const queryClient = useQueryClient();
  const teachers = useGetAcademicTeachers();
  const [credentials, setCredentials] = useState<CreatedTeacherAccount | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const createTeacher = useCreateTeacherAccount({
    mutation: {
      onSuccess: async (account) => {
        setCredentials(account);
        setShowPassword(false);
        setCopied(false);
        setCopyError("");
        await queryClient.invalidateQueries({
          queryKey: getGetAcademicTeachersQueryKey(),
        });
      },
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    createTeacher.mutate(
      {
        data: {
          name: String(data.get("name")).trim(),
          email: String(data.get("email")).trim(),
        },
      },
      { onSuccess: () => form.reset() },
    );
  }

  async function copyPassword() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.temporaryPassword);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopyError("Copy is unavailable here. Show the password and copy it manually.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
            Administration
          </p>
          <h1 className="display m-0 text-3xl font-extrabold">Teachers</h1>
          <p className="mb-0 mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
            Create teacher logins, then assign their sections and subjects.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/learning" className="btn btn-muted min-h-10">
            Subjects &amp; teachers <ArrowRight size={15} />
          </Link>
          <Link href="/timetable" className="btn btn-primary min-h-10">
            Create timetable <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <section className="surface p-5 md:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
            <Plus size={18} />
          </div>
          <div>
            <h2 className="display m-0 text-lg font-extrabold">Create teacher account</h2>
            <p className="mb-0 mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
              A temporary password will be generated. The teacher must change it at first sign-in; it expires in seven days.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-xs font-bold">
            Teacher name
            <input
              required
              name="name"
              autoComplete="name"
              maxLength={120}
              className="field mt-1.5 min-h-11 text-sm"
              placeholder="Full name"
            />
          </label>
          <label className="text-xs font-bold">
            Email address
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              maxLength={320}
              className="field mt-1.5 min-h-11 text-sm"
              placeholder="teacher@school.edu"
            />
          </label>
          <button
            disabled={createTeacher.isPending}
            className="btn btn-primary min-h-11"
            type="submit"
          >
            <Plus size={15} />
            {createTeacher.isPending ? "Creating…" : "Create account"}
          </button>
        </form>

        {createTeacher.isError && (
          <div role="alert" className="mt-4 rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
            {errorText(createTeacher.error)}
          </div>
        )}
      </section>

      {credentials && (
        <section
          role="status"
          aria-live="polite"
          className="surface border border-[hsl(var(--status-good)/.35)] p-5 md:p-6"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-[hsl(var(--brand-mint-ink))]">
                <Check size={17} />
                <h2 className="display m-0 text-lg font-extrabold">Teacher account created</h2>
              </div>
              <p className="mb-0 mt-2 text-sm">
                Share these sign-in details securely. This temporary password is shown only now and expires in seven days.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-muted min-h-9"
              onClick={() => {
                setCredentials(null);
                setShowPassword(false);
                setCopied(false);
                setCopyError("");
                createTeacher.reset();
              }}
            >
              Dismiss credentials
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[hsl(var(--background))] p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Teacher</p>
              <p className="m-0 break-all text-sm font-semibold">{credentials.name} · {credentials.email}</p>
            </div>
            <div className="rounded-xl bg-[hsl(var(--background))] p-3">
              <label htmlFor="teacher-temporary-password" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Temporary password
              </label>
              <div className="flex gap-2">
                <input
                  id="teacher-temporary-password"
                  readOnly
                  type={showPassword ? "text" : "password"}
                  value={credentials.temporaryPassword}
                  className="field min-h-10 min-w-0 flex-1 font-mono text-sm"
                />
                <button
                  type="button"
                  className="btn btn-muted min-h-10 px-3"
                  aria-label={showPassword ? "Hide temporary password" : "Show temporary password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  className="btn btn-muted min-h-10 px-3"
                  onClick={() => void copyPassword()}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span className="sr-only">{copied ? "Copied" : "Copy password"}</span>
                </button>
              </div>
              {copyError && <p className="mb-0 mt-2 text-xs text-[hsl(var(--destructive))]">{copyError}</p>}
              {copied && <p className="mb-0 mt-2 text-xs text-[hsl(var(--brand-mint-ink))]">Password copied.</p>}
            </div>
          </div>
        </section>
      )}

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
              <UsersRound size={17} />
            </div>
            <div>
              <h2 className="display m-0 text-lg font-extrabold">Teacher accounts</h2>
              <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Active teaching accounts in your school.
              </p>
            </div>
          </div>
          <span className="tag">{teachers.data?.total ?? 0}</span>
        </div>
        {teachers.isLoading ? (
          <div className="space-y-3 p-5"><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
        ) : teachers.isError ? (
          <div role="alert" className="p-5 text-sm text-[hsl(var(--destructive))]">
            Could not load teacher accounts. Refresh the page and try again.
          </div>
        ) : !teachers.data?.items.length ? (
          <div className="p-8 text-center">
            <Mail className="mx-auto mb-2 text-[hsl(var(--primary))]" size={20} />
            <p className="mb-0 text-sm font-semibold">No teacher accounts yet</p>
            <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">Create the first account above.</p>
          </div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            {teachers.data.items.map((teacher) => (
              <div key={teacher.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 text-sm font-semibold">{teacher.name}</p>
                <p className="m-0 break-all text-xs text-[hsl(var(--muted-foreground))]">{teacher.email}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.45)] p-4 text-sm">
        <b>Next: assign classes and subjects.</b>{" "}
        Open <Link href="/learning" className="font-bold text-[hsl(var(--primary))] underline underline-offset-2">Subjects &amp; teachers</Link>, then choose the teacher, section, and subject.
      </aside>
    </main>
  );
}
