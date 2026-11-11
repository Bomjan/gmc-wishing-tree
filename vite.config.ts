import type { ClientRequest, IncomingMessage } from "node:http";
import { networkInterfaces } from "node:os";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const apiPort = process.env.API_PORT || "3001";
  const publicOrigin =
    process.env.PUBLIC_ORIGIN ||
    loadEnv(mode, process.cwd(), "PUBLIC_ORIGIN").PUBLIC_ORIGIN ||
    "http://localhost:5173";

  const configure: NonNullable<ProxyOptions["configure"]> = (proxy) => {
    const forwardLocalOrigin = (
      outgoing: ClientRequest,
      incoming: IncomingMessage,
    ) => {
      const { host, origin } = incoming.headers;
      if (!host || origin !== `http://${host}` || !URL.canParse(origin)) return;
      const url = new URL(origin);
      if (url.origin !== origin) return;
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const local =
        hostname === "localhost" ||
        Object.values(networkInterfaces()).some((addresses) =>
          addresses?.some(({ address }) => address === hostname),
        );
      if (local) outgoing.setHeader("Origin", publicOrigin);
    };
    // Preserve the API's exact origin check while supporting the dev server's
    // local and LAN addresses. Cross-origin requests keep their original Origin.
    proxy.on("proxyReq", forwardLocalOrigin);
    proxy.on("proxyReqWs", forwardLocalOrigin);
  };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": { target: `http://127.0.0.1:${apiPort}`, configure },
        "/ws": { target: `ws://127.0.0.1:${apiPort}`, ws: true, configure },
      },
    },
    build: { chunkSizeWarningLimit: 1200 },
  };
});
