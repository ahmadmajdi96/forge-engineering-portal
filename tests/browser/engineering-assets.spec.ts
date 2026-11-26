import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("a draft hardware identity appears in matching table and hierarchy views", async ({
  page,
}) => {
  const key = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(
    readFileSync(".ems/runtime.env", "utf8"),
  )?.[1];
  expect(key).toBeTruthy();
  await page.goto("/registry?site=training-north");
  await page.getByLabel("Fixture access token").fill(key!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await expect(page.getByRole("heading", { name: "Assets", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manage engineering records" }).click();
  await page.getByLabel("Record type").selectOption("equipment");
  await expect(page.getByLabel("Record type").locator('option[value="screen"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Add equipment", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create record" });
  await editor.getByLabel("Record name").fill("Commissioning bench fixture");
  await editor.getByRole("button", { name: "Apply to draft" }).click();
  await page.getByRole("button", { name: "Close records" }).click();
  await page.getByLabel("Find assets").fill("Commissioning bench fixture");
  await page.getByLabel("Find assets").press("Enter");
  await page.getByRole("button", { name: "Commissioning bench fixture", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Commissioning bench fixture", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/engAsset=/);
  await page.getByRole("button", { name: "Tree", exact: true }).click();
  await expect(page.getByRole("button", { name: /Commissioning bench fixture ·/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Duplicate Commissioning bench fixture" }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Commissioning bench fixture copy", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Commissioning bench fixture copy", exact: true }).click();
  await page.getByRole("button", { name: "Archive Commissioning bench fixture copy" }).click();
  await page
    .getByRole("dialog", { name: "Archive record" })
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Commissioning bench fixture copy", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("combobox", { name: "Lifecycle", exact: true }).selectOption("archived");
  await expect(
    page.getByRole("button", { name: "Commissioning bench fixture copy", exact: true }),
  ).toBeVisible();
});
