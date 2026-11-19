// EasyPost rating — one API call returns rates for every carrier on the account.
// We read `retail_rate` (the counter/published price a walk-in pays) for the
// BikeFlights savings comparison, and keep `rate` (EasyPost's discounted price) too.
const API = "https://api.easypost.com/v2/shipments";

export async function easypostRates({ fromZip, toZip, length, width, height, weight }) {
  const key = process.env.EASYPOST_API_KEY;
  if (!key) throw new Error("EASYPOST_API_KEY not set");
  const auth = "Basic " + Buffer.from(key + ":").toString("base64");

  const body = {
    shipment: {
      to_address: { zip: String(toZip), country: "US" },
      from_address: { zip: String(fromZip), country: "US" },
      parcel: {
        length: Number(length),
        width: Number(width),
        height: Number(height),
        weight: Math.round(Number(weight) * 16), // EasyPost parcel weight is in OUNCES
      },
    },
  };

  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data?.error || data) || `HTTP ${res.status}`;
    throw new Error("EasyPost: " + msg);
  }
  return data.rates || [];
}

function num(x) {
  const n = parseFloat(x);
  return Number.isNaN(n) ? null : n;
}

// Pick the cheapest Ground service for a carrier and return its retail + discounted rate.
export function pickGround(rates, carrier) {
  const isCarrier = (c) =>
    carrier === "FedEx" ? /fedex/i.test(c) : new RegExp(`^${carrier}$`, "i").test(c);
  const mine = rates.filter((r) => isCarrier(r.carrier));
  if (!mine.length) return null;

  const ground = mine.filter((r) => /ground|home.?delivery/i.test(r.service));
  const list = (ground.length ? ground : mine).slice().sort((a, b) => num(a.rate) - num(b.rate));
  const r = list[0];
  // Published/retail price a walk-in pays: retail_rate, else list_rate, else the rate.
  const published = num(r.retail_rate) ?? num(r.list_rate) ?? num(r.rate);
  return {
    rate: published,                           // what a regular customer pays
    easypostRate: num(r.rate),                 // EasyPost's discounted price
    serviceLevel: `${r.carrier} ${prettyService(r.service)}`,
    deliveryDays: r.delivery_days ?? null,
  };
}

function prettyService(s) {
  return String(s || "Ground")
    .replace(/_/g, " ")
    .replace(/\bFEDEX\b/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function num2(x) {
  return num(x);
}
