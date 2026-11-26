import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("design a building, floor and section footprint", async ({ page }) => {
  const token = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(
    readFileSync(".ems/runtime.env", "utf8"),
  )![1]!;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/factory-layout?site=training-south");
  await page.getByLabel("Fixture access token").fill(token);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  const controls = page.getByRole("region", { name: "Space selection" });
  await controls.getByText("Manage buildings, floors and sections", { exact: true }).click();
  await controls.getByLabel("Parent", { exact: true }).selectOption({ index: 0 });
  const parent = controls.getByLabel("Parent", { exact: true });
  const siteId = await controls
    .getByLabel("Site", { exact: true })
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await parent.selectOption(siteId!);
  const name = controls.getByLabel("Name", { exact: true });
  for (const [kind, label] of [
    ["building", "Annex"],
    ["floor", "Mezzanine"],
    ["section", "Inspection"],
  ]) {
    await name.fill(label!);
    await controls.getByRole("button", { name: "Add " + kind, exact: true }).click();
    await expect(
      controls
        .getByLabel(kind![0]!.toUpperCase() + kind!.slice(1), { exact: true })
        .locator("option:checked"),
    ).toHaveText(label!);
  }
  await controls.getByRole("radio", { name: "Rename" }).click();
  await name.fill("Inspection bay");
  await controls.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByText("Section footprint · Inspection bay").click();
  await page.getByLabel("Width (m)", { exact: true }).fill("6");
  await page.getByLabel("Depth (m)", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Apply footprint" }).click();
  const outline = page
    .getByRole("group", { name: "Floor plan in metres" })
    .locator("rect")
    .filter({ has: page.locator("title", { hasText: "Inspection bay · Section boundary" }) });
  await expect(outline).toHaveAttribute("width", "6");
  await expect(page.locator("canvas").first()).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Mezzanine navigation" });
  await expect(nav.getByRole("button", { name: "Inspection bay" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await controls.getByRole("radio", { name: "Add" }).click();
  const buildingId = await controls.getByLabel("Building", { exact: true }).inputValue();
  await parent.selectOption(buildingId);
  await name.fill("Upper floor");
  await controls.getByRole("button", { name: "Add floor", exact: true }).click();
  const stack = page.getByRole("button", { name: "Building floors (2)" });
  await stack.click();
  await expect(stack).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Separated floor view/)).toBeVisible();
  await controls.getByLabel("Floor", { exact: true }).selectOption({ label: "Mezzanine" });
  await nav.getByRole("button", { name: "Inspection bay" }).click();
  await expect(stack).toHaveAttribute("aria-pressed", "false");
  if (process.env["EMS_DISPOSABLE_SPACE_TEST"] === "1") {
    const entry = page.getByRole("region", { name: "Set up selected physical item" });
    await entry.getByRole("button", { name: "Save layout before setup" }).click();
    await expect(entry.getByRole("link", { name: "Start item setup" })).toHaveCount(0);
    await page.getByLabel("Revision reason").fill("Verify hierarchy persistence");
    await page.getByRole("button", { name: "Save workspace" }).click();
    await expect(page.getByText(/All changes saved/)).toBeVisible();
    await entry.getByRole("link", { name: "Start item setup" }).click();
    const wizard = page.getByRole("region", { name: "Sentinel factory setup", exact: true });
    await expect(wizard).toContainText("Inspection bay");
    await expect(wizard.getByRole("link", { name: /Next setup stage/ })).toHaveCount(0);
    const itemId = new URL(page.url()).searchParams.get("setupItem");
    expect(itemId).toBeTruthy();
    await page.reload();
    await expect(wizard).toContainText("Inspection bay");
    await wizard.getByRole("button", { name: "Finish setup" }).click();
    expect(new URL(page.url()).searchParams.get("space")).toBe(itemId);
    await expect(wizard).toHaveCount(0);
    await page.reload();
    await controls.getByLabel("Building", { exact: true }).selectOption({ label: "Annex" });
    await controls.getByLabel("Floor", { exact: true }).selectOption({ label: "Mezzanine" });
    await controls.getByLabel("Section", { exact: true }).selectOption({ label: "Inspection bay" });
    await expect(outline).toHaveAttribute("height", "4");
  }
});
