import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("station engineering follows the selected station through signal bindings into the layout", async ({
  page,
}) => {
  const origin = process.env["EMS_PACKAGING_FIXTURE_ORIGIN"];
  test.skip(!origin, "Requires the packaging training factory.");
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(origin!).hostname);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(new URL("/stations/CHECK?site=training-south", origin!).href);
  const token = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(
    readFileSync(".ems/runtime.env", "utf8"),
  )![1]!;
  await page.getByLabel("Fixture access token").fill(token);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  const journey = page.getByRole("region", { name: "Engineering journey" });
  await journey.getByRole("link", { name: "Next stage: Signals" }).click();
  await expect(page).toHaveURL(/\/station-connectivity\?/);
  expect(new URL(page.url()).searchParams.get("engStation")).toBe("CHECK");
  await journey.getByRole("link", { name: "Next stage: 3D layout" }).click();
  await expect(page).toHaveURL(/\/factory-layout\?/);
  const search = new URL(page.url()).searchParams;
  expect(search.get("site")).toBe("training-south");
  expect(search.get("line")).toBe("PACK-A");
  expect(search.get("station")).toBe("CHECK");
  await expect(page.locator("canvas").first()).toBeVisible();
});
