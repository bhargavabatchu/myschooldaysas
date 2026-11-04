"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSectionsQueryKey,
  getGetStudentEnrollmentHistoryQueryKey,
  getGetStudentProfileQueryKey,
  getGetStudentsQueryKey,
  useGraduateStudentEnrollment,
  useGetSections,
  useGetStudentEnrollmentHistory,
  useRestoreStudentEnrollment,
  useTransferStudentEnrollment,
  useWithdrawStudentEnrollment,
} from "@workspace/api-client-react";
import { ArrowRightLeft, GraduationCap, RotateCcw, UserRoundMinus } from "lucide-react";

type CurrentEnrollment = {
  enrollmentId: string;
  sectionId: string;
  className: string;
  gradeLevel: number;
  sectionName: string;
  academicYear: string;
};

const readableError = (error: unknown) => error instanceof Error ? error.message : "Unable to update the enrollment.";

export function StudentEnrollmentManager({
  studentId,
  currentEnrollment,
}: {
  studentId: string;
  currentEnrollment: CurrentEnrollment | null;
}) {
  const queryClient = useQueryClient();
  const sections = useGetSections();
  const history = useGetStudentEnrollmentHistory(studentId);
  const [targetSectionId, setTargetSectionId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [graduationConfirmed, setGraduationConfirmed] = useState(false);
  const [withdrawConfirmed, setWithdrawConfirmed] = useState(false);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const invalidateStudentRecords = () => {
    queryClient.invalidateQueries({ queryKey: getGetStudentProfileQueryKey(studentId) });
    queryClient.invalidateQueries({ queryKey: getGetStudentEnrollmentHistoryQueryKey(studentId) });
    queryClient.invalidateQueries({ queryKey: getGetStudentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSectionsQueryKey() });
  };

  useEffect(() => {
    const destinations = (sections.data?.items ?? []).filter((section) => section.id !== currentEnrollment?.sectionId);
    if (!destinations.some((section) => section.id === targetSectionId)) {
      setTargetSectionId(destinations[0]?.id ?? "");
    }
  }, [sections.data, currentEnrollment?.sectionId, targetSectionId]);

  const transfer = useTransferStudentEnrollment({
    mutation: {
      onSuccess: (result) => {
        setConfirmed(false);
        setSuccessMessage(`Moved to ${result.sectionName}. The previous enrollment remains in history.`);
        invalidateStudentRecords();
      },
    },
  });

  const graduate = useGraduateStudentEnrollment({
    mutation: {
      onSuccess: (result) => {
        setGraduationConfirmed(false);
        setConfirmed(false);
        setSuccessMessage(`${result.className} student graduated for ${result.academicYear}. Enrollment history is preserved.`);
        invalidateStudentRecords();
      },
    },
  });
  const withdraw = useWithdrawStudentEnrollment({
    mutation: {
      onSuccess: (result) => {
        setWithdrawConfirmed(false);
        setSuccessMessage(`Student withdrawn. ${result.endedEnrollments} active enrollment(s) closed; the account and school records were kept.`);
        invalidateStudentRecords();
      },
    },
  });
  const restore = useRestoreStudentEnrollment({
    mutation: {
      onSuccess: (result) => {
        setRestoreConfirmed(false);
        setSuccessMessage(`Student restored to ${result.className} · ${result.sectionName} for ${result.academicYear}.`);
        invalidateStudentRecords();
      },
    },
  });

  function submitTransfer() {
    if (!currentEnrollment || !targetSectionId || !confirmed || graduate.isPending) return;
    setSuccessMessage("");
    transfer.mutate({
      data: {
        enrollmentId: currentEnrollment.enrollmentId,
        targetSectionId,
      },
    });
  }

  function submitGraduation() {
    if (!currentEnrollment || currentEnrollment.gradeLevel !== 12 || !graduationConfirmed || transfer.isPending) return;
    setSuccessMessage("");
    graduate.mutate({ data: { enrollmentId: currentEnrollment.enrollmentId } });
  }

  function submitWithdrawal() {
    if (!currentEnrollment || !withdrawConfirmed || transfer.isPending || graduate.isPending) return;
    setSuccessMessage("");
    withdraw.mutate({ data: { studentId } });
  }

  function submitRestore() {
    if (!restoreConfirmed || transfer.isPending || graduate.isPending || withdraw.isPending) return;
    setSuccessMessage("");
    restore.mutate({ data: { studentId } });
  }

  const latestHistory = history.data?.items[0];
  const canRestore = !currentEnrollment && latestHistory?.status === "disabled" && latestHistory.endedReason === "withdrawn";
  const selectedTarget = sections.data?.items.find((section) => section.id === targetSectionId);

  return (
    <section className="mt-5 border-t border-[hsl(var(--border))] pt-4" aria-labelledby="student-enrollment-history-heading">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
          <ArrowRightLeft size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="student-enrollment-history-heading" className="m-0 text-sm font-bold">Enrollment history</h3>
          <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Previous class and section records stay available after transfers, promotions, graduation, and withdrawal.
          </p>
        </div>
      </div>

      {currentEnrollment && (
        <div className="mt-4 grid gap-3 rounded-lg bg-[hsl(var(--background))] p-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-xs font-semibold">Transfer to section
            <select
              className="field mt-1.5"
              value={targetSectionId}
              onChange={(event) => {
                setTargetSectionId(event.target.value);
                setConfirmed(false);
                setSuccessMessage("");
              }}
              disabled={sections.isLoading || (sections.data?.items.length ?? 0) < 2 || transfer.isPending || graduate.isPending}
            >
              <option value="">Select a destination</option>
              {sections.data?.items
                .filter((section) => section.id !== currentEnrollment.sectionId)
                .map((section) => (
                  <option key={section.id} value={section.id}>{section.className} · {section.name}</option>
                ))}
            </select>
            {selectedTarget && <span className="mt-1 block font-normal text-[hsl(var(--muted-foreground))]">
              {selectedTarget.studentCount} active · {selectedTarget.capacity == null ? "no capacity limit" : `capacity ${selectedTarget.capacity}`}
            </span>}
          </label>
          <button
            type="button"
            className="btn btn-muted min-h-9 px-3 text-xs"
            onClick={submitTransfer}
            disabled={!confirmed || !targetSectionId || transfer.isPending || graduate.isPending}
          >
            {transfer.isPending ? "Moving…" : "Transfer student"}
          </button>
          <label className="flex items-start gap-2 text-xs font-normal text-[hsl(var(--muted-foreground))] md:col-span-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={transfer.isPending || graduate.isPending}
            />
            <span>Confirm this move. The current enrollment will close and a new enrollment will be created.</span>
          </label>
        </div>
      )}

      {currentEnrollment?.gradeLevel === 12 && (
        <div className="mt-3 grid gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-start gap-2">
            <GraduationCap size={17} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
            <div>
              <p className="m-0 text-xs font-bold">Graduate from Grade 12</p>
              <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                This closes the current enrollment. The student account and academic history are kept.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary min-h-9 px-3 text-xs"
            data-testid="graduate-student"
            onClick={submitGraduation}
            disabled={!graduationConfirmed || graduate.isPending || transfer.isPending}
          >
            {graduate.isPending ? "Graduating…" : "Graduate student"}
          </button>
          <label className="flex items-start gap-2 text-xs font-normal text-[hsl(var(--muted-foreground))] md:col-span-2">
            <input
              type="checkbox"
              checked={graduationConfirmed}
              onChange={(event) => {
                setGraduationConfirmed(event.target.checked);
                setSuccessMessage("");
              }}
              disabled={graduate.isPending || transfer.isPending}
            />
            <span>Confirm graduation. The student will no longer have an active enrollment.</span>
          </label>
        </div>
      )}

      {currentEnrollment && (
        <div className="mt-3 rounded-lg border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.04)] p-3">
          <div className="flex items-start gap-2">
            <UserRoundMinus size={17} className="mt-0.5 shrink-0 text-[hsl(var(--destructive))]" aria-hidden="true" />
            <div>
              <p className="m-0 text-xs font-bold">Withdraw student</p>
              <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Ends all active enrollments and removes the student from active rosters. Profile, fees, attendance, results, and sign-in access are kept.
              </p>
            </div>
          </div>
          {!withdrawConfirmed ? (
            <button
              type="button"
              className="btn btn-muted mt-3 min-h-9 border border-[hsl(var(--destructive)/.35)] px-3 text-xs text-[hsl(var(--destructive))]"
              onClick={() => setWithdrawConfirmed(true)}
              disabled={transfer.isPending || graduate.isPending || withdraw.isPending}
            >
              Withdraw student
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="m-0 text-xs font-semibold">Confirm withdrawal? No school records will be deleted.</p>
              <div className="flex gap-2">
                <button type="button" className="btn btn-muted min-h-9 px-3 text-xs" onClick={() => setWithdrawConfirmed(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn min-h-9 bg-[hsl(var(--destructive))] px-3 text-xs text-white"
                  onClick={submitWithdrawal}
                  disabled={withdraw.isPending || transfer.isPending || graduate.isPending}
                >
                  {withdraw.isPending ? "Withdrawing…" : "Confirm withdrawal"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canRestore && (
        <div className="mt-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
          <div className="flex items-start gap-2">
            <RotateCcw size={17} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
            <div>
              <p className="m-0 text-xs font-bold">Restore withdrawn student</p>
              <p className="mb-0 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Reopens the most recent withdrawn enrollment in its previous section, if the section has capacity.
              </p>
            </div>
          </div>
          {!restoreConfirmed ? (
            <button
              type="button"
              className="btn btn-muted mt-3 min-h-9 px-3 text-xs"
              onClick={() => setRestoreConfirmed(true)}
              disabled={restore.isPending}
            >
              Restore enrollment
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="m-0 text-xs font-semibold">Restore this student to the previous class and section?</p>
              <div className="flex gap-2">
                <button type="button" className="btn btn-muted min-h-9 px-3 text-xs" onClick={() => setRestoreConfirmed(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary min-h-9 px-3 text-xs"
                  onClick={submitRestore}
                  disabled={restore.isPending}
                >
                  {restore.isPending ? "Restoring…" : "Confirm restore"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {sections.isError && <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">{readableError(sections.error)}</p>}
      {transfer.isError && <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">{readableError(transfer.error)}</p>}
      {graduate.isError && <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">{readableError(graduate.error)}</p>}
      {withdraw.isError && <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">{readableError(withdraw.error)}</p>}
      {restore.isError && <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">{readableError(restore.error)}</p>}
      {history.isError && <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">{readableError(history.error)}</p>}
      {successMessage && <p role="status" className="mt-2 text-xs text-[hsl(var(--primary))]">{successMessage}</p>}
      {!currentEnrollment && <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">This student has no active enrollment.</p>}

      {history.data && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-[hsl(var(--muted))] text-[10px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="px-3 py-2">Academic year</th>
                <th className="px-3 py-2">Class · section</th>
                <th className="px-3 py-2">Admission no.</th>
                <th className="px-3 py-2">Record</th>
              </tr>
            </thead>
            <tbody>
              {history.data.items.map((item) => (
                <tr key={item.id} className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-2">{item.academicYear}</td>
                  <td className="px-3 py-2">{item.className} · {item.sectionName}</td>
                  <td className="px-3 py-2">{item.admissionNo}</td>
                  <td className="px-3 py-2">
                     {item.endedReason === "transferred"
                       ? "Transferred"
                       : item.endedReason === "promoted"
                         ? "Promoted"
                         : item.endedReason === "graduated"
                           ? "Graduated"
                           : item.endedReason === "withdrawn"
                             ? "Withdrawn"
                           : item.status === "active" ? "Current" : "Inactive"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.data.items.length && <p className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">No enrollment records found.</p>}
        </div>
      )}
    </section>
  );
}
