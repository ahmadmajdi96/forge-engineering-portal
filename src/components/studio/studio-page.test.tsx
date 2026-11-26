import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ApplicationStudioPage } from "./studio-page";
import { newStudioApplication } from "@/lib/studio/model";
import { loadFactoryWorkspace } from "@/lib/production/workspace.functions";

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useBlocker: vi.fn(),
}));
vi.mock("@tanstack/react-start", async (original) => ({
  ...(await original<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/production/workspace.functions", () => ({
  loadFactoryWorkspace: vi.fn(),
  saveFactoryWorkspace: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("links validation findings to their editor and preserves draft input when reload fails", async () => {
  const app = newStudioApplication("station", "Line inspection", "operator");
  app.entry = "missing-step";
  vi.mocked(loadFactoryWorkspace)
    .mockResolvedValueOnce({ revision: 2, payload: { version: 1, applications: [app] } })
    .mockRejectedValueOnce(new Error("Offline"));
  const navigate = vi.fn();
  render(
    <ApplicationStudioPage
      mode="local"
      site={{ key: "training-north", name: "North" }}
      selectApp={vi.fn()}
      selectPane={navigate}
    />,
  );
  const name = await screen.findByLabelText("Application name");
  fireEvent.change(name, { target: { value: "Edited inspection" } });
  fireEvent.click(screen.getByRole("button", { name: "Validate" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Open Workflow" })[0]!);
  expect(navigate).toHaveBeenCalledWith("workflow");
  expect(screen.getByRole("navigation", { name: "Studio views" })).toHaveFocus();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Reload saved" }));
  expect(await screen.findByText(/Reload failed/)).toBeVisible();
  expect(screen.getByLabelText("Application name")).toHaveValue("Edited inspection");
  expect(screen.getByRole("button", { name: "Export draft" })).toBeEnabled();
});
