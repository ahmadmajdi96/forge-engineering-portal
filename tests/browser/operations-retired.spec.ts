import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("retired operational bookmarks return 404 while operator and HMI authoring remain available", async ({
  page,
}) => {
  await page.goto("/");
  const token = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(
    readFileSync(".ems/runtime.env", "utf8"),
  )![1]!;
  await page.getByLabel("Fixture access token").fill(token);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await expect(page.getByRole("heading", { name: "Engineering Overview" })).toBeVisible();
  for (const path of [
    "/operator/ST-101",
    "/live",
    "/hmi/ST-101",
    "/work-orders/WO-1",
    "/units/UNIT-1",
    "/waste-reasons",
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(404);
  }
  for (const path of ["/operator-apps", "/hmi-layouts", "/screen-editor"]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
  }
});
