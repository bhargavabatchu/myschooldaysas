export type AdmissionNameMatchDetail = {
  source: "existing_student" | "same_batch";
  name: string;
  admissionNo: string | null;
  className: string | null;
  sectionName: string | null;
  academicYear: string | null;
  matchingRow: number | null;
};

export type AdmissionNameMatch = {
  row: number;
  submittedName: string;
  matches: AdmissionNameMatchDetail[];
};

export type ExistingStudentName = {
  name: string;
  admissionNo: string | null;
  className: string | null;
  sectionName: string | null;
  academicYear: string | null;
};

export function normalizeStudentName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function findAdmissionNameMatches(
  rows: Array<{ row: number; name: string }>,
  existingStudents: ExistingStudentName[],
): AdmissionNameMatch[] {
  const existingByName = new Map<string, ExistingStudentName[]>();
  for (const student of existingStudents) {
    const normalized = normalizeStudentName(student.name);
    if (!normalized) continue;
    const matches = existingByName.get(normalized) ?? [];
    matches.push(student);
    existingByName.set(normalized, matches);
  }

  const firstBatchRowByName = new Map<string, { row: number; name: string }>();
  const warnings: AdmissionNameMatch[] = [];
  for (const item of rows) {
    const normalized = normalizeStudentName(item.name);
    if (!normalized) continue;

    const matches: AdmissionNameMatchDetail[] = (existingByName.get(normalized) ?? []).map((student) => ({
      source: "existing_student",
      name: student.name,
      admissionNo: student.admissionNo,
      className: student.className,
      sectionName: student.sectionName,
      academicYear: student.academicYear,
      matchingRow: null,
    }));
    const firstBatchMatch = firstBatchRowByName.get(normalized);
    if (firstBatchMatch) {
      matches.push({
        source: "same_batch",
        name: firstBatchMatch.name,
        admissionNo: null,
        className: null,
        sectionName: null,
        academicYear: null,
        matchingRow: firstBatchMatch.row,
      });
    } else {
      firstBatchRowByName.set(normalized, item);
    }

    if (matches.length) warnings.push({ row: item.row, submittedName: item.name, matches });
  }
  return warnings;
}
