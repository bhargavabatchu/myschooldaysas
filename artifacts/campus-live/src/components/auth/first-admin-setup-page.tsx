"use client";

import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  GraduationCap,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import {
  useCreateFirstAdmin,
  useGetFirstAdminSetupStatus,
} from "@workspace/api-client-react";
import { PLATFORM_NAME, SCHOOL_NAME } from "@/lib/branding";

function getErrorText(error: unknown) {
  return error instanceof Error ? error.message : "Setup could not be completed. Please try again.";
}

export function FirstAdminSetupPage() {
  const status = useGetFirstAdminSetupStatus({ query: { retry: false } });
  const [organizationName, setOrganizationName] = useState(SCHOOL_NAME);
  const [organizationSlug, setOrganizationSlug] = useState("st-josephs-public-school");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [formError, setFormError] = useState("");
  const [complete, setComplete] = useState<{ organizationSlug: string; email: string } | null>(null);
  const createFirstAdmin = useCreateFirstAdmin({
    mutation: {
      onSuccess: (result) => {
        setComplete({ organizationSlug: result.organizationSlug, email: result.email });
        setSetupKey("");
        setPassword("");
        setPasswordConfirmation("");
      },
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (password !== passwordConfirmation) {
      setFormError("The passwords do not match.");
      return;
    }
    createFirstAdmin.mutate({
      data: { setupKey, organizationName, organizationSlug, name, email, password },
    });
  }

  return (
    <main className="premium-login">
      <section className="premium-story" aria-label="School setup">
        <div className="premium-orbit premium-orbit-one" aria-hidden="true" />
        <div className="premium-orbit premium-orbit-two" aria-hidden="true" />
        <div className="premium-story-top">
          <div className="premium-crest" aria-hidden="true"><GraduationCap size={25} strokeWidth={1.7} /></div>
          <div>
            <p className="premium-school-name">{SCHOOL_NAME}</p>
            <p className="premium-platform">{PLATFORM_NAME}</p>
          </div>
        </div>
        <div className="premium-story-copy">
          <div className="premium-eyebrow"><span aria-hidden="true" />A secure first step</div>
          <h1>Build your<br />school’s <em>home.</em></h1>
          <p>Create the school workspace and its first administrator account.</p>
        </div>
        <div className="premium-story-footer">
          <ShieldCheck size={17} strokeWidth={1.7} aria-hidden="true" />
          <span>One-time protected setup</span>
          <span className="premium-footer-rule" aria-hidden="true" />
          <span>{PLATFORM_NAME}</span>
        </div>
        <div className="premium-side-mark" aria-hidden="true">SJP&nbsp; · &nbsp;MY SCHOOL DAY</div>
      </section>

      <section className="premium-form-panel" aria-label="First administrator setup">
        <div className="premium-mobile-brand">
          <div className="premium-crest" aria-hidden="true"><GraduationCap size={23} strokeWidth={1.7} /></div>
          <div>
            <p className="premium-school-name">{SCHOOL_NAME}</p>
            <p className="premium-platform">{PLATFORM_NAME}</p>
          </div>
        </div>
        <div className="premium-form-wrap">
          <div className="premium-form-heading">
            <div className="premium-kicker"><span className="premium-kicker-dot" aria-hidden="true" />ONE-TIME SETUP</div>
            <h2>Set up your school.</h2>
            <p>Create the organization and its first administrator. Setup closes after this account is created.</p>
          </div>

          {status.isLoading && <p className="text-sm text-[hsl(var(--muted-foreground))]" role="status">Checking setup availability…</p>}
          {status.isError && (
            <div className="premium-login-error" role="alert">
              We could not check setup availability. Refresh the page and try again.
            </div>
          )}
          {!status.isLoading && !status.isError && !status.data?.enabled && (
            <div className="space-y-4">
              <div className="surface p-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                <p className="font-semibold text-[hsl(var(--foreground))]">Setup is not currently available.</p>
                <p className="mt-1">Add the output of <code>openssl rand -hex 32</code> as the private <code>FIRST_ADMIN_SETUP_KEY</code> in Production Secrets, then republish. Keep the 64-character value for the setup form.</p>
              </div>
              <Link className="btn btn-muted w-full justify-center" href="/login">Back to sign in <ArrowRight size={15} /></Link>
            </div>
          )}

          {status.data?.enabled && !complete && (
            <form className="space-y-0" onSubmit={submit}>
              <label className="premium-label" htmlFor="setup-organization-name">School name</label>
              <input
                id="setup-organization-name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="organization"
                className="premium-input"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
              />

              <label className="premium-label premium-label-spaced" htmlFor="setup-organization-slug">Organization ID</label>
              <input
                id="setup-organization-slug"
                required
                minLength={2}
                maxLength={80}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                autoComplete="off"
                className="premium-input"
                value={organizationSlug}
                onChange={(event) => setOrganizationSlug(event.target.value)}
                aria-describedby="setup-organization-hint"
              />
              <p id="setup-organization-hint" className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Use this ID on the sign-in page. If your organization already exists, enter its exact ID.</p>

              <label className="premium-label premium-label-spaced" htmlFor="setup-admin-name">Administrator name</label>
              <input
                id="setup-admin-name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                className="premium-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />

              <label className="premium-label premium-label-spaced" htmlFor="setup-admin-email">Administrator email</label>
              <input
                id="setup-admin-email"
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                className="premium-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              <label className="premium-label premium-label-spaced" htmlFor="setup-key">Private setup key</label>
              <input
                id="setup-key"
                required
                type="password"
                minLength={64}
                maxLength={64}
                pattern="[0-9a-fA-F]{64}"
                autoComplete="off"
                className="premium-input"
                value={setupKey}
                onChange={(event) => setSetupKey(event.target.value)}
              />

              <label className="premium-label premium-label-spaced" htmlFor="setup-admin-password">Administrator password</label>
              <input
                id="setup-admin-password"
                required
                type="password"
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                className="premium-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="setup-password-hint"
              />
              <p id="setup-password-hint" className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Use at least 12 characters. This becomes your sign-in password.</p>

              <label className="premium-label premium-label-spaced" htmlFor="setup-admin-password-confirm">Confirm password</label>
              <input
                id="setup-admin-password-confirm"
                required
                type="password"
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                className="premium-input"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
              />

              {(formError || createFirstAdmin.isError) && (
                <div className="premium-login-error" role="alert">
                  {formError || getErrorText(createFirstAdmin.error)}
                </div>
              )}
              <button
                type="submit"
                disabled={createFirstAdmin.isPending}
                aria-busy={createFirstAdmin.isPending}
                className="premium-submit mt-5"
              >
                <span>{createFirstAdmin.isPending ? "Creating account…" : "Create administrator"}</span>
                {createFirstAdmin.isPending
                  ? <LoaderCircle className="premium-submit-icon animate-spin" size={17} />
                  : <ArrowRight className="premium-submit-icon" size={17} strokeWidth={1.8} />}
              </button>
            </form>
          )}

          {complete && (
            <div className="space-y-4">
              <div className="surface p-5" role="status">
                <div className="mb-3 flex items-center gap-2 font-semibold text-[hsl(var(--primary))]"><Check size={18} />Administrator created</div>
                <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">Your school workspace is ready. Sign in with organization ID <strong className="text-[hsl(var(--foreground))]">{complete.organizationSlug}</strong> and email <strong className="text-[hsl(var(--foreground))]">{complete.email}</strong>.</p>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Remove <code>FIRST_ADMIN_SETUP_KEY</code> from Production Secrets after this step.</p>
              </div>
              <Link className="btn btn-primary w-full justify-center" href="/login">Go to sign in <ArrowRight size={15} /></Link>
            </div>
          )}
        </div>

        <div className="premium-panel-footer" aria-hidden="true">
          <span>{PLATFORM_NAME.toUpperCase()}</span>
          <span>{SCHOOL_NAME.toUpperCase()}</span>
        </div>
      </section>
    </main>
  );
}
