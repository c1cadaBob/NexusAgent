import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.NEXUS_DEV_BIND_ADDRESS ?? "127.0.0.1",
    port: Number(process.env.PORT ?? "5175"),
    proxy: {
      "/v1": {
        target: process.env.NEXUS_API_PROXY_TARGET ?? "http://platform-api:8080",
        changeOrigin: false,
      },
    },
  },
});
