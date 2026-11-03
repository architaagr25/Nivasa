import { expect, test } from "@playwright/test";

// Uses the real model, so it costs a few requests of the free daily quota per run.
test("a buyer asks in Gujarati, books a visit inside the chat and is handed to a person", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "One run is enough; the model quota is small.");
  const mobile = `69${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  await page.goto("/gu/chat?project=project-2");
  await expect(page.getByText("નમસ્તે! હું કેવી રીતે મદદ કરું?")).toBeVisible();

  // A fact question in Gujarati gets a Gujarati answer with the right, cited fact.
  await page
    .getByLabel("ઘર, કિંમત, પઝેશન કે વિઝિટ વિશે પૂછો…")
    .fill("પ્રોજેક્ટ 2 માં પઝેશન ક્યારે મળશે?");
  await page.getByRole("button", { name: "મોકલો" }).click();
  const answer = page.locator("p.whitespace-pre-line").last();
  await expect(answer).toContainText(/જૂન|June/, { timeout: 45_000 });
  await expect(answer).toContainText(/2028|૨૦૨૮/);
  await expect(page.getByText("ફેક્ટ શીટમાંથી:")).toBeVisible();

  // Ask for visit times, tap one, verify the number in the chat, and the visit is booked.
  await page.getByLabel("ઘર, કિંમત, પઝેશન કે વિઝિટ વિશે પૂછો…").fill("સાઇટ વિઝિટ બુક કરવી છે");
  await page.getByRole("button", { name: "મોકલો" }).click();
  const slot = page.getByRole("button", { name: /\d{1,2}:\d{2}/ }).first();
  await expect(slot).toBeVisible({ timeout: 45_000 });
  await slot.click();

  await expect(page.getByText("વિઝિટ પાકી કરવા તમારો મોબાઇલ નંબર વેરિફાય કરો")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByLabel("મોબાઇલ નંબર").fill(mobile);
  await page.getByRole("button", { name: "કોડ મોકલો" }).click();
  const demo = page.getByRole("status").filter({ hasText: "ડેમો મોડ" });
  await expect(demo).toBeVisible();
  await page.getByLabel("વેરિફિકેશન કોડ").fill((await demo.textContent())!.match(/\d{6}/)![0]);
  await page.getByRole("button", { name: "વેરિફાય કરો અને બુક કરો" }).click();

  await expect(page.getByText("વિઝિટ બુક થઈ ગઈ")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "તમારો વિઝિટ પાસ ખોલો" })).toBeVisible();

  // "Talk to a person" hands the buyer to a named executive straight away (already verified).
  await page.getByRole("button", { name: "વ્યક્તિ સાથે વાત કરો" }).click();
  await expect(page.getByText("અમારી ટીમ તમને ફોન કરશે")).toBeVisible({ timeout: 45_000 });
});
