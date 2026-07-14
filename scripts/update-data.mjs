import { readFile, writeFile } from "node:fs/promises";

const coinIds = [
  "binancecoin", "nexo", "hyperliquid", "aster-2", "lighter", "dydx-chain",
  "gmx", "havven", "uniswap", "jupiter-exchange-solana", "pancakeswap-token",
  "aerodrome-finance", "curve-dao-token", "1inch", "cow-protocol", "raydium",
  "orca", "thorchain", "pendle", "pump-fun", "woo-network", "yei-finance", "sushi"
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "TokenBoard/1.0" }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1500);
    }
  }
  throw lastError;
}

const marketUrl = new URL("https://api.coingecko.com/api/v3/coins/markets");
marketUrl.searchParams.set("vs_currency", "usd");
marketUrl.searchParams.set("ids", coinIds.join(","));
marketUrl.searchParams.set("order", "market_cap_desc");
marketUrl.searchParams.set("per_page", "250");
marketUrl.searchParams.set("page", "1");
marketUrl.searchParams.set("sparkline", "false");
marketUrl.searchParams.set("price_change_percentage", "24h");

let previous = {};
try {
  previous = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));
} catch {
  // The first run has no cache to preserve.
}

const [spotResult, futuresResult, marketsResult] = await Promise.allSettled([
  fetchJson("https://api.binance.com/api/v3/exchangeInfo"),
  fetchJson("https://fapi.binance.com/fapi/v1/exchangeInfo"),
  fetchJson(marketUrl)
]);

const spotAssets = spotResult.status === "fulfilled"
  ? [...new Set(spotResult.value.symbols.filter((item) => item.status === "TRADING").map((item) => item.baseAsset))].sort()
  : previous.spotAssets;
const futuresAssets = futuresResult.status === "fulfilled"
  ? [...new Set(futuresResult.value.symbols
    .filter((item) => item.status === "TRADING" && item.contractType === "PERPETUAL")
    .map((item) => item.baseAsset))].sort()
  : previous.futuresAssets;
const markets = marketsResult.status === "fulfilled"
  ? Object.fromEntries(marketsResult.value.map((item) => [item.id, item]))
  : previous.markets;

if (!spotAssets || !futuresAssets || !markets) {
  throw new Error("No usable API response or previous cache is available");
}

const cache = {
  generatedAt: new Date().toISOString(),
  sources: {
    market: "CoinGecko /coins/markets",
    spot: "Binance /api/v3/exchangeInfo",
    futures: "Binance /fapi/v1/exchangeInfo"
  },
  spotAssets,
  futuresAssets,
  markets
};

await writeFile(new URL("../data.json", import.meta.url), `${JSON.stringify(cache, null, 2)}\n`, "utf8");
const warnings = [spotResult, futuresResult, marketsResult]
  .map((result, index) => result.status === "rejected" ? ["Binance spot", "Binance futures", "CoinGecko"][index] : null)
  .filter(Boolean);
console.log(`Updated data.json with ${Object.keys(markets).length} market records at ${cache.generatedAt}`);
if (warnings.length) console.warn(`Preserved cached data for: ${warnings.join(", ")}`);
