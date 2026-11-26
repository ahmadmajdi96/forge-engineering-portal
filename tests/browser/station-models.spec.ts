import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("place station assemblies, select the same occurrence across views, and undo placement", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const token = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(
    readFileSync(".ems/runtime.env", "utf8"),
  )?.[1];
  expect(token, "Local author fixture is configured").toBeTruthy();
  await page.goto("/factory-layout?site=training-north");
  await page.getByLabel("Fixture access token").fill(token!);
  await page.getByRole("button", { name: "Sign in to fixture" }).click();

  const collections = page.getByRole("group", { name: "Library collection" });
  const library = page.getByLabel("Component templates");
  const search = page.getByRole("searchbox", { name: "Find a component" });
  const place = page.getByRole("button", { name: "Place on floor" });
  const plan = page.getByRole("group", { name: "Floor plan in metres" });
  const elevation = page.getByRole("group", { name: "Front elevation in metres" });
  await expect(collections.getByRole("button", { name: "Station assemblies" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("spatial-3d").locator("canvas")).toBeVisible();
  const destination = page.getByRole("combobox", { name: "Placement station" });
  if (await destination.count()) await destination.selectOption({ index: 1 });

  const bench = "Commissioning workbench";
  const gate = "Access control gate";
  const benches = plan.getByRole("button", { name: bench, exact: true });
  const gates = plan.getByRole("button", { name: gate, exact: true });
  const initialBenches = await benches.count();
  const initialGates = await gates.count();
  await search.fill("commissioning");
  await library.getByRole("button", { name: /Commissioning workbench/ }).click();
  await expect(library.getByRole("button", { name: /Access control gate/ })).toHaveCount(0);
  await place.click();
  await expect(benches).toHaveCount(initialBenches + 1);
  await expect(page.getByLabel("Occurrence name")).toHaveValue(bench);

  await search.fill("access control");
  await library.getByRole("button", { name: /Access control gate/ }).click();
  await place.click();
  await expect(gates).toHaveCount(initialGates + 1);
  await expect(elevation.getByRole("button", { name: gate, exact: true }).last()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await benches.last().press("Enter");
  await expect(elevation.getByRole("button", { name: bench, exact: true }).last()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(gates.last()).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Occurrence name")).toHaveValue(bench);

  await collections.getByRole("button", { name: "Equipment" }).click();
  await expect(search).toHaveValue("");
  await search.fill("machine");
  await expect(library.getByRole("button", { name: /Machine envelope/ })).toBeVisible();
  await search.fill("commissioning");
  await expect(library.getByText("No matching templates.")).toBeVisible();
  await expect(place).toBeDisabled();

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.click();
  await expect(gates).toHaveCount(initialGates);
  await expect(elevation.getByRole("button", { name: gate, exact: true })).toHaveCount(
    initialGates,
  );
  await expect(benches).toHaveCount(initialBenches + 1);
  await undo.click();
  await expect(benches).toHaveCount(initialBenches);
  await expect(elevation.getByRole("button", { name: bench, exact: true })).toHaveCount(
    initialBenches,
  );
});
