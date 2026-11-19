# Bike Shipping Savings Calculator

A travel-style **fare finder** for shipping a bike: the visitor answers three quick
questions (ship-from ZIP → ship-to ZIP → box + weight), each collapsing as they go,
then it reveals live **UPS** and **FedEx** rates next to **BikeFlights** and shows the
savings — with a "Book it on BikeFlights" call to action.

## Rate sources
- **UPS / FedEx** — via **EasyPost** (one API key). We read the `retail_rate` / `list_rate`
  (the published price a walk-in pays) for an honest savings comparison.
- **BikeFlights** — no public API; shown as a labeled estimate for now, with a scraper
  to be wired in for the real negotiated rate.

## Run locally
```bash
npm install
# create .env (never commit it):
#   EASYPOST_API_KEY=EZTK...        (test) or EZAK... (production, for real rates)
#   PORT=5178
npm start
# open http://localhost:5178
```

## Run in a container
```bash
docker build -t bike-rate-calculator .
docker run -p 5178:5178 -e EASYPOST_API_KEY=EZAK... bike-rate-calculator
```

## Embed on an affiliate site
It's a compact, self-contained **widget** (~440px wide, boxed card) that **auto-reports its
height**, so it slots into any page with no inner scrollbar. Paste this where you want it:

```html
<iframe id="bikeRate" src="https://YOUR-HOST/" title="Bike Shipping Savings"
        style="width:100%;max-width:460px;border:0;height:430px" loading="lazy"></iframe>
<script>
addEventListener("message", function (e) {
  if (e.data && e.data.type === "bikeRateHeight") {
    var f = document.getElementById("bikeRate");
    if (f) f.style.height = e.data.height + "px";
  }
});
</script>
```
The widget posts its height on every step (and on results), so the iframe grows/shrinks to
fit. The server sets no `X-Frame-Options`, so it frames cleanly on any domain. Host it once
(any Node host or the container above) and reuse the same snippet across all your sites.

### Your affiliate link
Open `public/index.html` and set **`BOOK_URL`** (top of the `<script>`) to your BikeFlights
affiliate link — every "Book it on BikeFlights" button and the footer link use it, so the
widget drives clicks through your affiliate tracking.

## Notes
- **Test vs production:** an `EZTK…` test key returns representative sample rates; a
  funded `EZAK…` production key returns real retail rates. UPS needs a production key +
  the UPS carrier added in EasyPost **or** UPS's own developer API (list rates, free).
- Keep API keys in `.env` or runtime env — never in the page or the repo.
