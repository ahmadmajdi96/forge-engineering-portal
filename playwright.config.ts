import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 25_000,
  use: {
    baseURL: process.env["EMS_SMOKE_ORIGIN"] ?? "http://127.0.0.1:8088",
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
});
