import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = process.env["EMS_PACKAGING_FIXTURE_ORIGIN"];
test("an assigned station traces its configured signal to the HMI and the exact MES resource", async ({
  page,
}) => {
  test.skip(!fixture, "Requires the isolated packaging example.");
  const origin = new URL(fixture!);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(origin.hostname);
  const token =
    process.env["EMS_FIXTURE_AUTHOR_TOKEN"] ??
    /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(readFileSync(".ems/runtime.env", "utf8"))?.[1];
  expect(token).toBeTruthy();
  await page.goto(new URL("/stations/CHECK?site=training-south", origin).href);
  await page.getByLabel("Fixture access token").fill(token!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await page.getByRole("link", { name: /Fill and inspect.*Verify weight/ }).click();
  await expect(page.getByLabel("Revision reason")).toBeVisible();
  const trace = page.getByRole("link", { name: "Trace Verify weight in 3D" });
  await trace.click();
  await expect(page.getByRole("combobox", { name: "Trace step", exact: true })).toHaveValue(
    "weigh",
  );
  await expect(page.getByText("Screen / widget · Welcome / Weight (kg)")).toBeVisible();
  const mapping = page.getByRole("link", { name: "PACK-WEIGHT", exact: true });
  await expect(mapping).toHaveAttribute("href", /mapping=PACK-WEIGHT/);
  for (const name of ["Floor plan in metres", "Front elevation in metres"]) {
    const view = page.getByRole("group", { name });
    await expect(
      view
        .locator("line title")
        .filter({ hasText: "Configured signal from Quality inspection station to HMI panel" }),
    ).toHaveCount(1);
    await expect(
      view
        .locator("line title")
        .filter({ hasText: "network · Training Ethernet port to Training Ethernet port" }),
    ).toHaveCount(1);
  }
  await page.getByRole("link", { name: "Open step definition" }).click();
  await page.reload();
  await expect(trace).toBeVisible();
});
