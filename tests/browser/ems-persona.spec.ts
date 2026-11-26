import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("the EMS persona follows sign-in into the scoped dashboard and supports keyboard inspection", async ({
  page,
}) => {
  const token = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(
    readFileSync(".ems/runtime.env", "utf8"),
  )?.[1];
  expect(token).toBeTruthy();
  await page.goto("/?site=training-north");
  const portrait = page.getByRole("img", { name: /Sentinel, a yellow tracked rover/ });
  await expect(portrait).toBeVisible();
  await expect
    .poll(() => portrait.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Meet Sentinel" })).toHaveCount(0);

  await page.getByLabel("Fixture access token").fill(token!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await expect(page.getByRole("complementary", { name: "Sentinel engineering brief" })).toBeVisible(
    { timeout: 15000 },
  );

  const trigger = page.getByRole("button", { name: "Meet Sentinel" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const profile = page.getByRole("dialog", { name: "Sentinel" });
  await expect(profile).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(profile).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/site=training-north/);
});
