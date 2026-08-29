#!/usr/bin/env node

import process from "node:process";
import { createInternalServiceServer } from "../../platform/internal-http/index.ts";

const serviceName = process.env.NEXUS_SERVICE_NAME;
const allowed = new Set([
  "openclaw-adapter",
  "hermes-adapter",
  "dsh-adapter",
  "memory-gateway",
  "artifact-store",
  "event-bus",
  "credential-center",
  "observability",
]);

if (!allowed.has(serviceName)) {
  throw new Error("NEXUS_SERVICE_NAME must name a supported internal service");
}

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const server = createInternalServiceServer({
  serviceName,
  port,
  host: process.env.HOST ?? "0.0.0.0",
  token: process.env.NEXUS_INTERNAL_SERVICE_TOKEN,
});

console.log(JSON.stringify({
  event: "internal_service.started",
  schema_version: "nexus.internal_service.p8.v1",
  service: serviceName,
  port,
  hot_reload: process.env.NEXUS_HOT_RELOAD === "true",
}));

function shutdown(signal) {
  server.close(() => {
    console.log(JSON.stringify({ event: "internal_service.stopped", service: serviceName, signal }));
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
