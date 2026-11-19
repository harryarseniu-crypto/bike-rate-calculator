import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { boxFor } from "./lib/boxes.js";
import { easypostRates, pickGround } from "./lib/easypost.js";
import { upsRate, upsConfigured } from "./lib/ups.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

app.post("/api/rates", async (req, res) => {
  const { fromZip, toZip, box = "bbm", contents = "Complete Bicycle", weight } = req.body || {};
  if (!/^\d{5}$/.test(String(fromZip || "")) || !/^\d{5}$/.test(String(toZip || ""))) {
    return res.status(400).json({ error: "Both fromZip and toZip must be 5-digit US ZIP codes." });
  }

  const b = boxFor(box);
  const w = Number(weight) > 0 ? Math.round(Number(weight)) : b.defaultWeight;
  const parcel = { fromZip, toZip, length: b.length, width: b.width, height: b.height, weight: w };

  const t0 = Date.now();
  let ups = { rate: null, error: "Unavailable", serviceLevel: "UPS Ground" };
  let fedex = { rate: null, error: "Unavailable", serviceLevel: "FedEx Ground" };
  let note = null;

  // FedEx (and USPS) come from EasyPost; UPS comes from the UPS API when configured.
  try {
    const rates = await easypostRates(parcel);
    const f = pickGround(rates, "FedEx");
    if (f) fedex = f; else { fedex = { rate: null, error: "No FedEx Ground rate", serviceLevel: "FedEx Ground" }; }
    const u = pickGround(rates, "UPS");
    if (u) ups = u; // EasyPost had a UPS rate
  } catch (e) {
    note = "EasyPost error: " + (e.message || String(e));
  }

  // Prefer the direct UPS Rating API (published/list rates) when credentials exist.
  if (upsConfigured()) {
    try {
      ups = await upsRate(parcel);
    } catch (e) {
      ups = { rate: null, error: "UPS: " + (e.message || String(e)), serviceLevel: "UPS Ground" };
    }
  } else if (ups.rate == null) {
    // No UPS keys yet — show a clearly-labeled demo figure so the full UI renders.
    ups = fedex.rate != null
      ? { rate: Math.round(fedex.rate * 1.05 * 100) / 100, serviceLevel: "UPS Ground (demo)", demo: true }
      : { rate: null, error: "UPS keys pending", serviceLevel: "UPS Ground" };
  }

  // BikeFlights has no API — for now estimate it from the best discounted ground rate.
  // (BikeFlights resells UPS/FedEx ground at negotiated rates in this ballpark.)
  const discounted = [ups.easypostRate, fedex.easypostRate].filter((x) => x != null);
  const bikeflights = discounted.length
    ? { rate: Math.round(Math.min(...discounted) * 100) / 100, serviceLevel: "BikeFlights Ground", estimate: true }
    : { rate: null, error: "Estimate unavailable", serviceLevel: "BikeFlights Ground", estimate: true };

  res.json({
    route: { fromZip, toZip, boxName: b.name, dims: `${b.length}×${b.width}×${b.height} in`, weight: w, contents },
    bikeflights, ups, fedex,
    mode: String(process.env.EASYPOST_API_KEY || "").startsWith("EZTK") ? "test" : "production",
    note,
    tookMs: Date.now() - t0,
  });
});

const PORT = process.env.PORT || 5178;
app.listen(PORT, () => console.log(`Rate calculator on http://localhost:${PORT}  (EasyPost ${String(process.env.EASYPOST_API_KEY||"").startsWith("EZTK") ? "TEST" : "PROD"} mode)`));
