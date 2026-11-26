import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("a process template assignment survives a factory draft save and reload", async ({
  page,
  baseURL,
}) => {
  test.skip(
    process.env["EMS_DISPOSABLE_SPACE_TEST"] !== "1",
    "Writes only to the disposable packaging factory.",
  );
  expect(new URL(baseURL!).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  const site = "training-south";
  const endpoint = "/api/ems/workspace";
  const token = /^EMS_FIXTURE_AUTHOR_TOKEN=(\S+)$/m.exec(
    readFileSync(".ems/runtime.env", "utf8"),
  )![1]!;
  const auth = await page.request.post("/api/ems/auth/fixture", {
    headers: { origin: baseURL! },
    form: { token },
    maxRedirects: 0,
  });
  expect(auth.status()).toBe(303);
  const read = () =>
    page.request
      .get(endpoint, { params: { site, workspace: "engineering" } })
      .then((r) => r.json());
  const { revision, payload } = await read();
  const record = {
    id: "T-CHECK",
    kind: "template",
    name: "Inspection check",
    parent: "PACK-A",
    version: "r1",
    description: "",
    binding: "",
    unit: "",
    value: "",
    required: false,
    archived: false,
  };
  payload.model.records.push(record);
  const result = await page.request.put(endpoint, {
    headers: { origin: baseURL! },
    data: {
      site,
      workspace: "engineering",
      expected: revision,
      payload,
      reason: "Install template in disposable factory",
    },
  });
  expect(result.status(), await result.text()).toBe(200);
  await page.goto("/step-templates?site=training-south&engLine=PACK-A");
  const checkbox = page.getByRole("checkbox", { name: "Assign Inspection check to Verify weight" });
  await checkbox.check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Change reason")
    .fill("Assign the inspection template to the weight station");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(checkbox).toBeChecked();
  const saved = await read();
  expect(saved.revision).toBe(revision + 2);
  expect(saved.payload.model.records).toContainEqual(
    expect.objectContaining({ id: "T-CHECK", version: "r1" }),
  );
  expect(
    saved.payload.model.stations.find((s: { id: string }) => s.id === "CHECK").config.templateIds,
  ).toContain("T-CHECK");
});
