export async function onRequestGet() {
  try {
    const btcResponse = await fetch(
      "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"
    );

    const ethResponse = await fetch(
      "https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT"
    );

    if (!btcResponse.ok || !ethResponse.ok) {
      return Response.json(
        {
          error: "Failed to fetch data from Binance",
          btcStatus: btcResponse.status,
          ethStatus: ethResponse.status
        },
        { status: 500 }
      );
    }

    const btc = await btcResponse.json();
    const eth = await ethResponse.json();

    return Response.json({
      updated: new Date().toISOString(),
      bitcoin: {
        symbol: btc.symbol,
        priceUsd: Number(btc.lastPrice),
        changePercent24h: Number(btc.priceChangePercent),
        high24h: Number(btc.highPrice),
        low24h: Number(btc.lowPrice),
        volume: Number(btc.volume)
      },
      ethereum: {
        symbol: eth.symbol,
        priceUsd: Number(eth.lastPrice),
        changePercent24h: Number(eth.priceChangePercent),
        high24h: Number(eth.highPrice),
        low24h: Number(eth.lowPrice),
        volume: Number(eth.volume)
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message
      },
      { status: 500 }
    );
  }
}
