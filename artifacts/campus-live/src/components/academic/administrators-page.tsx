import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSchoolAdminAccountsQueryKey,
  useCreateSchoolAdminAccount,
  useGetMe,
  useGetSchoolAdminAccounts,
  useUpdateSchoolAdminAccount,
} from "@workspace/api-client-react";
import type { CreatedSchoolAdminAccount } from "@workspace/api-client-react";
import { Check, Copy, Eye, EyeOff, ShieldCheck, UserRoundMinus, UserRoundPlus } from "lucide-react";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Please try again.";

export function AdministratorsPage() {
  const queryClient = useQueryClient();
  const currentUser = useGetMe();
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);
  const adminAccounts = useGetSchoolAdminAccounts({ includeDisabled, limit: 100, offset: 0 });
  const [credentials, setCredentials] = useState<CreatedSchoolAdminAccount | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const updateAccount = useUpdateSchoolAdminAccount({
    mutation: {
      onSuccess: () => {
        setConfirmingUserId(null);
        void queryClient.invalidateQueries({ queryKey: getGetSchoolAdminAccountsQueryKey() });
      },
    },
  });
  const createAdmin = useCreateSchoolAdminAccount({
    mutation: {
      onSuccess: (account) => {
        setCredentials(account);
        setShowPassword(false);
        setCopied(false);
        setCopyError("");
        void queryClient.invalidateQueries({ queryKey: getGetSchoolAdminAccountsQueryKey() });
      },
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    createAdmin.mutate(
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
    <main className="mx-auto w-full max-w-4xl space-y-5">
      <header>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
          Administration
        </p>
        <h1 className="display m-0 text-3xl font-extrabold">School administrators</h1>
        <p className="mb-0 mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
          Create another administrator account for this school. The new administrator must change the temporary password at first sign-in.
        </p>
      </header>

      <section className="surface p-5 md:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
            <UserRoundPlus size={18} />
          </div>
          <div>
            <h2 className="display m-0 text-lg font-extrabold">Create administrator account</h2>
            <p className="mb-0 mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
              The temporary password expires in seven days and is shown only once.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-xs font-bold">
            Administrator name
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
              placeholder="admin@school.edu"
            />
          </label>
          <button disabled={createAdmin.isPending} className="btn btn-primary min-h-11" type="submit">
            <UserRoundPlus size={15} />
            {createAdmin.isPending ? "Creating…" : "Create account"}
          </button>
        </form>

        {createAdmin.isError && (
          <div role="alert" className="mt-4 rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
            {errorText(createAdmin.error)}
          </div>
        )}
      </section>

      {credentials && (
        <section role="status" aria-live="polite" className="surface border border-[hsl(var(--status-good)/.35)] p-5 md:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-[hsl(var(--brand-mint-ink))]">
                <ShieldCheck size={17} />
                <h2 className="display m-0 text-lg font-extrabold">Administrator account created</h2>
              </div>
              <p className="mb-0 mt-2 text-sm">
                Share these sign-in details securely. The administrator will need to change this temporary password at first sign-in.
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
                createAdmin.reset();
              }}
            >
              Dismiss credentials
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[hsl(var(--background))] p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">School administrator</p>
              <p className="m-0 break-all text-sm font-semibold">{credentials.name} · {credentials.email}</p>
            </div>
            <div className="rounded-xl bg-[hsl(var(--background))] p-3">
              <label htmlFor="admin-temporary-password" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Temporary password
              </label>
              <div className="flex gap-2">
                <input
                  id="admin-temporary-password"
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
                  aria-label="Copy temporary password"
                  onClick={() => void copyPassword()}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              {copyError && <p className="mb-0 mt-2 text-xs text-[hsl(var(--destructive))]">{copyError}</p>}
              {copied && <p className="mb-0 mt-2 text-xs text-[hsl(var(--brand-mint-ink))]">Password copied.</p>}
            </div>
          </div>
        </section>
      )}

      <section className="surface p-5 md:p-6" aria-labelledby="admin-account-list-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-[hsl(var(--primary))]">Access management</p>
            <h2 id="admin-account-list-heading" className="display m-0 text-lg font-extrabold">Administrator accounts</h2>
            <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Deactivating blocks sign-in and revokes sessions while preserving school records. At least one administrator must remain active.
            </p>
          </div>
          <label className="flex min-h-9 items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={includeDisabled}
              onChange={(event) => setIncludeDisabled(event.target.checked)}
            />
            Include deactivated
          </label>
        </div>

        {adminAccounts.isLoading && (
          <p className="mb-0 mt-5 text-sm text-[hsl(var(--muted-foreground))]" role="status">Loading administrator accounts…</p>
        )}
        {adminAccounts.isError && (
          <p className="mb-0 mt-5 text-sm text-[hsl(var(--destructive))]" role="alert">{errorText(adminAccounts.error)}</p>
        )}
        {updateAccount.isError && (
          <p className="mb-0 mt-4 text-sm text-[hsl(var(--destructive))]" role="alert">{errorText(updateAccount.error)}</p>
        )}

        {adminAccounts.data && adminAccounts.data.items.length === 0 && (
          <p className="mb-0 mt-5 rounded-xl bg-[hsl(var(--background))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
            {includeDisabled ? "No administrator accounts found." : "No active administrator accounts found."}
          </p>
        )}
        {!!adminAccounts.data?.items.length && (
          <ul className="mb-0 mt-5 grid list-none gap-2 p-0">
            {adminAccounts.data.items.map((account) => {
              const isSelf = currentUser.data?.id === account.id;
              const isConfirming = confirmingUserId === account.id;
              return (
                <li key={account.id} className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="m-0 truncate text-sm font-bold">{account.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${account.status === "active" ? "bg-[hsl(var(--status-good)/.12)] text-[hsl(var(--brand-mint-ink))]" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"}`}>
                        {account.status === "active" ? "Active" : "Deactivated"}
                      </span>
                      {isSelf && <span className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">You</span>}
                    </div>
                    <p className="mb-0 mt-1 break-all text-xs text-[hsl(var(--muted-foreground))]">{account.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {account.status === "disabled" ? (
                      <button
                        type="button"
                        className="btn btn-muted min-h-9 px-3"
                        disabled={updateAccount.isPending}
                        onClick={() => updateAccount.mutate({ userId: account.id, data: { status: "active" } })}
                      >
                        Restore access
                      </button>
                    ) : isSelf ? (
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">Your account cannot be deactivated here</span>
                    ) : isConfirming ? (
                      <>
                        <span className="text-xs font-semibold text-[hsl(var(--destructive))]">Block this administrator’s sign-in?</span>
                        <button type="button" className="btn btn-muted min-h-9 px-3" onClick={() => setConfirmingUserId(null)}>Cancel</button>
                        <button
                          type="button"
                          className="btn min-h-9 border border-[hsl(var(--destructive)/.35)] px-3 text-[hsl(var(--destructive))]"
                          disabled={updateAccount.isPending}
                          onClick={() => updateAccount.mutate({ userId: account.id, data: { status: "disabled" } })}
                        >
                          {updateAccount.isPending ? "Deactivating…" : "Confirm"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-muted min-h-9 px-3"
                        disabled={updateAccount.isPending}
                        onClick={() => { setConfirmingUserId(account.id); updateAccount.reset(); }}
                      >
                        <UserRoundMinus size={15} />Deactivate
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {adminAccounts.data && adminAccounts.data.total > adminAccounts.data.items.length && (
          <p className="mb-0 mt-3 text-xs text-[hsl(var(--muted-foreground))]">
            Showing {adminAccounts.data.items.length} of {adminAccounts.data.total} accounts.
          </p>
        )}
      </section>
    </main>
  );
}
