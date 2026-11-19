// UPS "Calculate Time and Cost" (classic public rate tool) — published retail rates, no login.
import { newPage, dismissCookieBanners, checkForCaptcha, parseMoney } from "./shared.js";

const URL = "https://wwwapps.ups.com/ctc/request?loc=en_US";

export async function scrapeUPS(s) {
  const { context, page } = await newPage();
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    await dismissCookieBanners(page);
    if (await checkForCaptcha(page)) return { rate: null, error: "CAPTCHA / bot-wall", serviceLevel: "Ground" };

    const setSelect = async (name, value) => {
      await page.locator(`select[name="${name}"]`).selectOption(value).catch(() => {});
    };
    const setText = async (name, value) => {
      const el = page.locator(`[name="${name}"]`).first();
      if (await el.count()) { await el.fill(String(value)).catch(() => {}); }
    };
    const check = async (name, on) => {
      const el = page.locator(`input[name="${name}"]`).first();
      if (await el.count()) { if (on) await el.check().catch(() => {}); else await el.uncheck().catch(() => {}); }
    };

    // Origin / destination (domestic US)
    await setSelect("origCountry", "US");
    await setSelect("destCountry", "US");
    await page.waitForTimeout(500);
    await setText("origPostalCode", s.fromZip);
    await setText("destPostalCode", s.toZip);
    await check("origResident", s.residential);
    await check("destResident", s.residential);

    // Package — "Your Packaging" + dimensions + weight
    for (const n of ["container", "containerSR"]) {
      const sel = page.locator(`select[name="${n}"]`);
      if (await sel.count()) {
        await sel.selectOption({ label: /your packaging/i }).catch(async () => {
          await sel.selectOption({ index: 1 }).catch(() => {});
        });
      }
    }
    await setText("weight", s.weight);
    await setSelect("weightType", "LBS");
    // Two possible dimension field sets depending on the panel in view.
    await setText("packageLength", s.length); await setText("length1", s.length);
    await setText("packageWidth", s.width);   await setText("width1", s.width);
    await setText("packageHeight", s.height); await setText("height1", s.height);

    // Submit
    const submit = page.locator('[name="ctc_submit"], [name="ctc_second_submit"]').first();
    await submit.click({ timeout: 8000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);

    if (await checkForCaptcha(page)) return { rate: null, error: "CAPTCHA / bot-wall", serviceLevel: "Ground" };

    // Find the UPS Ground rate in the results.
    const rate = await extractGround(page);
    if (rate == null) {
      const txt = (await page.innerText("body").catch(() => "")) || "";
      if (/not a valid|invalid|correct the following|error/i.test(txt)) {
        return { rate: null, error: "UPS rejected the address/package", serviceLevel: "Ground" };
      }
      return { rate: null, error: "No Ground rate returned", serviceLevel: "Ground" };
    }
    return { rate, serviceLevel: "UPS Ground" };
  } catch (e) {
    return { rate: null, error: (e && e.message) || String(e), serviceLevel: "Ground" };
  } finally {
    await context.close().catch(() => {});
  }
}

async function extractGround(page) {
  // Strategy: locate a row/section mentioning "Ground" and pull the nearest dollar amount.
  const rows = await page.locator("tr, li, div").filter({ hasText: /ground/i }).all().catch(() => []);
  for (const r of rows.slice(0, 40)) {
    const t = await r.innerText().catch(() => "");
    if (/ground/i.test(t) && /\$\s*\d/.test(t) && !/saver/i.test(t)) {
      const m = parseMoney(t);
      if (m) return m;
    }
  }
  // Fallback: any "UPS Ground" labelled cost on the page via regex over full text.
  const body = (await page.innerText("body").catch(() => "")) || "";
  const m = body.match(/ground[^$]{0,80}\$\s*([0-9]+(?:\.[0-9]{2})?)/i);
  return m ? parseFloat(m[1]) : null;
}
