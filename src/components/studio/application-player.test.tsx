import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { blankNode, makeWidget, newStudioApplication } from "@/lib/studio/model";
import { ApplicationPlayer, StudioWidgetView } from "./application-player";

afterEach(cleanup);

function withConnector() {
  const app = newStudioApplication("assembly", "First release", "operator");
  app.connectorIds.push("record-result");
  app.nodes.push({
    ...blankNode("submit-evidence", "Submit evidence", "connector"),
    connectorId: "record-result",
    timeoutMs: 1000,
  });
  app.nodes.push({ ...blankNode("declined", "Not accepted", "terminal"), outcome: "failed" });
  app.transitions[0]!.to = "submit-evidence";
  app.transitions.push(
    {
      id: "accepted",
      from: "submit-evidence",
      to: "done",
      event: "success",
      guard: null,
      effects: [],
    },
    {
      id: "rejected",
      from: "submit-evidence",
      to: "declined",
      event: "failure",
      guard: null,
      effects: [],
    },
  );
  return app;
}

test("isolates simulation from player adapters and pins the original draft while running", async () => {
  const first = withConnector();
  const request = vi.fn();
  const { rerender } = render(
    <ApplicationPlayer app={first} mode="simulation" adapter={{ request }} variant="portrait" />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Start run" }));
  rerender(
    <ApplicationPlayer
      app={{ ...first, name: "Second release" }}
      mode="player"
      adapter={{ request }}
      variant="portrait"
    />,
  );
  expect(screen.getByText("First release")).toBeVisible();
  expect(screen.queryByText("Second release")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(screen.getByText("complete", { exact: true })).toBeVisible());
  expect(request).not.toHaveBeenCalled();
});

test("player only sends an allowlisted connector request once on duplicate submit", async () => {
  const app = withConnector();
  const request = vi.fn(async (request: { id: string }) => ({
    requestId: request.id,
    outcome: "accepted" as const,
  }));
  render(<ApplicationPlayer app={app} mode="player" adapter={{ request, runId: "pinned-run" }} />);
  fireEvent.click(screen.getByRole("button", { name: "Start run" }));
  const button = screen.getByRole("button", { name: "Continue" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByText("complete", { exact: true })).toBeVisible());
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]![0]).toMatchObject({
    id: "pinned-run:1:submit-evidence",
    connectorId: "record-result",
  });
});

test("shows stale signal values without presenting a stale reading as current", () => {
  const app = newStudioApplication("signals", "Status", "hmi");
  app.signals.push({
    id: "pressure",
    name: "Pressure",
    type: "number",
    unit: "kPa",
    freshnessMs: 100,
  });
  const item = { ...makeWidget("read", "signal", 1), signalId: "pressure", unit: "kPa" };
  render(
    <StudioWidgetView
      item={item}
      app={app}
      run={null}
      now={210}
      disabled
      observation={{ value: 20, quality: "good", observedAt: 100, receivedAt: 105 }}
      onInput={() => {}}
      onEvent={() => {}}
    />,
  );
  expect(screen.getByText("Stale")).toBeVisible();
  expect(screen.queryByText("20 kPa")).toBeNull();
});

test("requires a verified edge authorization for every bounded-offline startup", () => {
  const app = { ...withConnector(), offlinePolicy: "bounded-offline" as const };
  const request = vi.fn();
  render(
    <ApplicationPlayer app={app} mode="player" adapter={{ request, connectivity: "offline" }} />,
  );
  expect(screen.getByRole("button", { name: "Start run" })).toBeDisabled();
  expect(screen.getByText(/verified edge grant/)).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});
