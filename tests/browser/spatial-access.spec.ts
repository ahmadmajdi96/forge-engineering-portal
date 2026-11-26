import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("reviewer inspects a saved layout, changes cameras and resizes the inspector without edit controls", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const settings = readFileSync(".ems/runtime.env", "utf8");
  const token = /^EMS_FIXTURE_REVIEWER_TOKEN=(\S+)$/m.exec(settings)?.[1];
  expect(token, "Local reviewer fixture is configured").toBeTruthy();
  await page.goto("/factory-layout?site=training-north");
  await page.getByLabel("Fixture access token").fill(token!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await expect(page.getByText(/View-only access · revision/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Save workspace", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Place on floor", exact: true })).toHaveCount(0);
  const canvas = page.getByTestId("spatial-3d").locator("canvas");
  await expect(canvas).toBeVisible();
  const startingFrame = await canvas.screenshot();
  await page.getByRole("combobox", { name: "Camera direction" }).selectOption("top");
  await expect.poll(async () => !startingFrame.equals(await canvas.screenshot())).toBe(true);
  const handle = page.getByRole("separator", { name: "Resize properties panel" });
  const startingWidth = Number(await handle.getAttribute("aria-valuenow"));
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", String(startingWidth + 16));
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", String(startingWidth));
});
