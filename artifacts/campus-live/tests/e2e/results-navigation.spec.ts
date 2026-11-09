import { expect, test, type Page } from "@playwright/test";

const publishedReport = {
  id: "report-card-fixture",
  studentName: "Student Fixture",
  admissionNo: "ADM-001",
  sectionName: "Grade 1 · A",
  termName: "Term 1",
  overallPercent: 92,
  overallGrade: "A",
  rank: 1,
  totalStudents: 24,
  attendancePercent: 98,
  published: true,
  publishedAt: "2026-11-01T00:00:00.000Z",
  generalRemark: "",
  subjects: [],
};

async function mockWorkspace(page: Page, roles: string[]) {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], total: 0 };
    if (path === "/api/identity/me") {
      body = {
        id: "fixture-user",
        name: "Fixture User",
        email: "user@fixture.invalid",
        roles,
        mustChangePassword: false,
      };
    } else if (path === "/api/learning/report-cards") {
      body = { items: roles.includes("student") ? [publishedReport] : [], total: roles.includes("student") ? 1 : 0 };
    }
    await route.fulfill({ json: body });
  });
}

test("academic results are separate from staff assessment management", async ({ page }) => {
  await mockWorkspace(page, ["campus_admin"]);

  await page.goto("/results");
  await expect(page.getByRole("heading", { name: "Academic results", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assessments", exact: true })).toHaveCount(0);
  await expect(page.getByText("Report card cycle")).toBeVisible();

  await page.goto("/learning");
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await expect(page.getByRole("button", { name: "Assessment", exact: true })).toBeVisible();
  await expect(page.getByText("No assessments available")).toBeVisible();
});

test("students see published academic report cards without assessment controls", async ({ page }) => {
  await mockWorkspace(page, ["student"]);

  await page.goto("/results");
  await expect(page.getByRole("heading", { name: "Academic results", exact: true })).toBeVisible();
  await expect(page.getByText("Student Fixture")).toBeVisible();
  await expect(page.getByRole("button", { name: "Assessments", exact: true })).toHaveCount(0);

  await page.goto("/learning");
  await expect(page.getByRole("button", { name: "Assessments", exact: true })).toHaveCount(0);
});
