// UPS Rating API (direct) — OAuth client-credentials + Rating "Shop".
// Returns the published UPS Ground rate. No account number is sent, so UPS
// returns standard list/published rates (what a walk-in pays).
//
// Env:
//   UPS_CLIENT_ID, UPS_CLIENT_SECRET   (from the UPS developer app)
//   UPS_ENV = "cie" (test, default) | "prod"
//   UPS_RATE_VERSION = dated version, default "v2409" (adjust if UPS rejects it)

function host() {
  return (process.env.UPS_ENV || "cie") === "prod"
    ? "https://onlinetools.ups.com"
    : "https://wwwcie.ups.com";
}

let tokenCache = { token: null, exp: 0 };

async function getToken() {
  const id = process.env.UPS_CLIENT_ID, secret = process.env.UPS_CLIENT_SECRET;
  if (!id || !secret) throw new Error("UPS credentials not set");
  if (tokenCache.token && Date.now() < tokenCache.exp - 30000) return tokenCache.token;

  const res = await fetch(`${host()}/security/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("UPS OAuth: " + (data.error_description || data.error || res.status));
  tokenCache = { token: data.access_token, exp: Date.now() + (Number(data.expires_in || 3600) * 1000) };
  return tokenCache.token;
}

export function upsConfigured() {
  return !!(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET);
}

export async function upsRate({ fromZip, toZip, length, width, height, weight, residential = true }) {
  const token = await getToken();
  const version = process.env.UPS_RATE_VERSION || "v2409";

  const body = {
    RateRequest: {
      Request: { RequestOption: "Shop" },
      Shipment: {
        Shipper: { Address: { PostalCode: String(fromZip), CountryCode: "US" } },
        ShipFrom: { Address: { PostalCode: String(fromZip), CountryCode: "US" } },
        ShipTo: {
          Address: {
            PostalCode: String(toZip), CountryCode: "US",
            ...(residential ? { ResidentialAddressIndicator: "Y" } : {}),
          },
        },
        Package: {
          PackagingType: { Code: "02" }, // Customer Supplied Package
          Dimensions: {
            UnitOfMeasurement: { Code: "IN" },
            Length: String(length), Width: String(width), Height: String(height),
          },
          PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(weight) },
        },
      },
    },
  };

  const res = await fetch(`${host()}/api/rating/${version}/Shop`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      transId: "bike-rate-" + Date.now(),
      transactionSrc: "bike-rate-calculator",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.response?.errors?.[0]?.message || data?.error || `HTTP ${res.status}`;
    throw new Error("UPS Rating: " + msg);
  }

  const rated = data?.RateResponse?.RatedShipment;
  const list = Array.isArray(rated) ? rated : rated ? [rated] : [];
  // Service code 03 = UPS Ground
  const ground = list.find((r) => r?.Service?.Code === "03") || list[0];
  if (!ground) return { rate: null, error: "No UPS rate returned", serviceLevel: "UPS Ground" };

  const published = ground?.TotalCharges?.MonetaryValue;
  const rate = published != null ? parseFloat(published) : null;
  return {
    rate,
    serviceLevel: "UPS Ground",
    deliveryDays: ground?.GuaranteedDelivery?.BusinessDaysInTransit
      ? Number(ground.GuaranteedDelivery.BusinessDaysInTransit) : null,
  };
}
