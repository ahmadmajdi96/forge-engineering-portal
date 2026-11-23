import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const key = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(readFileSync(".ems/runtime.env", "utf8"))?.[1];

test("factory renderer, saved layout and protected QA", async ({ page, request }) => {
  const denied = await request.get("/api/ems/qa?site=training-north");
  expect(denied.status()).toBe(401);
  await page.goto("/factory-layout?site=training-north");
  await expect(page.getByRole("button", { name: "Sign in to fixture" })).toBeVisible();
  expect(key).toBeTruthy();
  await page.getByLabel("Fixture access token").fill(key!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await expect(page.getByRole("heading", { name: "Factory layout", exact: true })).toBeVisible();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((element) =>
      Boolean((element as HTMLCanvasElement).getContext("webgl2")),
    ),
  ).toBe(true);
  const planMachine = page
    .getByRole("group", { name: "Floor plan in metres" })
    .getByRole("button", { name: "Machine envelope" });
  const elevationMachine = page
    .getByRole("group", { name: "Front elevation in metres" })
    .getByRole("button", { name: "Machine envelope" });
  await planMachine.press("Enter");
  await expect(planMachine).toHaveAttribute("aria-pressed", "true");
  await expect(elevationMachine).toHaveAttribute("aria-pressed", "true");
  const initialPlan = (await planMachine.getAttribute("points"))!;
  const initialElevation = (await elevationMachine.getAttribute("points"))!;
  const x = page.getByLabel("Floor position (m) X", { exact: true });
  const start = await x.inputValue();
  await x.fill(String(Number(start) + 1));
  await page.getByRole("button", { name: "Apply properties" }).click();
  await expect(planMachine).not.toHaveAttribute("points", initialPlan);
  await expect(elevationMachine).not.toHaveAttribute("points", initialElevation);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(planMachine).toHaveAttribute("points", initialPlan);
  await expect(elevationMachine).toHaveAttribute("points", initialElevation);
  await page.getByRole("link", { name: "Admin QA", exact: true }).click();
  await expect(page.getByRole("row", { name: /Database and migrations pass/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Physical commissioning blocked/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
