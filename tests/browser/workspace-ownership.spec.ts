import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function session(page: Page, origin: string, reviewer = false) {
  expect(new URL(origin).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  const env = readFileSync(".ems/runtime.env", "utf8");
  const name = reviewer ? "EMS_FIXTURE_REVIEWER_TOKEN" : "EMS_FIXTURE_AUTHOR_TOKEN";
  const token = new RegExp("^" + name + "=(\\S+)$", "m").exec(env)![1]!;
  const response = await page.request.post(new URL("/api/ems/auth/fixture", origin).href, {
    headers: { origin },
    form: { token },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
}

test("old bookmarks preserve factory context and reports export only available evidence", async ({
  page,
  baseURL,
}) => {
  await session(page, baseURL!, true);
  await page.goto("/reports?site=training-south&engLine=PACK-A&report=calibration");
  await expect(page).toHaveURL(/\/registry\?/);
  const search = new URL(page.url()).searchParams;
  expect(search.get("site")).toBe("training-south");
  expect(search.get("engLine")).toBe("PACK-A");
  expect(search.get("report")).toBe("calibration");
  await expect(
    page.getByText(/Native calibration dates, intervals and certificates are unavailable/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Signed change history", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  await page.getByRole("button", { name: "Master data inventory", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/inventory.*\.csv$/);
  await page.goto("/analytics?site=training-south");
  await expect(page).toHaveURL(/\/diagnostics\?site=training-south/);
});

test("terminal-only and unavailable-version Studio links cannot open an unrelated editor", async ({
  page,
  baseURL,
}) => {
  await session(page, baseURL!, true);
  await page.goto(
    "/application-studio?site=training-north&source=terminalId&entity=only-this-terminal&terminal=only-this-terminal",
  );
  await expect(page.getByRole("region", { name: "Terminal Studio assignments" })).toContainText(
    "only-this-terminal",
  );
  await expect(page.getByText("No matching published release assignment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await page.goto(
    "/application-studio?site=training-north&app=missing-application&revision=999999",
  );
  await expect(page.getByRole("button", { name: "Retry assigned revision" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
});

test("published Studio revision still previews when the current head loses its application", async ({
  page,
  baseURL,
}) => {
  test.skip(
    process.env["EMS_DISPOSABLE_RELEASE_TEST"] !== "1",
    "Requires the disposable factory-acceptance release.",
  );
  await session(page, baseURL!);
  const site = "training-north";
  const releases = await page.request.get("/api/ems/releases", { params: { site } });
  expect(releases.ok()).toBe(true);
  const body = await releases.json();
  const release = (Array.isArray(body) ? body : body.releases).find(
    (r: { status: string }) => r.status === "published",
  );
  expect(release).toBeTruthy();
  const endpoint = "/api/ems/workspace";
  const head = await (
    await page.request.get(endpoint, { params: { site, workspace: "studio" } })
  ).json();
  expect(
    head.payload.applications.some((a: { id: string }) => a.id === release.application_id),
  ).toBe(true);
  const update = await page.request.put(endpoint, {
    headers: { origin: baseURL! },
    data: {
      site,
      workspace: "studio",
      expected: head.revision,
      reason: "Isolate published preview from the editable head",
      payload: {
        ...head.payload,
        applications: head.payload.applications.filter(
          (a: { id: string }) => a.id !== release.application_id,
        ),
      },
    },
  });
  expect(update.status()).toBe(200);
  await page.goto(
    "/application-studio?" +
      new URLSearchParams({
        site,
        app: release.application_id,
        revision: String(release.workspace_revision),
      }),
  );
  await expect(page.getByText(/Interactive simulation of this exact version/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Interactive simulation of this exact version/)).toBeVisible();
});
