"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAvailableStudentsQueryKey,
  getGetSectionsQueryKey,
  getGetStudentsQueryKey,
  useGetAcademicYears,
  useCreateStudentAdmissions,
  usePreviewStudentAdmissions,
} from "@workspace/api-client-react";
import type { SectionSummary } from "@workspace/api-client-react";
import { FileUp, UserPlus } from "lucide-react";
import { AcademicYearSelect } from "./academic-year-select";

type AdmissionRow = {
  name: string;
  email: string;
  admissionNo: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  address?: string;
  bloodGroup?: string;
  guardianName?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  guardianRelationship?: string;
};

function parseAdmissionCsv(text: string): AdmissionRow[] {
  const source = text.replace(/^\uFEFF/, "");
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value.trim())) table.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted value.");
  row.push(cell.replace(/\r$/, ""));
  if (row.some((value) => value.trim())) table.push(row);
  if (table.length < 2) throw new Error("Add a header and at least one student row.");

  const headers = table[0]!.map((value) => value.trim().toLowerCase().replace(/[\s_-]/g, ""));
  const nameIndex = headers.indexOf("name");
  const emailIndex = headers.indexOf("email");
  const admissionIndex = headers.findIndex((value) => value === "admissionno" || value === "admissionnumber");
  if ([nameIndex, emailIndex, admissionIndex].some((index) => index < 0)) {
    throw new Error("CSV headers must include name, email, and admissionNo.");
  }
  const optionalColumns = {
    dateOfBirth: headers.findIndex((value) => ["dateofbirth", "dob"].includes(value)),
    gender: headers.indexOf("gender"),
    phone: headers.findIndex((value) => ["phone", "studentphone"].includes(value)),
    address: headers.indexOf("address"),
    bloodGroup: headers.findIndex((value) => ["bloodgroup", "bloodtype"].includes(value)),
    guardianName: headers.findIndex((value) => ["guardianname", "parentname"].includes(value)),
    guardianEmail: headers.findIndex((value) => ["guardianemail", "parentemail"].includes(value)),
    guardianPhone: headers.findIndex((value) => ["guardianphone", "parentphone"].includes(value)),
    guardianRelationship: headers.findIndex((value) => ["guardianrelationship", "relationship"].includes(value)),
  };
  const rows = table.slice(1).map((values) => ({
    name: values[nameIndex] ?? "",
    email: values[emailIndex] ?? "",
    admissionNo: values[admissionIndex] ?? "",
    ...Object.fromEntries(Object.entries(optionalColumns).map(([field, index]) => [
      field,
      index >= 0 ? values[index]?.trim() || undefined : undefined,
    ])),
  })) as AdmissionRow[];
  if (rows.length > 20) throw new Error("A batch can contain at most 20 students.");
  return rows;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

function isNameMatchConfirmationRequired(error: unknown, depth = 0): boolean {
  if (depth > 3) return false;
  if (typeof error === "string") return error.includes("NAME_MATCH_CONFIRMATION_REQUIRED");
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return [record.code, record.message].some((value) =>
    typeof value === "string" && value.includes("NAME_MATCH_CONFIRMATION_REQUIRED"),
  ) || isNameMatchConfirmationRequired(record.data, depth + 1)
    || isNameMatchConfirmationRequired(record.response, depth + 1);
}

export function AdmissionIntake({ sections }: { sections: SectionSummary[] }) {
  const queryClient = useQueryClient();
  const academicYears = useGetAcademicYears();
  const academicYearItems = academicYears.data?.items ?? [];
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [sectionId, setSectionId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [admissionNo, setAdmissionNo] = useState("");
  const [profile, setProfile] = useState({
    dateOfBirth: "",
    gender: "",
    phone: "",
    address: "",
    bloodGroup: "",
    guardianName: "",
    guardianEmail: "",
    guardianPhone: "",
    guardianRelationship: "",
  });
  const [csvText, setCsvText] = useState("");
  const [csvError, setCsvError] = useState("");
  const [nameMatchesConfirmed, setNameMatchesConfirmed] = useState(false);
  const [credentials, setCredentials] = useState<Array<{
    id: string;
    name: string;
    email: string;
    admissionNo: string;
    temporaryPassword: string;
    temporaryPasswordExpiresAt: string;
  }> | null>(null);
  const preview = usePreviewStudentAdmissions();
  const create = useCreateStudentAdmissions({
    mutation: {
      onSuccess: (result) => {
        setCredentials(result.items);
        preview.reset();
        queryClient.invalidateQueries({ queryKey: getGetStudentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSectionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAvailableStudentsQueryKey() });
      },
    },
  });
  const currentYear = academicYearItems.find((year) => year.status === "current")?.academicYear ?? "";

  useEffect(() => {
    if (!academicYear && currentYear) setAcademicYear(currentYear);
  }, [academicYear, currentYear]);

  const clearResults = () => {
    preview.reset();
    create.reset();
    setCredentials(null);
    setCsvError("");
    setNameMatchesConfirmed(false);
  };

  const admissionRows = (): AdmissionRow[] => {
    if (mode === "single") {
      return [{
        name, email, admissionNo,
        ...Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, value.trim() || undefined])),
      }];
    }
    return parseAdmissionCsv(csvText);
  };

  function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearResults();
    let rows: AdmissionRow[];
    try {
      rows = admissionRows();
    } catch (error) {
      setCsvError(errorMessage(error));
      return;
    }
    if (!sectionId || academicYear.trim().length < 4) return;
    preview.mutate({
      data: {
        sectionId,
        academicYear: academicYear.trim(),
        rows,
      },
    });
  }

  async function loadCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvError("");
    try {
      setCsvText(await file.text());
      clearResults();
    } catch {
      setCsvError("Could not read the selected CSV file.");
    }
    event.target.value = "";
  }

  function confirmAdmissions() {
    if (!preview.data?.valid) return;
    const hasNameMatches = preview.data.nameMatches.length > 0;
    if (hasNameMatches && !nameMatchesConfirmed) return;
    create.mutate({
      data: {
        sectionId: preview.data.sectionId,
        academicYear: preview.data.academicYear,
        ...(hasNameMatches && nameMatchesConfirmed ? { confirmNameMatches: true } : {}),
        rows: preview.data.items.map((item) => ({
          name: item.name,
          email: item.email,
          admissionNo: item.admissionNo,
          dateOfBirth: item.dateOfBirth ?? undefined,
          gender: item.gender ?? undefined,
          phone: item.phone ?? undefined,
          address: item.address ?? undefined,
          bloodGroup: item.bloodGroup ?? undefined,
          guardianName: item.guardianName ?? undefined,
          guardianEmail: item.guardianEmail ?? undefined,
          guardianPhone: item.guardianPhone ?? undefined,
          guardianRelationship: item.guardianRelationship ?? undefined,
        })),
      },
    });
  }

  const selectedSection = sections.find((section) => section.id === sectionId);

  return (
    <section className="surface mb-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 flex items-center gap-2 text-sm font-bold"><UserPlus size={16} /> New student admissions</h2>
          <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">Create student accounts and enroll them together. Temporary passwords are shown once and expire in seven days.</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-[hsl(var(--muted))] p-1" role="group" aria-label="Admission type">
          <button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === "single" ? "bg-[hsl(var(--card))] shadow-sm" : ""}`} aria-pressed={mode === "single"} onClick={() => { setMode("single"); clearResults(); }}>One student</button>
          <button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === "bulk" ? "bg-[hsl(var(--card))] shadow-sm" : ""}`} aria-pressed={mode === "bulk"} onClick={() => { setMode("bulk"); clearResults(); }}>CSV batch</button>
        </div>
      </div>

      <form className="mt-4 grid gap-3 border-t border-[hsl(var(--border))] pt-4 md:grid-cols-2" onSubmit={submitPreview}>
        <label className="text-xs font-semibold">Section
          <select className="field mt-1.5" required value={sectionId} onChange={(event) => { setSectionId(event.target.value); clearResults(); }}>
            <option value="">Select section</option>
            {sections.map((section) => <option key={section.id} value={section.id}>{section.className} · {section.name}</option>)}
          </select>
          {selectedSection && <span className="mt-1 block font-normal text-[hsl(var(--muted-foreground))]">
            {selectedSection.studentCount} active · {selectedSection.capacity == null ? "no capacity limit" : `capacity ${selectedSection.capacity}`}
          </span>}
        </label>
        <AcademicYearSelect
          label="Academic year"
          items={academicYearItems}
          value={academicYear}
          onChange={(value) => { setAcademicYear(value); clearResults(); }}
          disabled={academicYears.isLoading || preview.isPending || create.isPending}
        />
        {academicYearItems.length === 0 && !academicYears.isLoading && (
          <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">
            Add the school year in <a className="font-semibold text-[hsl(var(--primary))]" href="/calendar">Academic calendar</a> first.
          </p>
        )}
        {academicYears.isError && <p role="alert" className="m-0 text-xs text-[hsl(var(--destructive))]">Academic years could not be loaded. Refresh and try again.</p>}

        {mode === "single" ? <>
          <label className="text-xs font-semibold">Student name
            <input className="field mt-1.5" required maxLength={120} value={name} onChange={(event) => { setName(event.target.value); clearResults(); }} />
          </label>
          <label className="text-xs font-semibold">Student email
            <input className="field mt-1.5" required type="email" maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); clearResults(); }} />
          </label>
          <label className="text-xs font-semibold">Admission number
            <input className="field mt-1.5" required maxLength={40} value={admissionNo} onChange={(event) => { setAdmissionNo(event.target.value); clearResults(); }} />
          </label>
          <label className="text-xs font-semibold">Date of birth
            <input className="field mt-1.5" type="date" value={profile.dateOfBirth} onChange={(event) => { setProfile({ ...profile, dateOfBirth: event.target.value }); clearResults(); }} />
          </label>
          <label className="text-xs font-semibold">Gender
            <input className="field mt-1.5" maxLength={40} value={profile.gender} onChange={(event) => { setProfile({ ...profile, gender: event.target.value }); clearResults(); }} />
          </label>
          <label className="text-xs font-semibold">Student phone
            <input className="field mt-1.5" type="tel" maxLength={32} value={profile.phone} onChange={(event) => { setProfile({ ...profile, phone: event.target.value }); clearResults(); }} />
          </label>
          <label className="text-xs font-semibold">Blood group
            <input className="field mt-1.5" maxLength={8} value={profile.bloodGroup} placeholder="e.g. O+" onChange={(event) => { setProfile({ ...profile, bloodGroup: event.target.value }); clearResults(); }} />
          </label>
          <label className="text-xs font-semibold md:col-span-2">Address
            <textarea className="field mt-1.5 min-h-16" maxLength={500} value={profile.address} onChange={(event) => { setProfile({ ...profile, address: event.target.value }); clearResults(); }} />
          </label>
          <div className="md:col-span-2 border-t border-[hsl(var(--border))] pt-3">
            <h3 className="m-0 text-xs font-bold">Guardian contact (optional)</h3>
            <p className="mb-2 mt-1 text-xs text-[hsl(var(--muted-foreground))]">Saved as contact details only; this does not create a guardian login or access link.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold">Guardian name
                <input className="field mt-1.5" maxLength={120} value={profile.guardianName} onChange={(event) => { setProfile({ ...profile, guardianName: event.target.value }); clearResults(); }} />
              </label>
              <label className="text-xs font-semibold">Relationship
                <input className="field mt-1.5" maxLength={40} placeholder="e.g. Parent" value={profile.guardianRelationship} onChange={(event) => { setProfile({ ...profile, guardianRelationship: event.target.value }); clearResults(); }} />
              </label>
              <label className="text-xs font-semibold">Guardian email
                <input className="field mt-1.5" type="email" maxLength={254} value={profile.guardianEmail} onChange={(event) => { setProfile({ ...profile, guardianEmail: event.target.value }); clearResults(); }} />
              </label>
              <label className="text-xs font-semibold">Guardian phone
                <input className="field mt-1.5" type="tel" maxLength={32} value={profile.guardianPhone} onChange={(event) => { setProfile({ ...profile, guardianPhone: event.target.value }); clearResults(); }} />
              </label>
            </div>
          </div>
        </> : <div className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold" htmlFor="admission-csv">CSV rows</label>
            <label className="btn min-h-8 cursor-pointer px-3 text-xs">
              <FileUp size={14} /> Upload CSV
              <input id="admission-csv" className="sr-only" type="file" accept=".csv,text/csv" onChange={loadCsv} />
            </label>
          </div>
          <textarea className="field mt-1.5 min-h-32 font-mono text-xs" value={csvText} onChange={(event) => { setCsvText(event.target.value); clearResults(); }} placeholder={"name,email,admissionNo,dateOfBirth,gender,phone,address,bloodGroup,guardianName,guardianEmail,guardianPhone,guardianRelationship\nAsha Rao,asha@example.com,ADM-1001,2015-04-12,Female,9876543210,\"12 Park Road\",O+,Mira Rao,mira@example.com,9876500000,Mother"} />
          <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">Required headers: name, email, admissionNo. Profile and guardian columns are optional. Up to 20 students per batch.</p>
        </div>}

        {csvError && <p role="alert" className="m-0 text-xs text-[hsl(var(--destructive))] md:col-span-2">{csvError}</p>}
        {preview.isError && <p role="alert" className="m-0 text-xs text-[hsl(var(--destructive))] md:col-span-2">{errorMessage(preview.error)}</p>}
        <div className="flex justify-end md:col-span-2">
          <button className="btn btn-primary min-h-9 px-4 text-xs" disabled={!sectionId || academicYear.trim().length < 4 || preview.isPending || create.isPending}>
            {preview.isPending ? "Checking…" : "Preview admissions"}
          </button>
        </div>
      </form>

      {preview.data && <div className="mt-4 rounded-lg border border-[hsl(var(--border))] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold" role="status">
            {preview.data.valid ? `${preview.data.items.length} student(s) ready` : "Resolve the issues below before confirming"}
            {" · "}
            {preview.data.seatsAvailable == null ? "unlimited seats" : `${preview.data.seatsAvailable} seat(s) available`}
          </div>
          {preview.data.valid && <button type="button" className="btn btn-primary min-h-8 px-3 text-xs" disabled={create.isPending || (!!preview.data.nameMatches.length && !nameMatchesConfirmed)} onClick={confirmAdmissions}>
            {create.isPending ? "Creating accounts…" : "Confirm and create"}
          </button>}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[540px] text-left text-xs">
            <thead><tr className="text-[hsl(var(--muted-foreground))]"><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Admission no.</th><th className="p-2">Guardian</th></tr></thead>
            <tbody>{preview.data.items.map((item) => <tr key={item.row} className="border-t border-[hsl(var(--border))]"><td className="p-2">{item.row}</td><td className="p-2">{item.name}</td><td className="p-2">{item.email}</td><td className="p-2">{item.admissionNo}</td><td className="p-2">{item.guardianName || "—"}</td></tr>)}</tbody>
          </table>
        </div>
        {!!preview.data.errors.length && <ul className="mb-0 mt-2 space-y-1 text-xs text-[hsl(var(--destructive))]">
          {preview.data.errors.map((issue, index) => <li key={`${issue.row}-${issue.field}-${index}`}>Row {issue.row} · {issue.field}: {issue.message}</li>)}
        </ul>}
        {!!preview.data.nameMatches.length && <div className="mt-4 rounded-lg border border-amber-700/25 bg-amber-500/[.08] p-3" role="alert" aria-labelledby="name-match-warning-title">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--accent))]" aria-hidden="true" />
            <div className="min-w-0">
              <h3 id="name-match-warning-title" className="m-0 text-xs font-bold">Check these possible name matches</h3>
              <p className="mb-0 mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                Names match existing records or another row in this batch. This is a warning, not a duplicate identity error. Review each match before creating accounts.
              </p>
            </div>
          </div>
          <ul className="mb-0 mt-3 space-y-3">
            {preview.data.nameMatches.map((match, matchIndex) => <li key={`${match.row}-${matchIndex}`} className="rounded-md border border-amber-700/15 bg-[hsl(var(--card))] p-3">
              <p className="m-0 text-xs font-bold">Submitted row {match.row}: {match.submittedName}</p>
              <ul className="mb-0 mt-2 space-y-2">
                {match.matches.map((record, recordIndex) => <li key={`${record.source}-${record.matchingRow ?? record.admissionNo ?? record.name}-${recordIndex}`} className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  <span className="font-semibold text-[hsl(var(--foreground))]">{record.name}</span>
                  {record.admissionNo ? ` · Admission no. ${record.admissionNo}` : ""}
                  {record.className || record.sectionName
                    ? ` · ${[record.className, record.sectionName].filter(Boolean).join(" · ")}`
                    : ""}
                  {record.academicYear ? ` · ${record.academicYear}` : ""}
                  {record.source === "same_batch" && record.matchingRow != null
                    ? ` · Earlier CSV row ${record.matchingRow}`
                    : ""}
                </li>)}
              </ul>
            </li>)}
          </ul>
          <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-amber-700/15 pt-3 text-xs font-semibold leading-relaxed">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              checked={nameMatchesConfirmed}
              onChange={(event) => setNameMatchesConfirmed(event.target.checked)}
              aria-describedby="name-match-confirmation-help"
            />
            <span>
              I checked these matches and confirm these are different students.
              <span id="name-match-confirmation-help" className="mt-0.5 block font-normal text-[hsl(var(--muted-foreground))]">
                Confirm and create will stay unavailable until you check this box.
              </span>
            </span>
          </label>
        </div>}
      </div>}

      {create.isError && <p role="alert" className="mb-0 mt-3 text-xs text-[hsl(var(--destructive))]">
        {isNameMatchConfirmationRequired(create.error)
          ? "Student names changed or new matches were found after preview. Preview admissions again and inspect the updated matches before confirming."
          : `${errorMessage(create.error)} Please preview the batch again before retrying.`}
      </p>}
      {credentials && <div className="mt-4 rounded-lg border border-[hsl(var(--border))] p-3">
        <p className="mb-2 text-xs font-bold">Accounts created. Copy these temporary passwords now; they will not be shown again.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead><tr className="text-[hsl(var(--muted-foreground))]"><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Admission no.</th><th className="p-2">Temporary password</th><th className="p-2">Expires</th></tr></thead>
            <tbody>{credentials.map((credential) => <tr key={credential.id} className="border-t border-[hsl(var(--border))]"><td className="p-2">{credential.name}</td><td className="p-2">{credential.email}</td><td className="p-2">{credential.admissionNo}</td><td className="p-2 font-mono select-all">{credential.temporaryPassword}</td><td className="p-2">{credential.temporaryPasswordExpiresAt.slice(0, 10)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>}
    </section>
  );
}
