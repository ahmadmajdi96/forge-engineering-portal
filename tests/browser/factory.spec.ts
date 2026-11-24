import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const key = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(readFileSync(".ems/runtime.env", "utf8"))?.[1];

test("factory renderer, saved layout and protected QA", async ({ page, request }) => {
  test.setTimeout(45_000);
  const denied = await request.get("/api/ems/qa?site=training-north");
  expect(denied.status()).toBe(401);
  await page.goto("/factory-layout?site=training-north");
  await expect(page.getByRole("button", { name: "Sign in to fixture" })).toBeVisible();
  expect(key).toBeTruthy();
  await page.getByLabel("Fixture access token").fill(key!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await expect(page.getByRole("heading", { name: "Factory layout", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Engineering Overview", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.getByRole("button", { name: "Show all workspaces" }).click();
  await page.getByRole("link", { name: "Edge App Studio", exact: true }).click();
  await expect(page).toHaveURL(/edge-app-studio/);
  await page.getByRole("link", { name: "Factory layout", exact: true }).click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((element) =>
      Boolean((element as HTMLCanvasElement).getContext("webgl2")),
    ),
  ).toBe(true);
  const planMachine = page
    .getByRole("group", { name: "Floor plan in metres" })
    .getByRole("button", { name: "Machine envelope" });
  const elevationMachine = page
    .getByRole("group", { name: "Front elevation in metres" })
    .getByRole("button", { name: "Machine envelope" });
  await planMachine.press("Enter");
  await expect(planMachine).toHaveAttribute("aria-pressed", "true");
  await expect(elevationMachine).toHaveAttribute("aria-pressed", "true");
  const initialPlan = (await planMachine.getAttribute("points"))!;
  const initialElevation = (await elevationMachine.getAttribute("points"))!;
  const x = page.getByLabel("Floor position (m) X", { exact: true });
  const start = await x.inputValue();
  await x.fill(String(Number(start) + 1));
  await page.getByRole("button", { name: "Apply properties" }).click();
  await expect(planMachine).not.toHaveAttribute("points", initialPlan);
  await expect(elevationMachine).not.toHaveAttribute("points", initialElevation);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(planMachine).toHaveAttribute("points", initialPlan);
  await expect(elevationMachine).toHaveAttribute("points", initialElevation);
  await page.getByRole("link", { name: "Admin QA", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Admin QA", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  const migrations = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Database and migrations" }) });
  await expect(migrations.getByRole("cell", { name: "pass", exact: true })).toBeVisible({
    timeout: 12_000,
  });
  await expect(page.getByRole("row", { name: /Physical commissioning blocked/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/factory-layout?site=training-north");
  await expect(page.getByRole("button", { name: "View tools" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  const mobileCanvas = page.locator("canvas").first();
  await expect(mobileCanvas).toBeVisible();
  expect((await mobileCanvas.boundingBox())!.y).toBeLessThan(600);
  await page.getByRole("button", { name: "View tools" }).click();
  await expect(page.getByLabel("Grid snap distance")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("original and factory sidebar destinations render after sign-in", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByLabel("Fixture access token").fill(key!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await expect(page.getByRole("heading", { name: "Engineering Overview" })).toBeVisible();
  await page.getByRole("button", { name: "Show all workspaces" }).click();
  const routes = await page
    .locator('[data-sidebar="menu-button"][href]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")!));
  expect(routes.length).toBeGreaterThan(30);
  for (const href of routes) {
    await page.goto(href);
    await expect(page.locator("main").last(), href).toBeVisible();
    await expect(page.getByText("This page didn't load", { exact: true }), href).toHaveCount(0);
    expect(new URL(page.url()).pathname, href).toBe(new URL(href, page.url()).pathname);
  }
});

test("recover sign-in and find the scoped workspace from a narrow navigation drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?site=training-south");
  const input = page.getByLabel("Fixture access token");
  await input.fill("rejected-training-token");
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await expect(page.getByRole("alert")).toContainText("token was rejected");
  await expect(input).toBeFocused();
  await input.fill(key!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  const find = page.getByRole("searchbox", { name: "Find a workspace" });
  await find.fill("unmatched query");
  await expect(
    page.getByRole("status").filter({ hasText: "No matching workspaces" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(find).toBeFocused();
  await find.fill("application studio");
  await find.press("Tab");
  await expect(page.getByRole("link", { name: "Application Studio", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/application-studio\?site=training-south/);
});

test("legacy studio keeps a new application's workflow and screens separate", async ({ page }) => {
  await page.goto("/edge-app-studio?site=training-north");
  await page.getByLabel("Fixture access token").fill(key!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();
  await page.getByRole("button", { name: "New application", exact: true }).click();
  await page.getByLabel("Application name", { exact: true }).fill("Operator loading");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("No steps. Add one from the palette.")).toBeVisible();
  await page.getByRole("button", { name: /^Weigh Read/ }).click();
  await page.getByLabel("Weight target", { exact: true }).fill("20");
  const app = await page.getByLabel("Application", { exact: true }).inputValue();
  await page.getByLabel("Application", { exact: true }).selectOption("APP-INTAKE");
  await expect(page.getByLabel("Workflow step label")).not.toHaveValue("Weigh");
  await page.getByLabel("Application", { exact: true }).selectOption(app);
  await expect(page.getByLabel("Weight target", { exact: true })).toHaveValue("20");
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  await page.getByRole("link", { name: "Open screen editor" }).click();
  await expect(page.getByRole("combobox", { name: "Parent application", exact: true })).toHaveValue(
    app,
  );
  await expect(page.getByLabel("Operator screen", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New operator screen", exact: true }).click();
  await page.getByLabel("Operator screen name", { exact: true }).fill("Load confirmation");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: /^Instruction Display/ }).click();
  await expect(page.getByLabel("Widget name", { exact: true })).toHaveValue("Instruction");
});
