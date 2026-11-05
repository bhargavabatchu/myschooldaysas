import { expect, test, type Page } from "@playwright/test";

const organization = process.env.DASHBOARD_E2E_ORG ?? "demo";
const seededPassword = process.env.DASHBOARD_E2E_PASSWORD ?? "Passw0rd!";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByTestId("input-organization").fill(organization);
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(seededPassword);
  await page.getByTestId("button-submit-login").click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const lessonId = "f1f5111b-769d-40b7-a1fd-d6528d91d301";
const topicId = "b247b03e-b202-4c24-9812-7a51547bf385";
const materialId = "3a13ac9e-8c90-48a0-9bfe-44f376a98712";
const classId = "534aaad6-b810-490b-9821-c87a67f9cc1a";
const subjectId = "6594dff4-8770-43a6-ac6f-22005416053c";

test("students can browse their shared syllabus and open linked materials", async ({ page }) => {
  await signIn(page, "student1@demo.edu");
  await page.route("**/api/learning/syllabus**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items: [{
        syllabusId: "12a500fc-8721-4b9b-b399-0a0f27e54167",
        classId,
        className: "Grade 1",
        subjectId,
        subjectName: "Mathematics",
        lessons: [{
          id: lessonId,
          title: "Fractions",
          description: "Recognize equal parts of a whole.",
          position: 0,
          topics: [{
            id: topicId,
            title: "Halves and quarters",
            description: "Compare simple fractions.",
            position: 0,
            materials: [{
              id: materialId,
              title: "Fractions lesson video",
              kind: "video",
              url: "https://example.org/fractions",
              description: "",
              position: 0,
            }],
          }],
        }],
      }],
      total: 1,
    }),
  }));

  await page.goto("/learning/syllabus");
  await expect(page.getByRole("heading", { name: "Syllabus & learning materials" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fractions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Halves and quarters" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Fractions lesson video/ })).toHaveAttribute("href", "https://example.org/fractions");
  await expect(page.getByRole("button", { name: "Add lesson" })).toHaveCount(0);
});

test("administrators can create class-shared syllabus lessons", async ({ page }) => {
  await signIn(page, process.env.DASHBOARD_E2E_ADMIN_EMAIL ?? "admin@demo.edu");
  let lessonAdded = false;
  await page.route("**/api/learning/syllabus**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items: [{
        syllabusId: lessonAdded ? "12a500fc-8721-4b9b-b399-0a0f27e54167" : null,
        classId,
        className: "Grade 1",
        subjectId,
        subjectName: "Mathematics",
        lessons: lessonAdded ? [{
          id: lessonId,
          title: "Numbers to 100",
          description: "",
          position: 0,
          topics: [],
        }] : [],
      }],
      total: 1,
    }),
  }));
  await page.route("**/api/learning/syllabus/lessons", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const request = route.request().postDataJSON();
    expect(request).toMatchObject({ classId, subjectId, title: "Numbers to 100" });
    lessonAdded = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: lessonId, title: "Numbers to 100", description: "", position: 0, topics: [] }),
    });
  });

  await page.goto("/learning/syllabus");
  await page.getByRole("button", { name: "Add lesson" }).click();
  await page.getByLabel("Title").fill("Numbers to 100");
  await page.getByRole("button", { name: "Add lesson", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Numbers to 100" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add topic" })).toBeVisible();
});

test("students only see their enrolled class syllabus options from the API", async ({ page }) => {
  await signIn(page, process.env.DASHBOARD_E2E_STUDENT_EMAIL ?? "student1@demo.edu");
  await page.goto("/learning/syllabus");
  await expect.poll(() => page.getByLabel("Class").locator("option").count(), { timeout: 15000 }).toBeGreaterThan(1);
  await expect.poll(() => page.getByLabel("Subject").locator("option").count(), { timeout: 15000 }).toBeGreaterThan(1);
  await expect(page.getByRole("button", { name: "Add lesson" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No lessons published yet" })).toBeVisible();
});

test("a school admin can add and remove linked syllabus content", async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page, process.env.DASHBOARD_E2E_ADMIN_EMAIL ?? "admin@demo.edu");
  await page.goto("/learning/syllabus");

  const lessonTitle = `Syllabus check ${Date.now()}`;
  const topicTitle = `Topic check ${Date.now()}`;
  try {
    await expect.poll(() => page.getByLabel("Class").locator("option").count()).toBeGreaterThan(1);
    const staleLesson = page.getByRole("heading", { name: /^Syllabus check / }).first();
    if (await staleLesson.count()) {
      const staleTitle = await staleLesson.textContent();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: `Delete ${staleTitle}` }).click();
      await expect(staleLesson).toHaveCount(0);
    }

    await page.getByRole("button", { name: "Add lesson" }).click();
    await page.getByLabel("Title").fill(lessonTitle);
    await page.getByRole("button", { name: "Add lesson", exact: true }).last().click();
    await expect(page.getByRole("heading", { name: lessonTitle })).toBeVisible();

    await page.getByRole("button", { name: "Add topic" }).click();
    await page.getByLabel("Title").fill(topicTitle);
    await page.locator("form").last().getByRole("button", { name: "Add topic", exact: true }).click();
    await expect(page.getByRole("heading", { name: topicTitle })).toBeVisible();

    await page.getByRole("button", { name: "Add document or video" }).click();
    await page.getByLabel("Resource title").fill("Syllabus sample video");
    await page.getByLabel("Secure link (HTTPS)").fill("https://example.org/syllabus-video");
    await page.getByRole("button", { name: "Add link" }).click();
    await expect(page.getByRole("link", { name: /Syllabus sample video/ })).toHaveAttribute("href", "https://example.org/syllabus-video");
  } finally {
    const deleteButton = page.getByRole("button", { name: `Delete ${lessonTitle}` });
    if (await deleteButton.count()) {
      page.once("dialog", (dialog) => dialog.accept());
      await deleteButton.click();
      await expect(page.getByRole("heading", { name: lessonTitle })).toHaveCount(0);
    }
  }
});
