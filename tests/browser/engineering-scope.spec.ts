import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("station detail and engineering navigation retain the selected station and clear stale assets", async ({
  page,
}) => {
  const token = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(
    readFileSync(".ems/runtime.env", "utf8"),
  )![1]!;
  await page.goto("/stations/ST-104?site=training-north");
  await page.getByLabel("Fixture access token").fill(token);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await expect(page.locator("main h1")).toContainText(/Metal Detector/);
  await expect(page).toHaveURL(/\/stations\/ST-104\?/);
  await page.getByRole("link", { name: "Machines", exact: true }).click();
  await expect(page.getByLabel("Equipment station")).toHaveValue("ST-104");
  await page.getByLabel("Equipment station").selectOption("ST-101");
  await expect(page).toHaveURL(/\/machines\?/);
  await expect.poll(() => new URL(page.url()).searchParams.get("engStation")).toBe("ST-101");
  await expect(page.getByLabel("Equipment station")).toHaveValue("ST-101");
  const query = new URL(page.url()).searchParams;
  expect(query.get("engAsset")).toBeNull();
  expect(query.get("site")).toBe("training-north");
});
