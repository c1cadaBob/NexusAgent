#!/usr/bin/env node

import { listenPlatformApi } from './index.ts';

const port = parsePort(process.env.PORT ?? '8080');
const host = process.env.HOST ?? '0.0.0.0';

listenPlatformApi({ port, host });

console.log(JSON.stringify({
  event: 'platform_api.started',
  service: 'nexusagent-platform-api',
  port,
  host,
}));

function parsePort(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return parsed;
}
