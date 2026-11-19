# Bike Shipping Savings Calculator — lightweight container (EasyPost-backed).
FROM node:22-alpine

WORKDIR /app

# Skip Playwright browser download (the EasyPost build doesn't use it;
# the optional BikeFlights scraper does and would need a fuller image).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV PORT=5178
EXPOSE 5178

# EASYPOST_API_KEY (and later UPS_CLIENT_ID / UPS_CLIENT_SECRET) are passed at runtime:
#   docker run -p 5178:5178 -e EASYPOST_API_KEY=... bike-rate-calculator
CMD ["node", "--env-file-if-exists=.env", "server.js"]
