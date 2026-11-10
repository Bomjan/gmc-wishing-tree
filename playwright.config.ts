import { defineConfig } from "@playwright/test";
const port = Number(process.env.PLAYWRIGHT_PORT || 5187);
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT || 3017);
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
    launchOptions: {
      args: [
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--disable-dev-shm-usage",
      ],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `cross-env DEMO_MODE=true VITE_DEMO=true PORT=${apiPort} API_PORT=${apiPort} PUBLIC_ORIGIN=http://localhost:${port} concurrently -k "vite --host 0.0.0.0 --port ${port} --strictPort" "tsx watch server/index.ts"`,
    url: `http://localhost:${port}`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 30000,
  },
});
