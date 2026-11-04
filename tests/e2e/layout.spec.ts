import { expect, test, type Page } from "@playwright/test";

// Nothing on a buyer page may stick out past the right edge of a small phone, in any language.
// Sideways scrollers (the day tabs) are allowed to hold wider content inside themselves.
async function overflowing(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const inScroller = (e: Element) => {
      for (let a = e.parentElement; a; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if (o === "auto" || o === "scroll" || o === "hidden") return true;
      }
      return false;
    };
    const bad = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > vw + 1 && !inScroller(e);
      })
      .map((e) => `<${e.tagName.toLowerCase()}> "${(e.textContent ?? "").trim().slice(0, 40)}"`);
    return { scrollWidth: document.documentElement.scrollWidth, vw, bad: bad.slice(0, 5) };
  });
}

for (const width of [320, 360]) {
  for (const lang of ["", "/hi", "/gu"]) {
    test(`buyer pages fit a ${width}px screen${lang ? ` (${lang.slice(1)})` : ""}`, async ({
      browser,
    }) => {
      const page = await browser.newPage({ viewport: { width, height: 760 }, isMobile: true });

      await page.goto(`${lang}/book`);
      const slotHref = await page
        .getByRole("tabpanel")
        .getByRole("link")
        .first()
        .getAttribute("href");
      const pages = [
        "/",
        "/projects/project-1",
        "/projects/project-2",
        "/book",
        "/visits",
        "/privacy",
        "/chat",
      ];

      for (const path of [...pages, slotHref!.replace(/^\/(hi|gu)/, "")]) {
        await page.goto(`${lang}${path}`);
        await page.waitForLoadState("networkidle");
        expect(await overflowing(page), `${lang}${path}`).toMatchObject({ bad: [] });
      }

      // Step 2 of booking has the longest content: name, consent text and the mobile field.
      await page.getByRole("main").getByRole("button").first().click();
      await expect(page.getByRole("checkbox")).toBeVisible();
      expect(await overflowing(page), "booking step 2").toMatchObject({ bad: [] });
      await page.close();
    });
  }
}

test("on a phone the menu reaches the projects, the other pages and the staff sign-in", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { width: 360, height: 760 }, isMobile: true });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog");
  for (const name of [/Project 1/, /Project 2/, "Ask a question", "My visits", "Book a visit"]) {
    await expect(menu.getByRole("link", { name })).toBeVisible();
  }
  await menu.getByRole("link", { name: /Project 2/ }).click();
  await page.waitForURL(/\/projects\/project-2$/);
  await expect(menu).toHaveCount(0);

  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Staff sign in" }).click();
  await page.waitForURL(/\/staff\/sign-in/);
  await page.getByRole("link", { name: "Back to the website" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/staff"));
  await page.close();
});
