#!/usr/bin/env node

import http from "node:http";
import process from "node:process";

const serviceName = requiredEnv("NEXUS_SERVICE_NAME");
const port = parsePort(requiredEnv("PORT"));
const debugPort = process.env.NEXUS_DEBUG_PORT ?? "";
const isPublic = process.env.NEXUS_PUBLIC === "true";
const hotReload = process.env.NEXUS_HOT_RELOAD === "true";
const startedAtUtc = new Date().toISOString();

const server = http.createServer((request, response) => {
  const path = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`).pathname;

  if (path === "/health" || path === "/ready") {
    sendJson(response, 200, {
      status: "ok",
      service: serviceName,
      public: isPublic,
      hot_reload: hotReload,
      debug_port: debugPort,
      started_at_utc: startedAtUtc,
      uptime_seconds: Math.floor(process.uptime()),
    });
    return;
  }

  if (path === "/version") {
    sendJson(response, 200, {
      service: serviceName,
      schema_version: "nexus.dev_service.p1.v1",
      runtime: `node ${process.version}`,
    });
    return;
  }

  sendJson(response, 404, {
    code: "PLATFORM_NOT_FOUND",
    message: "Development service endpoint not found",
    trace_id: "trace_dev_health",
    details: { service: serviceName, path },
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "dev_service.started",
    service: serviceName,
    port,
    debug_port: debugPort,
    hot_reload: hotReload,
    started_at_utc: startedAtUtc,
  }));
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return parsed;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}
