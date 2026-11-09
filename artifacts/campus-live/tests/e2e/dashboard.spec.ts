import { expect, test, type Page } from "@playwright/test";

const organization = process.env.DASHBOARD_E2E_ORG ?? "demo";
const seededPassword = process.env.DASHBOARD_E2E_PASSWORD ?? "Passw0rd!";
const desktop = { width: 1440, height: 1000 };
const mobile = { width: 390, height: 844 };

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByTestId("input-organization").fill(organization);
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(seededPassword);
  await page.getByTestId("button-submit-login").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("h1").first()).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page, "dashboard should not scroll horizontally").toBeLessThanOrEqual(dimensions.viewport);
}

async function expectDashboardData(page: Page, administrator = false) {
  const metricCards = page.locator(".dashboard-metric");
  await expect(metricCards).toHaveCount(4);
  for (const card of await metricCards.all()) {
    await expect(card.locator(".dashboard-metric-top > span")).not.toBeEmpty();
    await expect(card.locator(".dashboard-metric-value")).not.toBeEmpty();
  }

  const sessions = page.locator(".dashboard-sessions");
  if (administrator) {
    const schedule = page.getByTestId("dashboard-timetable-today");
    await expect(schedule.getByRole("heading", { name: "Today’s timetable" })).toBeVisible();
    await expect.poll(async () =>
      (await schedule.locator(".dashboard-day-slot").count()) +
      (await schedule.locator(".dashboard-schedule-empty").count()),
    ).toBeGreaterThan(0);
    if (await schedule.locator(".dashboard-day-slot").count()) {
      await expect(schedule.locator(".dashboard-day-slot").first()).toBeVisible();
    } else {
      await expect(schedule.locator(".dashboard-schedule-empty")).toBeVisible();
    }
  } else {
    await expect(sessions.getByRole("heading", { name: "Coming up" })).toBeVisible();
    if (await sessions.locator(".dashboard-session").count()) {
      await expect(sessions.locator(".dashboard-session").first()).toBeVisible();
    } else {
      await expect(sessions.getByText("No upcoming sessions have been scheduled.")).toBeVisible();
    }
  }

  const activity = page.locator(".dashboard-activity");
  await expect(activity.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  if (await activity.locator(".dashboard-activity-item").count()) {
    await expect(activity.locator(".dashboard-activity-item").first()).toBeVisible();
  } else {
    await expect(activity.getByText("No recent updates to show.")).toBeVisible();
  }
}

async function expectAdminInsights(page: Page) {
  const insights = page.getByTestId("dashboard-admin-insights");
  await expect(insights).toBeVisible();
  await expect(insights.getByRole("heading", { name: "Today’s register" })).toBeVisible();
  await expect(insights.getByRole("heading", { name: "Fee collection" })).toBeVisible();
  await expect(insights.getByText("Total issued", { exact: true })).toBeVisible();
  await expect(insights.getByText("Collected", { exact: true })).toBeVisible();
  await expect(insights.getByText("Outstanding", { exact: true })).toBeVisible();
  await expect(insights.getByText("Overdue invoices", { exact: true })).toBeVisible();
  await expect(insights.getByTestId("dashboard-collection-progress").getByRole("progressbar")).toBeVisible();
  const attendance = insights.getByTestId("dashboard-attendance-insight");
  const attendanceProgress = attendance.getByRole("progressbar");
  if (await attendanceProgress.count()) {
    await expect(attendanceProgress).toHaveAttribute("aria-label", /among marked students/);
    await expect(attendance.getByText(/present of .* marked/)).toBeVisible();
  } else {
    await expect(attendance.getByText("Not recorded yet")).toBeVisible();
  }
  await expect(insights.getByTestId("dashboard-fee-trend")).toHaveCount(0);
  await expect(insights.getByRole("link", { name: /Review fees/ })).toHaveAttribute("href", "/fees");
}

test("administrator dashboard data, navigation, and theme controls fit desktop and mobile", async ({ page }) => {
  const overviewResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/dashboard/overview" &&
    response.request().method() === "GET",
  );
  await signIn(page, process.env.DASHBOARD_E2E_ADMIN_EMAIL ?? "admin@demo.edu");
  const overviewResponse = await overviewResponsePromise;
  expect(overviewResponse.ok()).toBeTruthy();
  const feeSummary = (await overviewResponse.json()).adminInsights.fees;
  expect(feeSummary.academicYear).toMatch(/^\d{4}-\d{2}$/);
  expect(feeSummary.totalFeesThisYearPaise).toBe(
    feeSummary.collectedThisYearPaise + feeSummary.outstandingThisYearPaise,
  );
  expect(feeSummary.collectionPercentThisYear).toBe(
    feeSummary.totalFeesThisYearPaise === 0
      ? null
      : Math.round(feeSummary.collectedThisYearPaise / feeSummary.totalFeesThisYearPaise * 1000) / 10,
  );
  const academicYearSelect = page.getByTestId("dashboard-academic-year-select");
  await expect(academicYearSelect).toBeVisible();
  await expect(academicYearSelect).toHaveValue(feeSummary.academicYear);
  const yearOptions = await academicYearSelect.locator("option").evaluateAll(options =>
    options.map(option => (option as HTMLOptionElement).value).filter(Boolean),
  );
  const alternateAcademicYear = yearOptions.find(year => year !== feeSummary.academicYear);
  expect(alternateAcademicYear, "the demo school should have another academic year to select").toBeTruthy();
  const alternateYearResponsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/dashboard/overview"
      && response.request().method() === "GET"
      && url.searchParams.get("academicYear") === alternateAcademicYear;
  });
  await academicYearSelect.selectOption(alternateAcademicYear!);
  const alternateYearResponse = await alternateYearResponsePromise;
  expect(alternateYearResponse.ok()).toBeTruthy();
  expect((await alternateYearResponse.json()).adminInsights.fees.academicYear).toBe(alternateAcademicYear);

  await page.setViewportSize(desktop);
  await expectDashboardData(page, true);
  await expectAdminInsights(page);
  await expectNoHorizontalOverflow(page);
  const overviewOrder = await page.locator(".dashboard-content").evaluate((content) => {
    const relevant = ["dashboard-metrics", "dashboard-admin-insights", "dashboard-admin-actions", "dashboard-panels"];
    return Array.from(content.children)
      .map((child) => relevant.find((className) => child.classList.contains(className)))
      .filter((className): className is string => Boolean(className));
  });
  expect(overviewOrder.slice(0, 4)).toEqual([
    "dashboard-admin-insights",
    "dashboard-metrics",
    "dashboard-admin-actions",
    "dashboard-panels",
  ]);
  const desktopInsightsHeight = await page.getByTestId("dashboard-admin-insights").evaluate((element) => element.getBoundingClientRect().height);
  expect(desktopInsightsHeight).toBeLessThan(220);
  await expect(page.getByTestId("link-nav-admissions")).toBeVisible();
  const quickActions = page.getByTestId("dashboard-admin-actions");
  await expect(quickActions).toBeVisible();
  await expect(page.getByTestId("dashboard-action-admissions")).toHaveAttribute("href", "/admin/admissions");
  await expect(page.getByTestId("dashboard-action-attendance")).toHaveAttribute("href", "/attendance");
  await expect(page.getByTestId("dashboard-action-announcements")).toHaveAttribute("href", "/announcements");
  await expect(page.getByTestId("dashboard-action-fees")).toHaveAttribute("href", "/fees");
  await page.getByTestId("dashboard-action-admissions").click();
  await expect(page).toHaveURL(/\/admin\/admissions$/);
  await page.getByTestId("link-nav-overview").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const feesLink = page.getByTestId("link-nav-fees");
  await feesLink.scrollIntoViewIfNeeded();
  await expect(feesLink).toBeInViewport();
  await expect(page.getByTestId("link-nav-privacy-&-consent")).toHaveCount(0);

  const desktopMetricsColumns = await page.locator(".dashboard-metrics").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(desktopMetricsColumns).toBe(4);

  const totalStudentsLink = page.getByRole("link", { name: /View the total student list/ });
  await expect(totalStudentsLink).toHaveAttribute("href", "/admin/students");
  await totalStudentsLink.click();
  await expect(page).toHaveURL(/\/admin\/students$/);
  const studentSearch = page.getByTestId("input-search-students");
  await expect(studentSearch).toBeVisible();
  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/academic/students" && url.searchParams.get("q") === "student1@demo.edu";
  });
  await studentSearch.fill("student1@demo.edu");
  expect((await searchResponse).ok()).toBeTruthy();
  await page.getByTestId("link-nav-overview").click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const themeButton = page.getByTestId("button-theme");
  await expect(themeButton).toBeVisible();
  await themeButton.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await themeButton.click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.getByTestId("link-nav-live-classes").click();
  await expect(page).toHaveURL(/\/live\/sessions$/);
  await page.getByTestId("link-nav-overview").click();
  await page.getByRole("link", { name: /Browse smartboards/ }).click();
  await expect(page).toHaveURL(/\/boards\/templates$/);

  await page.getByTestId("link-nav-overview").click();
  await page.setViewportSize(mobile);
  await expectDashboardData(page, true);
  await expectAdminInsights(page);
  await expectNoHorizontalOverflow(page);
  const mobileMetricsColumns = await page.locator(".dashboard-metrics").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(mobileMetricsColumns).toBe(2);
  const mobileInsightsColumns = await page.getByTestId("dashboard-admin-insights").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(mobileInsightsColumns).toBe(1);
  const mobileInsightsHeight = await page.getByTestId("dashboard-admin-insights").evaluate((element) => element.getBoundingClientRect().height);
  expect(mobileInsightsHeight).toBeLessThan(360);
  const mobileQuickActionColumns = await page.locator(".admin-quick-actions").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(mobileQuickActionColumns).toBe(2);

  await page.getByTestId("button-open-navigation").click();
  await expect(page.getByTestId("link-nav-admissions")).toBeVisible();
  await feesLink.scrollIntoViewIfNeeded();
  await expect(feesLink).toBeInViewport();
  await expect(page.getByTestId("button-theme")).toBeVisible();

  await page.getByTestId("link-nav-overview").click();
  await page.getByTestId("button-open-navigation").click();
  await page.getByTestId("link-nav-live-classes").click();
  await expect(page).toHaveURL(/\/live\/sessions$/);
  await page.getByTestId("button-open-navigation").click();
  await page.getByTestId("link-nav-overview").click();
  await page.getByRole("link", { name: /Browse smartboards/ }).click();
  await expect(page).toHaveURL(/\/boards\/templates$/);
});

test("teacher navigation stays role-aware and theme control remains reachable on mobile", async ({ page }) => {
  await signIn(page, process.env.DASHBOARD_E2E_TEACHER_EMAIL ?? "teacher@demo.edu");
  await page.setViewportSize(desktop);
  await expectDashboardData(page);
  await expect(page.getByTestId("dashboard-admin-insights")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-academic-year-select")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-admin-actions")).toHaveCount(0);
  await expect(page.getByTestId("link-nav-students")).toBeVisible();
  await expect(page.getByTestId("link-nav-admissions")).toHaveCount(0);
  await expect(page.getByTestId("link-nav-fees")).toHaveCount(0);
  await expect(page.getByTestId("link-nav-privacy-&-consent")).toHaveCount(0);

  await page.setViewportSize(mobile);
  await expectNoHorizontalOverflow(page);
  await page.getByTestId("button-open-navigation").click();
  await expect(page.getByTestId("button-theme")).toBeVisible();
  await expect(page.getByTestId("link-nav-live-classes")).toBeVisible();
  await expect(page.getByTestId("link-nav-admissions")).toHaveCount(0);
});

test("student accounts cannot open the student directory", async ({ page }) => {
  await signIn(page, "student1@demo.edu");
  await expect(page.getByTestId("student-overview-dashboard")).toBeVisible();
  await expect(page.getByTestId("student-thought-of-the-day")).toBeVisible();
  await expect(page.getByTestId("student-insight-cards")).toBeVisible();
  await expect(page.getByTestId("student-attendance-value")).toBeVisible();
  await expect(page.getByTestId("student-assignment-value")).toBeVisible();
  await expect(page.getByTestId("student-results-value")).toBeVisible();
  await expect(page.getByTestId("student-fees-value")).toBeVisible();
  await expect(page.locator(".dashboard-metric")).toHaveCount(0);
  await expect(page.getByText("Across the school", { exact: true })).toHaveCount(0);
  await page.setViewportSize(mobile);
  await expectNoHorizontalOverflow(page);
  const insightColumns = await page.getByTestId("student-insight-cards").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(insightColumns).toBe(2);

  await expect(page.getByTestId("link-nav-students")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-admin-actions")).toHaveCount(0);

  // Keep the in-memory auth token while exercising a client-side deep link.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/admin/students");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/admin\/students$/);
  await expect(page.getByRole("heading", { name: "404 Page Not Found" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Student roster" })).toHaveCount(0);
  await expect(page.locator("[data-testid^='student-row-']")).toHaveCount(0);
});

test("assignment form filters sections by the selected class", async ({ page }) => {
  await signIn(page, process.env.DASHBOARD_E2E_ADMIN_EMAIL ?? "admin@demo.edu");
  const sectionsResponsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/academic/sections" &&
    response.request().method() === "GET",
  );
  await page.goto("/learning");
  const sectionsResponse = await sectionsResponsePromise;
  expect(sectionsResponse.ok()).toBeTruthy();
  const sectionItems = (await sectionsResponse.json()).items as { id: string; classId: string }[];

  await page.getByRole("button", { name: "Assignment", exact: true }).click();
  const classSelect = page.getByTestId("select-assignment-class");
  const sectionSelect = page.getByTestId("select-assignment-section");
  await expect(classSelect).toBeVisible();
  await expect(sectionSelect).toBeVisible();

  const classOptions = await classSelect.locator("option").evaluateAll(options =>
    options.filter(option => (option as HTMLOptionElement).value).map(option => (option as HTMLOptionElement).value),
  );
  expect(classOptions.length).toBeGreaterThan(0);
  const selectedClassId = classOptions[classOptions.length - 1];
  await classSelect.selectOption(selectedClassId);

  const visibleSectionIds = await sectionSelect.locator("option").evaluateAll(options =>
    options.filter(option => (option as HTMLOptionElement).value).map(option => (option as HTMLOptionElement).value),
  );
  const expectedSectionIds = sectionItems.filter(section => section.classId === selectedClassId).map(section => section.id);
  expect(visibleSectionIds).toEqual(expectedSectionIds);
});
