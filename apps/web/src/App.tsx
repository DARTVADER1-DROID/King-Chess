import { useEffect, useState } from "react";

interface HealthResponse {
  status: "ok";
  service: string;
}

export default function App() {
  const [apiStatus, setApiStatus] = useState("Checking API…");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json() as Promise<HealthResponse>;
      })
      .then((data) => setApiStatus(data.status === "ok" ? "API connected" : "Unexpected API response"))
      .catch(() => setApiStatus("API unavailable — is the server running?"));
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">MULTIPLAYER CHESS</p>
        <h1>King Chess</h1>
        <p className="intro">The development workspace is ready. The board and multiplayer flow come next.</p>
        <div className="status"><span className="status-dot" />{apiStatus}</div>
      </section>
    </main>
  );
}
