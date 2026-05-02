async function fetchBinanceTicker(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "crypto-dashboard-cloudflare-worker/1.0"
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text();

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Binance returned ${response.status} ${response.statusText || ""} with non-JSON content for ${symbol}. First characters: ${bodyText.slice(0, 80)}`
    );
  }

  const body = JSON.parse(bodyText);

  if (!response.ok) {
    throw new Error(
      `Binance request failed for ${symbol}: HTTP ${response.status}. ${body?.msg || body?.message || ""}`.trim()
    );
  }

  return body;
}

function mapTicker(ticker) {
  return {
    symbol: ticker.symbol,
    priceUsd: Number(ticker.lastPrice),
    changePercent24h: Number(ticker.priceChangePercent),
    high24h: Number(ticker.highPrice),
    low24h: Number(ticker.lowPrice),
    volume: Number(ticker.volume)
  };
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

async function handleCrypto() {
  try {
    const [btc, eth] = await Promise.all([
      fetchBinanceTicker("BTCUSDT"),
      fetchBinanceTicker("ETHUSDT")
    ]);
    return jsonResponse({
      updated: new Date().toISOString(),
      source: "Binance 24hr ticker via Cloudflare Worker",
      bitcoin: mapTicker(btc),
      ethereum: mapTicker(eth)
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to fetch crypto market data",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/crypto" && request.method === "GET") {
      return handleCrypto();
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not Found", path: url.pathname }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
