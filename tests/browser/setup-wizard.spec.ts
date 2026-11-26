import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import example from "../../docs/factory-engineering/packaging-training.json" with { type: "json" };

const origin = process.env["EMS_PACKAGING_FIXTURE_ORIGIN"];
const site = "training-south";
const scale = example.spatial.occurrences.find((o) => o.asset.id === "PACK-SCALE")!;
async function signIn(page: Page, path: string) {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(origin!).hostname);
  await page.goto(new URL(path, origin!).href);
  const token = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(
    readFileSync(".ems/runtime.env", "utf8"),
  )![1]!;
  await page.getByLabel("Fixture access token").fill(token);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
}

test("a placed scale retains identity through the engineering wizard, reload and finish", async ({
  page,
}) => {
  test.skip(!origin, "Requires the packaging training fixture.");
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "/factory-layout?site=" + site + "&occurrence=" + scale.id);
  await page.getByRole("link", { name: "Start item setup", exact: true }).click();
  const wizard = page.getByRole("region", { name: "Sentinel factory setup", exact: true });
  await expect(wizard).toContainText(scale.label);
  await wizard.getByText(/All 14 setup stages/).click();
  await expect(wizard.getByRole("listitem")).toHaveCount(14);
  await expect(
    wizard.getByRole("listitem").filter({ hasText: "Terminals & peripherals" }),
  ).toContainText(/equipment/);
  for (const path of [
    "/lines",
    "/line-engineering",
    "/factory-process",
    "/process-routes",
    "/asset-steps",
    "/step-templates",
    "/stations",
    "/workstations",
    "/machines",
    "/station-connectivity",
    "/command-policy",
    "/registry",
  ]) {
    await wizard.getByRole("link", { name: /Next setup stage:/ }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
    await expect(wizard).toContainText(scale.label);
    const q = new URL(page.url()).searchParams;
    expect(q.get("engStation")).toBe("CHECK");
    expect(q.get("setupItem")).toBe(scale.id);
    expect(q.get("engLine")).toBe("PACK-A");
    if (path === "/machines") {
      await page.reload();
      await expect(wizard).toContainText(scale.label);
      expect(new URL(page.url()).searchParams.get("engAsset")).toBe("PACK-SCALE");
    }
  }
  await wizard.getByRole("button", { name: "Finish setup" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/factory-layout");
  expect(new URL(page.url()).searchParams.get("occurrence")).toBe(scale.id);
  await expect(wizard).toHaveCount(0);
});

test("missing and cross-site item bookmarks cannot open another station as the selected item", async ({
  page,
}) => {
  test.skip(!origin, "Requires the packaging training fixture.");
  await signIn(
    page,
    "/machines?site=" +
      site +
      "&setup=guided&setupSite=" +
      site +
      "&setupType=occurrence&setupItem=missing",
  );
  await expect(page.getByRole("alert")).toContainText("no longer exists");
  await expect(page.getByRole("link", { name: /Next setup stage:/ })).toHaveCount(0);
  await page.goto(
    new URL(
      "/?site=training-south&setup=guided&setupSite=training-north" +
        "&setupItem=" +
        scale.id +
        "&setupType=occurrence",
      origin!,
    ).href,
  );
  await expect(page.getByRole("heading", { name: "Engineering Overview" })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has("setup")).toBe(false);
  await expect(
    page.getByRole("region", { name: "Sentinel factory setup", exact: true }),
  ).toHaveCount(0);
});
