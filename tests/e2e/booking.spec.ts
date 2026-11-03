import { expect, test } from "@playwright/test";

// A fresh number each run, outside the seeded 70000xxxxx range, so the buyer is new.
const mobile = `69${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

test("a new buyer books a site visit from the project page and cancels it", async ({
  page,
}, info) => {
  // Each browser books a different project so parallel runs never race for the same last seat.
  const projectId = info.project.name === "mobile" ? "project-2" : "project-1";
  const projectName = projectId === "project-2" ? "Project 2" : "Project 1";
  await page.goto(`/projects/${projectId}`);

  // Step 1: pick the first free time in "Visit this week".
  const visit = page.locator("#visit");
  await expect(visit.getByRole("tab").first()).toBeVisible();
  const firstTime = visit.getByRole("tabpanel").getByRole("link").first();
  const chosen = (await firstTime.locator("span").first().textContent())!.trim();
  await firstTime.click();
  await page.waitForURL(/\/book\?slot=/);

  await expect(page.getByRole("heading", { name: "Book a site visit" })).toBeVisible();
  await expect(page.getByText(chosen).first()).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: details, consent, mobile and the one-time code.
  await page.getByLabel("Your name").fill("Test Buyer");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Enter a 10-digit Indian mobile number",
  );

  await page.getByLabel("Mobile number").fill(mobile);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("tick the box");

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send code" }).click();
  const demo = page.getByRole("status").filter({ hasText: "Demo mode" });
  await expect(demo).toBeVisible();
  const code = (await demo.textContent())!.match(/\d{6}/)![0];

  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify and book" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("didn't match");

  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify and book" }).click();

  // Step 3: the visit pass.
  await page.waitForURL(/\/visits\/VS-\d+$/);
  await expect(page.getByRole("heading", { name: "Your site visit" })).toBeVisible();
  // Next keeps the previous screen mounted (hidden) for instant back navigation, so only
  // visible matches count from here on.
  const shown = (text: string | RegExp) =>
    page.getByText(text, { exact: typeof text === "string" }).filter({ visible: true });
  await expect(shown("Confirmed")).toBeVisible();
  await expect(shown(chosen).first()).toBeVisible();
  await expect(shown("Show this at the site office")).toBeVisible();
  await expect(page.getByRole("link", { name: /Add to calendar/ })).toBeVisible();

  // It appears in My visits.
  await page.getByRole("link", { name: "All my visits" }).click();
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(projectName) })
    .first()
    .click();

  // Cancel it and the seat is released.
  await page.getByRole("button", { name: "Cancel visit" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel visit" }).click();
  await expect(shown(/This visit was cancelled/)).toBeVisible();
});
