import { expect, test, type Browser } from "@playwright/test";

const PASSWORD = "NivasaDemo#2026";

async function signIn(browser: Browser, email: string) {
  const page = await browser.newPage();
  await page.goto("/staff/sign-in");
  // Typed straight away, before the page has finished loading, as an impatient user would.
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/staff\/leads/);
  await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
  return page;
}

test.describe("staff access", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "Runs once.");
  });

  test("signed-out visitors and buyers can't open the sales workspace", async ({ page }) => {
    await page.goto("/staff/leads");
    await page.waitForURL(/\/staff\/sign-in/);

    await page.goto("/staff/leads/LD-58211");
    await page.waitForURL(/\/staff\/sign-in/);
  });

  test("a wrong password is refused with a clear message", async ({ page }) => {
    await page.goto("/staff/sign-in");
    await page.getByLabel("Work email").fill("meera@nivasa.demo");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("don't match");
  });

  test("the sales head sees every lead with full numbers and the handoff summary", async ({
    browser,
  }) => {
    const page = await signIn(browser, "meera@nivasa.demo");
    await page.goto("/staff/leads/LD-58211");
    await expect(page.getByText("Handoff summary")).toBeVisible();
    await expect(page.locator("header a[href^='tel:']")).toBeVisible();
  });

  test("an executive can't open another executive's lead, sees unassigned numbers masked, and can take one", async ({
    browser,
  }) => {
    const page = await signIn(browser, "rahul@nivasa.demo");

    // LD-58211 belongs to a Project 2 executive.
    await page.goto("/staff/leads/LD-58211");
    await expect(page.getByText(/could not be found/i)).toBeVisible();

    await page.goto("/staff/leads?view=unassigned");
    const withPhone = page.locator("tbody tr").filter({ hasText: "+91" }).first();
    await expect(withPhone).toContainText("•••");
    await withPhone.locator("a").first().click();
    await expect(page.locator("header a[href^='tel:']")).toHaveCount(0);

    await page.getByRole("button", { name: "Take this lead" }).click();
    await expect(page.locator("header a[href^='tel:']")).toBeVisible();
  });

  test("scanning a visit pass while signed out comes back to the pass after signing in", async ({
    page,
  }) => {
    await page.goto("/staff/check-in/not-a-real-pass-123");
    await page.waitForURL(/\/staff\/sign-in\?next=/);
    await page.getByLabel("Work email").fill("harsh@nivasa.demo");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/staff\/check-in\/not-a-real-pass-123$/);
    await expect(page.getByText("This code isn't recognised")).toBeVisible();
  });

  test("the visits calendar moves between days and weeks", async ({ browser }) => {
    const page = await signIn(browser, "meera@nivasa.demo");
    await page.getByRole("link", { name: "Visits" }).first().click();
    await expect(page.getByRole("heading", { name: "Visits", exact: true })).toBeVisible();
    const day = page.getByRole("heading", { level: 2 }).first();
    const today = await day.textContent();
    await page.getByRole("link", { name: "Next day" }).click();
    await expect(day).not.toHaveText(today!);
    await page.getByRole("link", { name: "Week", exact: true }).click();
    await expect(page).toHaveURL(/view=week/);
    await expect(page.locator("main ol > li")).toHaveCount(7);
  });

  test("only the sales head reviews flagged chats and duplicates", async ({ browser }) => {
    const exec = await signIn(browser, "rahul@nivasa.demo");
    await expect(exec.getByRole("link", { name: "Review" })).toHaveCount(0);
    await exec.goto("/staff/review");
    await exec.waitForURL(/\/staff\/leads\?denied=1/);

    const head = await signIn(browser, "meera@nivasa.demo");
    await head
      .getByRole("link", { name: /Review/ })
      .first()
      .click();
    await expect(head.getByRole("link", { name: /Flagged chats/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await head.getByRole("link", { name: /Possible duplicates/ }).click();
    // The tab switches at once; the list follows when the server has rendered it.
    await expect(head.getByRole("link", { name: /Possible duplicates/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(head.getByText(/Leads with the same number are merged automatically/)).toBeVisible(
      {
        timeout: 60_000,
      },
    );
    await expect(head).toHaveURL(/tab=duplicates/);
  });

  test("only the sales head edits the fact sheet and visiting times", async ({ browser }) => {
    const exec = await signIn(browser, "harsh@nivasa.demo");
    await expect(exec.getByRole("link", { name: "Fact sheet & slots" })).toHaveCount(0);
    await exec.goto("/staff/admin?tab=slots");
    await exec.waitForURL(/\/staff\/leads\?denied=1/);

    const head = await signIn(browser, "meera@nivasa.demo");
    await head.goto("/staff/admin");
    await expect(head.getByRole("heading", { name: /^Live: version \d+/ })).toBeVisible();
    await expect(head.getByText("P1-POS")).toBeVisible();
    await head.getByRole("link", { name: "Visiting times" }).click();
    await expect(head.getByRole("button", { name: "Save visiting times" })).toBeDisabled();
  });
});
