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
  await wizard.getByText(/Item setup stages/).click();
  const stages = wizard.getByRole("list", { name: "Ordered relevant item setup stages" });
  await expect(stages.getByRole("listitem")).toHaveCount(5);
  await expect(stages.getByText("Terminals & peripherals")).toHaveCount(0);
  for (const path of [
    "/machines",
    "/station-connectivity",
    "/mes-integration",
    "/release-readiness",
  ]) {
    await wizard.getByRole("link", { name: /Next setup stage:/ }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
    await expect(wizard).toContainText(scale.label);
    const q = new URL(page.url()).searchParams;
    expect(q.get("engStation")).toBe("CHECK");
    expect(q.get("setupItem")).toBe(scale.id);
    expect(q.get("engLine")).toBe("PACK-A");
    if (path === "/release-readiness") {
      const readiness = page.getByRole("region", { name: "Item-scoped readiness" });
      await expect(
        readiness.getByRole("heading", { name: "Item readiness · " + scale.label }),
      ).toBeVisible();
      await expect(readiness).toContainText("PACK-SCALE");
      await expect(readiness).toContainText("PACK-WEIGHT");
    }
    if (path === "/mes-integration") expect(q.get("mapping")).toBe("PACK-WEIGHT");
    if (path === "/station-connectivity") expect(q.get("signal")).toBe("inspection_weight");
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

test("an HMI placement keeps its exact application, terminal and layout identity in Studio", async ({
  page,
}) => {
  test.skip(!origin, "Requires the packaging training fixture.");
  const hmi = example.spatial.occurrences.find((item) => item.terminalId === "PACK-HMI")!;
  const definition = example.studio.applications.find((app) => app.id === hmi.authoringAppId)!;
  await signIn(page, "/factory-layout?site=" + site + "&occurrence=" + hmi.id);
  await page.getByRole("link", { name: "Start item setup", exact: true }).click();
  const wizard = page.getByRole("region", { name: "Sentinel factory setup", exact: true });
  await wizard.getByRole("link", { name: /Next setup stage:/ }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/terminals");
  await wizard.getByRole("link", { name: /Next setup stage:/ }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/factory-assignment");
  expect(new URL(page.url()).searchParams.get("terminal")).toBe(hmi.terminalId);
  await wizard.getByRole("link", { name: /Next setup stage:/ }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/application-studio");
  await expect(page.getByLabel("Application name", { exact: true })).toHaveValue(definition.name);
  await page.reload();
  await expect(page.getByLabel("Application name", { exact: true })).toHaveValue(definition.name);
  expect(new URL(page.url()).searchParams.get("terminal")).toBe(hmi.terminalId);
  await wizard.getByRole("link", { name: "Return to item in 3D" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("occurrence")).toBe(hmi.id);
});
