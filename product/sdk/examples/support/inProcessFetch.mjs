import { createManualPlatformApi } from '../../../api/index.ts';

export function createInProcessPlatformFetch() {
  const app = createManualPlatformApi();
  return async (url, init = {}) => {
    const parsed = new URL(String(url));
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    const response = await app.handle({ method: init.method ?? 'GET', path: `${parsed.pathname}${parsed.search}`, headers, body });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    };
  };
}

export function exampleClientOptions(accessToken) {
  const baseUrl = process.env.NEXUS_API_BASE_URL ?? 'http://localhost:8080';
  return {
    baseUrl,
    accessToken: process.env.NEXUS_API_TOKEN ?? accessToken,
    fetchImpl: process.env.NEXUS_API_BASE_URL ? undefined : createInProcessPlatformFetch(),
  };
}
