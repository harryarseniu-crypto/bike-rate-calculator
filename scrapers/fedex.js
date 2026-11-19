// FedEx "Calculate shipping rates" (public, no login) — published rates.
import { newPage, dismissCookieBanners, checkForCaptcha, parseMoney } from "./shared.js";

const URL = "https://www.fedex.com/en-us/online/rating.html";

export async function scrapeFedEx(s) {
  const { context, page } = await newPage();
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByText(/Calculate .*shipping rates/i).first().waitFor({ timeout: 15000 }).catch(() => {});
    await dismissCookieBanners(page);
    if (await checkForCaptcha(page)) return { rate: null, error: "CAPTCHA / bot-wall", serviceLevel: "Ground" };

    // From / To ZIP with autocomplete
    await fillLocation(page, /^From/i, s.fromZip);
    await fillLocation(page, /^To/i, s.toZip);

    // Package weight + dimensions (labels vary; try several)
    await fillByLabel(page, /weight/i, s.weight);
    await fillByLabel(page, /length/i, s.length);
    await fillByLabel(page, /width/i, s.width);
    await fillByLabel(page, /height/i, s.height);

    // Show rates
    const showBtn = page.getByRole("button", { name: /show rates|get rates|calculate|continue/i }).first();
    await showBtn.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    if (await checkForCaptcha(page)) return { rate: null, error: "CAPTCHA / bot-wall", serviceLevel: "Ground" };

    const rate = await extractGround(page);
    if (rate == null) return { rate: null, error: "No Ground rate returned", serviceLevel: "Ground" };
    return { rate, serviceLevel: "FedEx Ground / Home Delivery" };
  } catch (e) {
    return { rate: null, error: (e && e.message) || String(e), serviceLevel: "Ground" };
  } finally {
    await context.close().catch(() => {});
  }
}

async function fillLocation(page, labelRe, zip) {
  // Find the input near the From/To label
  let input = page.getByLabel(labelRe).first();
  if (!(await input.count())) {
    input = page.locator("input").filter({ has: page.locator(":scope") }).first();
  }
  await input.click({ timeout: 6000 }).catch(() => {});
  await input.fill("").catch(() => {});
  await input.type(zip, { delay: 90 }).catch(() => {});
  await page.waitForTimeout(2200);
  // Pick the suggestion containing the zip
  const opt = page.getByRole("option").filter({ hasText: zip }).first();
  if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
    await opt.click().catch(() => {});
  } else {
    await page.keyboard.press("ArrowDown").catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
  }
  await page.waitForTimeout(500);
}

async function fillByLabel(page, labelRe, value) {
  const el = page.getByLabel(labelRe).first();
  if (await el.count()) { await el.fill(String(value)).catch(() => {}); return; }
  const near = page.getByText(labelRe).first().locator("xpath=following::input[1]");
  if (await near.count()) await near.fill(String(value)).catch(() => {});
}

async function extractGround(page) {
  const rows = await page.locator("tr, li, div").filter({ hasText: /ground|home delivery/i }).all().catch(() => []);
  for (const r of rows.slice(0, 40)) {
    const t = await r.innerText().catch(() => "");
    if (/ground|home delivery/i.test(t) && /\$\s*\d/.test(t)) {
      const m = parseMoney(t);
      if (m) return m;
    }
  }
  const body = (await page.innerText("body").catch(() => "")) || "";
  const m = body.match(/(?:ground|home delivery)[^$]{0,80}\$\s*([0-9]+(?:\.[0-9]{2})?)/i);
  return m ? parseFloat(m[1]) : null;
}
