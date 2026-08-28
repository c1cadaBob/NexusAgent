#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.env.STATIC_ROOT ?? join(process.cwd(), 'dist'));
const host = process.env.HOST ?? '0.0.0.0';
const port = parsePort(process.env.PORT ?? '8080');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  if (pathname === '/health' || pathname === '/ready') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{"status":"ok","service":"nexusagent-web-console"}\n');
    return;
  }

  const file = resolveStaticPath(pathname);
  if (!file) {
    response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{"code":"PLATFORM_FORBIDDEN","message":"Static asset path is not allowed"}\n');
    return;
  }

  const asset = existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
  response.writeHead(200, { 'content-type': contentTypes.get(extname(asset)) ?? 'application/octet-stream' });
  createReadStream(asset).pipe(response);
});

server.listen(port, host);
console.log(JSON.stringify({ event: 'web_console.started', service: 'nexusagent-web-console', port, host }));

function resolveStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^([/\\])+/, '');
  const candidate = resolve(root, normalized || 'index.html');
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : undefined;
}

function parsePort(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) throw new Error(`Invalid PORT: ${value}`);
  return parsed;
}
