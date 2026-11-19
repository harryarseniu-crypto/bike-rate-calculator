// Shared Playwright plumbing for the carrier scrapers.
// One browser is reused across requests; each scrape gets its own context+page.
import { chromium } from "playwright";

let browserPromise = null;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: process.env.HEADLESS !== "false",
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    });
  }
  return browserPromise;
}

export async function newPage() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  return { context, page };
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close().catch(() => {});
    browserPromise = null;
  }
}

// Best-effort cookie/consent dismissal. Picks the most privacy-preserving option.
export async function dismissCookieBanners(page) {
  const labels = [
    /reject optional/i, /reject all/i, /decline/i,
    /only necessary/i, /essential only/i,
    /accept all/i, /accept/i, /agree/i, /got it/i, /ok/i,
  ];
  for (const re of labels) {
    try {
      const btn = page.getByRole("button", { name: re }).first();
      if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(400);
        return;
      }
    } catch {}
  }
}

// If a CAPTCHA / bot-wall is present we DO NOT try to solve it — we report it.
export async function checkForCaptcha(page) {
  const html = (await page.content().catch(() => "")) || "";
  if (/recaptcha|hcaptcha|px-captcha|are you a human|unusual traffic|verify you are/i.test(html)) {
    return true;
  }
  for (const sel of ['iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', "#px-captcha"]) {
    if (await page.locator(sel).first().isVisible({ timeout: 300 }).catch(() => false)) return true;
  }
  return false;
}

// Pull the first plausible US dollar amount out of a string.
export function parseMoney(text) {
  if (!text) return null;
  const m = String(text).replace(/,/g, "").match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  return m ? parseFloat(m[1]) : null;
}
