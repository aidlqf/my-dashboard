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

async function fetchBinanceTicker(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "crypto-dashboard-cloudflare-pages-function/1.0"
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text();

  let body;
  if (contentType.includes("application/json")) {
    try {
      body = JSON.parse(bodyText);
    } catch (error) {
      throw new Error(`Binance returned invalid JSON for ${symbol}: ${error.message}`);
    }
  } else {
    throw new Error(
      `Binance returned ${response.status} ${response.statusText || ""} with non-JSON content for ${symbol}. First characters: ${bodyText.slice(0, 80)}`
    );
  }

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

export async function onRequestGet() {
  try {
    const [btc, eth] = await Promise.all([
      fetchBinanceTicker("BTCUSDT"),
      fetchBinanceTicker("ETHUSDT")
    ]);

    return jsonResponse({
      updated: new Date().toISOString(),
      source: "Binance 24hr ticker via Cloudflare Pages Function",
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
