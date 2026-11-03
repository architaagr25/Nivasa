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
});
