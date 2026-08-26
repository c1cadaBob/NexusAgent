import React from "react";
import { createRoot } from "react-dom/client";
import { DOCS_ROUTE_MATRIX, DOCS_SITE_SCHEMA_VERSION, ERROR_CODES, SDK_METHOD_CATALOG, SDK_SNIPPET } from "./catalog";
import "./styles.css";

function App() {
  const routeCount = DOCS_ROUTE_MATRIX.length;
  const sdkMethodCount = SDK_METHOD_CATALOG.length;
  return (
    <main className="page-shell">
      <header className="masthead">
        <div>
          <p className="folio">P5-04 / {DOCS_SITE_SCHEMA_VERSION}</p>
          <h1>NexusAgent Developer Docs</h1>
        </div>
        <div className="summary-grid" aria-label="Documentation summary">
          <Metric value={routeCount} label="public routes" />
          <Metric value={sdkMethodCount} label="SDK methods" />
          <Metric value={3} label="approved channels" />
        </div>
      </header>

      <section className="notice-band">
        <h2>P5 Alpha contract</h2>
        <p>Use the REST API and TypeScript SDK for P5 Alpha. Webhook delivery and streaming transports are deferred; read task events with GET /v1/tasks/{"{task_id}"}/events.</p>
      </section>

      <section className="layout-grid">
        <article className="panel span-two">
          <div className="section-head">
            <span>01</span>
            <h2>API Route Matrix</h2>
          </div>
          <div className="route-table">
            {DOCS_ROUTE_MATRIX.map((route) => (
              <div className="route-row" key={`${route.method} ${route.path}`}>
                <span className="method">{route.method}</span>
                <code>{route.path}</code>
                <span>{route.area}</span>
                <span>{route.purpose}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="section-head">
            <span>02</span>
            <h2>Authentication</h2>
          </div>
          <p>Send a bearer access token on every platform request except health. Local P5 profiles are platform admin, tenant admin, operator, and viewer.</p>
          <p>Production IdP and enterprise sign-on are later delivery work.</p>
        </article>

        <article className="panel">
          <div className="section-head">
            <span>03</span>
            <h2>SDK Quickstart</h2>
          </div>
          <pre><code>{SDK_SNIPPET}</code></pre>
        </article>

        <article className="panel span-two">
          <div className="section-head">
            <span>04</span>
            <h2>SDK Method Coverage</h2>
          </div>
          <div className="method-grid">
            {SDK_METHOD_CATALOG.map((method) => (
              <div className="method-card" key={method.name}>
                <strong>{method.name}</strong>
                <code>{method.route}</code>
                <span>{method.role}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="section-head">
            <span>05</span>
            <h2>Errors</h2>
          </div>
          <p>SDK failures throw NexusAgentApiError with status, code, message, trace_id, and details.</p>
          <ul className="code-list">
            {ERROR_CODES.map((code) => <li key={code}>{code}</li>)}
          </ul>
        </article>

        <article className="panel">
          <div className="section-head">
            <span>06</span>
            <h2>Channels</h2>
          </div>
          <p>Supported channel names are dingtalk, feishu, and telegram. Channel tests are dry-run checks and return credential_status only.</p>
        </article>

        <article className="panel span-two">
          <div className="section-head">
            <span>07</span>
            <h2>Plugin Governance</h2>
          </div>
          <p>Platform administrators can import metadata, record hash and license fields, and set admission state. Tenant self-service third-party plugin installation is not supported in P5 Alpha.</p>
        </article>
      </section>
    </main>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="metric">
      <strong>{String(value).padStart(2, "0")}</strong>
      <span>{label}</span>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
