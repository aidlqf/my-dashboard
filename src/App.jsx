import { useEffect, useState } from "react";
import "./App.css";

function formatMoney(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function formatPercent(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)}%`;
}

function CoinCard({ name, data }) {
  return (
    <div className="coin-card">
      <h2>{name}</h2>

      <div className="data-row">
        <span>Symbol</span>
        <strong>{data.symbol}</strong>
      </div>

      <div className="data-row">
        <span>Price</span>
        <strong>{formatMoney(data.priceUsd)}</strong>
      </div>

      <div className="data-row">
        <span>24h Change</span>
        <strong className={data.changePercent24h >= 0 ? "positive" : "negative"}>
          {formatPercent(data.changePercent24h)}
        </strong>
      </div>

      <div className="data-row">
        <span>24h High</span>
        <strong>{formatMoney(data.high24h)}</strong>
      </div>

      <div className="data-row">
        <span>24h Low</span>
        <strong>{formatMoney(data.low24h)}</strong>
      </div>

      <div className="data-row">
        <span>Volume</span>
        <strong>{data.volume.toLocaleString()}</strong>
      </div>
    </div>
  );
}

function App() {
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const response = await fetch("/data");

      if (!response.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const data = await response.json();
      setMarketData(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <main className="dashboard">
      <section className="card">
        <h1>Crypto Dashboard</h1>

        <p className="subtitle">
          Bitcoin and Ethereum data fetched through a Cloudflare Pages Function.
        </p>

        <button onClick={loadData}>Refresh Data</button>

        {loading && <p className="loading">Loading...</p>}

        {errorMessage && <p className="error">Error: {errorMessage}</p>}

        {marketData && !loading && (
          <>
            <div className="coin-grid">
              <CoinCard name="Bitcoin" data={marketData.bitcoin} />
              <CoinCard name="Ethereum" data={marketData.ethereum} />
            </div>

            <p className="updated">
              Last updated: {new Date(marketData.updated).toLocaleString()}
            </p>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
