// BikeFlights /ship scraper — the discounted ground rate we compare against.
// Flow adapted from the approach proven in the Rate-Scraper project
// (Ship From/To via Places autocomplete, address-validation modal, dimension fields).
import { newPage, dismissCookieBanners, checkForCaptcha, parseMoney } from "./shared.js";

const URL = "https://www.bikeflights.com/ship";

export async function scrapeBikeFlights(s) {
  const { context, page } = await newPage();
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 35000 });
    await page.getByText("Ship From", { exact: true }).waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await dismissCookieBanners(page);
    if (await checkForCaptcha(page)) return { rate: null, error: "CAPTCHA / bot-wall", serviceLevel: "Ground" };

    await setLocation(page, "Ship From", s.fromZip);
    await setLocation(page, "Ship To", s.toZip);

    // Dimensions + weight by adjacent label
    const dims = [["Length", s.length], ["Width", s.width], ["Height", s.height], ["Weight", s.weight]];
    for (const [label, val] of dims) {
      const input = page.getByText(label, { exact: true }).locator("..").getByRole("textbox").first();
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.fill(String(val)).catch(() => {});
      }
    }

    // Contents
    await selectContents(page, s.contents);

    // Market value (often required) — use a modest declared value
    const val = page.getByText(/market value/i).locator("..").getByRole("textbox").first();
    if (await val.isVisible({ timeout: 1500 }).catch(() => false)) {
      await val.fill("1000").catch(() => {});
    }

    // Search
    const search = page.getByRole("button", { name: /^search$/i }).first();
    await search.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});

    if (await checkForCaptcha(page)) return { rate: null, error: "CAPTCHA / bot-wall", serviceLevel: "Ground" };

    const rate = await extractGround(page);
    if (rate == null) return { rate: null, error: "No Ground rate returned", serviceLevel: "Ground" };
    return { rate, serviceLevel: "BikeFlights Ground" };
  } catch (e) {
    return { rate: null, error: (e && e.message) || String(e), serviceLevel: "Ground" };
  } finally {
    await context.close().catch(() => {});
  }
}

async function setLocation(page, label, zip) {
  const container = page.getByText(label, { exact: true }).locator("..");
  await container.click({ force: true, timeout: 8000 }).catch(() => {});
  let box = page.getByPlaceholder("Type to search").first();
  if (!(await box.isVisible({ timeout: 2000 }).catch(() => false))) {
    box = container.getByRole("textbox").first();
  }
  await box.fill("").catch(() => {});
  await box.type(`${zip}, USA`, { delay: 80 }).catch(() => {});
  await page.waitForTimeout(2500); // Places API
  // Pick the suggestion that contains the exact zip
  const opt = page.getByRole("option").filter({ hasText: zip }).first();
  if (await opt.isVisible({ timeout: 2500 }).catch(() => false)) {
    await opt.click().catch(() => {});
  } else {
    const li = page.locator("li, [role=option]").filter({ hasText: zip }).first();
    await li.click({ timeout: 2000 }).catch(() => {});
  }
  await handleAddressModal(page);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(800);
}

async function handleAddressModal(page) {
  for (const re of [/use this address/i, /confirm/i, /keep/i, /yes/i, /continue/i]) {
    const btn = page.getByRole("button", { name: re }).first();
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(500);
      return;
    }
  }
}

async function selectContents(page, contents) {
  const trigger = page.getByText(/^Contents$/i).locator("..").first();
  await trigger.click({ force: true, timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  const opt = page.getByText(contents, { exact: true }).first();
  if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
    await opt.click().catch(() => {});
  }
}

async function extractGround(page) {
  const rows = await page.locator("tr, li, div").filter({ hasText: /ground/i }).all().catch(() => []);
  for (const r of rows.slice(0, 40)) {
    const t = await r.innerText().catch(() => "");
    if (/ground/i.test(t) && /\$\s*\d/.test(t)) {
      const m = parseMoney(t);
      if (m) return m;
    }
  }
  const body = (await page.innerText("body").catch(() => "")) || "";
  const m = body.match(/ground[^$]{0,80}\$\s*([0-9]+(?:\.[0-9]{2})?)/i);
  return m ? parseFloat(m[1]) : null;
}
