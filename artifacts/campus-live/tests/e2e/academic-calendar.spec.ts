import { expect, test } from "@playwright/test";

const organization = process.env.DASHBOARD_E2E_ORG ?? "demo";
const seededPassword = process.env.DASHBOARD_E2E_PASSWORD ?? "Passw0rd!";

test("school administrators can add, edit, and remove an academic calendar event", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("input-organization").fill(organization);
  await page.getByTestId("input-email").fill(process.env.DASHBOARD_E2E_ADMIN_EMAIL ?? "admin@demo.edu");
  await page.getByTestId("input-password").fill(seededPassword);
  await page.getByTestId("button-submit-login").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId("link-nav-academic-calendar").click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("heading", { name: "Academic calendar" })).toBeVisible();

  await page.getByRole("button", { name: "Add calendar event" }).click();
  const form = page.getByTestId("calendar-event-form");
  const title = `Playwright calendar event ${Date.now()}`;
  await form.getByLabel("Event title").fill(title);
  await form.getByLabel("Type").selectOption("event");
  const eventDate = await form.getByLabel("Starts").inputValue();
  await form.getByLabel("Ends").fill(eventDate);
  await form.getByLabel("Details Optional").fill("Calendar event created by the browser test.");
  await form.getByRole("button", { name: "Add event" }).click();

  const firstCard = page.locator(".calendar-agenda-item").filter({ hasText: title });
  await expect(firstCard).toBeVisible();
  await firstCard.getByRole("button", { name: "Edit" }).click();
  await form.getByLabel("Event title").fill(`${title} updated`);
  await form.getByRole("button", { name: "Save changes" }).click();

  const updatedCard = page.locator(".calendar-agenda-item").filter({ hasText: `${title} updated` });
  await expect(updatedCard).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await updatedCard.getByRole("button", { name: "Remove" }).click();
  await expect(updatedCard).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Calendar event removed.");
});

test("students can view the calendar on a phone but cannot change it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByTestId("input-organization").fill(organization);
  await page.getByTestId("input-email").fill(process.env.DASHBOARD_E2E_STUDENT_EMAIL ?? "student1@demo.edu");
  await page.getByTestId("input-password").fill(seededPassword);
  await page.getByTestId("button-submit-login").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Academic calendar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add calendar event" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(390);
});
