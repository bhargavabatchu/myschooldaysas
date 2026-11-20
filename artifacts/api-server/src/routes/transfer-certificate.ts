import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withOrg } from "@workspace/db";
import { requireAuth, requireRoles } from "../lib/auth";
import { createRouteRegistrar } from "../lib/fastify-routes";

/**
 * Printable Transfer Certificate (TC) for a withdrawn student. Administrators
 * open this endpoint in a new tab; it renders a standalone A4 print page,
 * mirroring the report-card print flow.
 */

const paramsSchema = z.object({ studentId: z.string().uuid() });

const certificateKinds = ["bonafide", "study", "character"] as const;
const certificateParams = z.object({
  studentId: z.string().uuid(),
  kind: z.enum(certificateKinds),
});

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCertificateHtml(data: {
  schoolName: string;
  kind: (typeof certificateKinds)[number];
  studentName: string;
  className: string;
  sectionName: string;
  admissionNo: string;
  academicYears: string;
  issuedBy: string;
  issuedOn: string;
}): string {
  const titles: Record<(typeof certificateKinds)[number], string> = {
    bonafide: "Bonafide Certificate",
    study: "Study Certificate",
    character: "Character & Conduct Certificate",
  };
  const bodies: Record<(typeof certificateKinds)[number], string> = {
    bonafide: `This is to certify that <strong>${escapeHtml(data.studentName)}</strong>, bearing admission number ${escapeHtml(data.admissionNo)}, is a bona fide student of this school, currently studying in <strong>${escapeHtml(data.className)} · ${escapeHtml(data.sectionName)}</strong> during the academic year(s) ${escapeHtml(data.academicYears)}. This certificate is issued at the request of the parent / guardian for official purposes.`,
    study: `This is to certify that <strong>${escapeHtml(data.studentName)}</strong>, bearing admission number ${escapeHtml(data.admissionNo)}, has been studying in this school during the academic year(s) ${escapeHtml(data.academicYears)} and is presently in <strong>${escapeHtml(data.className)} · ${escapeHtml(data.sectionName)}</strong>. This certificate is issued for official purposes.`,
    character: `This is to certify that <strong>${escapeHtml(data.studentName)}</strong>, bearing admission number ${escapeHtml(data.admissionNo)}, studied in this school during the academic year(s) ${escapeHtml(data.academicYears)} and is presently in <strong>${escapeHtml(data.className)} · ${escapeHtml(data.sectionName)}</strong>. The character and conduct of the student during the period of study here was <strong>satisfactory / good</strong>.`,
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${escapeHtml(titles[data.kind])} — ${escapeHtml(data.studentName)}</title>
<style>
  @page { size: A4; margin: 22mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1c2b26; }
  .sheet { max-width: 170mm; margin: 0 auto; }
  header { text-align: center; border-bottom: 3px double #1c2b26; padding-bottom: 14px; margin-bottom: 10px; }
  .school { font-size: 26px; font-weight: 700; letter-spacing: .04em; margin: 0; }
  .motto { font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #55685f; margin: 6px 0 0; }
  h1 { text-align: center; font-size: 19px; letter-spacing: .28em; text-transform: uppercase; margin: 30px 0 24px; }
  .body { font-size: 16px; line-height: 2.1; text-align: justify; }
  .sign { display: flex; justify-content: space-between; margin-top: 90px; font-size: 13.5px; }
  .sign div { text-align: center; }
  .sign .line { border-top: 1px solid #1c2b26; padding-top: 6px; min-width: 200px; }
  .date { text-align: right; font-size: 13.5px; margin-top: 26px; }
  @media print { .noprint { display: none; } }
  .noprint { text-align: center; margin: 18px 0; }
  .noprint button { font-size: 14px; padding: 10px 26px; border-radius: 999px; border: none; background: #173e38; color: #f6f3e9; cursor: pointer; }
</style></head>
<body><div class="sheet">
  <header>
    <p class="school">${escapeHtml(data.schoolName)}</p>
    <p class="motto">${escapeHtml(titles[data.kind])}</p>
  </header>
  <h1>${escapeHtml(titles[data.kind])}</h1>
  <p class="body">${bodies[data.kind]}</p>
  <p class="date">Date: ${escapeHtml(data.issuedOn)}</p>
  <div class="sign">
    <div><div class="line">Class Teacher</div></div>
    <div><div class="line">${escapeHtml(data.issuedBy)}<br/>Principal / School Administrator</div></div>
  </div>
  <div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
</div></body></html>`;
}

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const fmtDate = (value: Date | string | null): string =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "—";

function renderTcHtml(data: {
  schoolName: string;
  tcNumber: string;
  studentName: string;
  admissionNo: string;
  dateOfBirth: string;
  className: string;
  sectionName: string;
  admissionDate: string;
  withdrawalDate: string;
  academicYears: string;
  issuedBy: string;
  issuedOn: string;
}): string {
  const rows: Array<[string, string, string]> = [
    ["1.", "Name of the pupil", escapeHtml(data.studentName)],
    ["2.", "Admission number", escapeHtml(data.admissionNo)],
    ["3.", "Date of birth", escapeHtml(data.dateOfBirth)],
    ["4.", "Class & section at leaving", escapeHtml(`${data.className} · ${data.sectionName}`)],
    ["5.", "Date of admission", escapeHtml(data.admissionDate)],
    ["6.", "Classes attended", escapeHtml(data.academicYears)],
    ["7.", "Date of leaving", escapeHtml(data.withdrawalDate)],
    ["8.", "Reason for leaving", "Withdrawal at the request of the parent / guardian"],
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Transfer Certificate — ${escapeHtml(data.studentName)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1c2b26; margin: 0; }
  .sheet { max-width: 178mm; margin: 0 auto; }
  header { text-align: center; border-bottom: 3px double #1c2b26; padding-bottom: 14px; margin-bottom: 10px; }
  .school { font-size: 26px; font-weight: 700; letter-spacing: .04em; margin: 0; }
  .motto { font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #55685f; margin: 6px 0 0; }
  h1 { text-align: center; font-size: 19px; letter-spacing: .3em; text-transform: uppercase; margin: 26px 0 6px; }
  .tc-no { text-align: right; font-size: 13px; margin: 0 0 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
  td { padding: 9px 4px; vertical-align: top; }
  td.no { width: 34px; }
  td.label { width: 260px; font-weight: 700; }
  td.value { border-bottom: 1px solid #c9cec9; }
  .note { font-size: 12.5px; line-height: 1.7; color: #41564e; margin-top: 26px; }
  .sign { display: flex; justify-content: space-between; margin-top: 64px; font-size: 13.5px; }
  .sign div { text-align: center; }
  .sign .line { border-top: 1px solid #1c2b26; padding-top: 6px; min-width: 210px; }
  @media print { .noprint { display: none; } }
  .noprint { text-align: center; margin: 18px 0; }
  .noprint button { font-size: 14px; padding: 10px 26px; border-radius: 999px; border: none; background: #173e38; color: #f6f3e9; cursor: pointer; }
</style></head>
<body><div class="sheet">
  <header>
    <p class="school">${escapeHtml(data.schoolName)}</p>
    <p class="motto">Transfer Certificate</p>
  </header>
  <p class="tc-no">TC No.: <strong>${escapeHtml(data.tcNumber)}</strong></p>
  <h1>Transfer Certificate</h1>
  <table>
    ${rows.map(([no, label, value]) => `<tr><td class="no">${no}</td><td class="label">${label}</td><td class="value">${value}</td></tr>`).join("\n    ")}
  </table>
  <p class="note">This is to certify that the above-named pupil has left the school. The character and conduct of the pupil during the period of study here was satisfactory. All dues have been cleared and this certificate is issued on request.</p>
  <div class="sign">
    <div><div class="line">Class Teacher</div></div>
    <div><div class="line">${escapeHtml(data.issuedBy)}<br/>Principal / School Administrator</div></div>
  </div>
  <p class="note" style="margin-top:30px;">Issued on ${escapeHtml(data.issuedOn)}.</p>
  <div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
</div></body></html>`;
}


  router.get(
    "/academic/students/:studentId/tc",
    requireAuth,
    requireRoles("super_admin", "org_admin", "campus_admin"),
    async (req, res, next) => {
      const user = req.campusUser;
      if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) return void res.status(400).send({ error: { code: "INVALID_REQUEST", message: "Provide a valid student ID." } });

      try {
        const record = await withOrg(user.orgId, async (client) => {
          const student = await client.query<{
            name: string;
            email: string;
            date_of_birth: string | null;
            org_name: string;
          }>(
            `SELECT u.name, u.email, p.date_of_birth, o.name AS org_name
               FROM identity.users u
               JOIN identity.organizations o ON o.id = u.org_id
               LEFT JOIN identity.profiles p ON p.org_id = u.org_id AND p.user_id = u.id
              WHERE u.org_id = $1 AND u.id = $2`,
            [user.orgId, params.data.studentId],
          );
          if (!student.rows[0]) return null;

          const enrollments = await client.query<{
            admission_no: string;
            class_name: string;
            section_name: string;
            academic_year: string;
            started_at: Date;
            ended_at: Date | null;
          }>(
            `SELECT e.admission_no, c.name AS class_name, s.name AS section_name,
                    e.academic_year, e.created_at AS started_at, e.ended_at
               FROM academic.enrollments e
               JOIN academic.sections s ON s.org_id = e.org_id AND s.id = e.section_id
               JOIN academic.classes c ON c.org_id = s.org_id AND c.id = s.class_id
              WHERE e.org_id = $1 AND e.student_user_id = $2
              ORDER BY e.created_at`,
            [user.orgId, params.data.studentId],
          );
          return { student: student.rows[0], enrollments: enrollments.rows };
        });
        if (!record) return void res.status(404).send({ error: { code: "NOT_FOUND", message: "Student not found." } });

        const withdrawnEnrollment = [...record.enrollments].reverse().find((row) => row.ended_at);
        if (!withdrawnEnrollment) {
          return void res.status(409).send({ error: { code: "NOT_WITHDRAWN", message: "A transfer certificate can be issued only after the student's enrollment has ended (withdrawn)." } });
        }

        const years = [...new Set(record.enrollments.map((row) => row.academic_year))];
        const tcNumber = `TC-${withdrawnEnrollment.ended_at!.getFullYear()}-${withdrawnEnrollment.admission_no}`;
        const html = renderTcHtml({
          schoolName: record.student.org_name,
          tcNumber,
          studentName: record.student.name,
          admissionNo: withdrawnEnrollment.admission_no,
          dateOfBirth: record.student.date_of_birth ? fmtDate(record.student.date_of_birth) : "As per admission records",
          className: withdrawnEnrollment.class_name,
          sectionName: withdrawnEnrollment.section_name,
          admissionDate: fmtDate(record.enrollments[0]?.started_at ?? null),
          withdrawalDate: fmtDate(withdrawnEnrollment.ended_at),
          academicYears: years.join(", "),
          issuedBy: user.name,
          issuedOn: fmtDate(new Date()),
        });
        await withOrg(user.orgId, (client) =>
          client.query(
            `INSERT INTO school.certificate_log (org_id, student_user_id, kind, actor_user_id, metadata)
             VALUES ($1, $2, 'tc', $3, $4::jsonb)`,
            [user.orgId, params.data.studentId, user.id, JSON.stringify({ admissionNo: withdrawnEnrollment.admission_no, tcNumber })],
          ),
        );
        res
          .type("text/html; charset=utf-8")
          .header("Cache-Control", "private, no-store")
          .send(html);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/academic/students/:studentId/certificates/:kind",
    requireAuth,
    async (req, res, next) => {
      const user = req.campusUser;
      if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
      const parsed = certificateParams.safeParse(req.params);
      if (!parsed.success) return void res.status(400).send({ error: { code: "INVALID_REQUEST", message: "Provide a valid student and certificate kind." } });
      // Administrators may issue for any student; students only for themselves.
      const isSelf = user.id === parsed.data.studentId;
      const isAdmin = user.roles.some((role) => ["super_admin", "org_admin", "campus_admin"].includes(role));
      if (!isAdmin && !isSelf) {
        return void res.status(403).send({ error: { code: "FORBIDDEN", message: "You can only request your own certificate." } });
      }

      try {
        const record = await withOrg(user.orgId, async (client) => {
          const student = await client.query<{ name: string; org_name: string }>(
            `SELECT u.name, o.name AS org_name
               FROM identity.users u
               JOIN identity.organizations o ON o.id = u.org_id
              WHERE u.org_id = $1 AND u.id = $2 AND u.status = 'active'`,
            [user.orgId, parsed.data.studentId],
          );
          if (!student.rows[0]) return null;
          const enrollment = await client.query<{
            admission_no: string;
            class_name: string;
            section_name: string;
            academic_year: string;
          }>(
            `SELECT DISTINCT e.admission_no, c.name AS class_name, s.name AS section_name, e.academic_year
               FROM academic.enrollments e
               JOIN academic.sections s ON s.org_id = e.org_id AND s.id = e.section_id
               JOIN academic.classes c ON c.org_id = s.org_id AND c.id = s.class_id
              WHERE e.org_id = $1 AND e.student_user_id = $2 AND e.status = 'active'
              ORDER BY e.academic_year DESC`,
            [user.orgId, parsed.data.studentId],
          );
          if (!enrollment.rows[0]) return null;
          const years = await client.query<{ academic_year: string }>(
            `SELECT DISTINCT academic_year FROM academic.enrollments
              WHERE org_id = $1 AND student_user_id = $2 ORDER BY academic_year`,
            [user.orgId, parsed.data.studentId],
          );
          return {
            student: student.rows[0],
            current: enrollment.rows[0],
            years: years.rows.map((row) => row.academic_year),
          };
        });
        if (!record) {
          return void res.status(404).send({ error: { code: "NOT_FOUND", message: "Student or active enrollment not found." } });
        }
        const html = renderCertificateHtml({
          schoolName: record.student.org_name,
          kind: parsed.data.kind,
          studentName: record.student.name,
          className: record.current.class_name,
          sectionName: record.current.section_name,
          admissionNo: record.current.admission_no,
          academicYears: record.years.join(", "),
          issuedBy: user.name,
          issuedOn: fmtDate(new Date()),
        });
        await withOrg(user.orgId, (client) =>
          client.query(
            `INSERT INTO school.certificate_log (org_id, student_user_id, kind, actor_user_id, metadata)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [user.orgId, parsed.data.studentId, parsed.data.kind, user.id, JSON.stringify({ admissionNo: record.current.admission_no })],
          ),
        );
        res
          .type("text/html; charset=utf-8")
          .header("Cache-Control", "private, no-store")
          .send(html);
      } catch (error) {
        next(error);
      }
    },
  );
};

export default routes;
