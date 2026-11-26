import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { RouteGraph, StepRelationships } from "@/components/engineering/process-relationships";
import { makeModel } from "@/lib/engineering/model";
import type { ProcessRoute } from "@/lib/production/process";

const step = {
  id: "fill",
  name: "Fill",
  stationIds: ["old-station"],
  capabilities: [],
  evidence: [],
  expectedSeconds: 30,
  waitTimeoutSeconds: null,
  outcome: "operation" as const,
};
const route: ProcessRoute = {
  id: "fill-package",
  name: "Fill and pack",
  start: "fill",
  product: null,
  recipe: null,
  steps: [
    step,
    { ...step, id: "pack", name: "Pack" },
    { ...step, id: "reject", name: "Reject", outcome: "failed" },
  ],
  transitions: [
    { from: "fill", to: "pack", outcome: "success", condition: null, maxAttempts: null },
    { from: "fill", to: "reject", outcome: "failure", condition: null, maxAttempts: null },
    {
      from: "fill",
      to: "fill",
      outcome: "rework",
      condition: { variable: "mass", equals: 2 },
      maxAttempts: 3,
    },
  ],
};

describe("process engineering workspaces", () => {
  it("navigates a real failure branch with its corresponding upstream edge and bounded rework", () => {
    function Graph() {
      const [id, set] = useState("fill");
      return (
        <RouteGraph route={route} current={route.steps.find((s) => s.id === id)} visit={set} />
      );
    }
    render(<Graph />);
    const graph = screen.getByRole("region", { name: "Route graph" });
    expect(within(graph).getAllByText(/up to 3 attempts.*mass = 2/)).toHaveLength(2);
    fireEvent.click(within(graph).getByRole("button", { name: "Reject" }));
    expect(within(graph).getByRole("combobox")).toHaveValue("reject");
    expect(within(graph).getByText("Terminal outcome")).toBeInTheDocument();
    expect(within(graph).getByRole("link", { name: "Edit step" })).toHaveAttribute(
      "href",
      "#process-step-reject",
    );
  });
  it("shows unresolved existing IDs while assigning only placed stations in the selected line", () => {
    const put = vi.fn();
    const spaces = [
      { id: "line-place", kind: "line", label: "Line", parentId: "area", engineeringId: "L-01" },
      {
        id: "mix",
        kind: "station",
        label: "Mixer",
        parentId: "line-place",
        engineeringId: "ST-102",
      },
      {
        id: "other",
        kind: "station",
        label: "Off line",
        parentId: "other-line",
        engineeringId: "ST-X",
      },
    ];
    render(
      <StepRelationships
        step={step}
        lineId="L-01"
        catalog={{
          site: "north",
          applications: [],
          studioStatus: null,
          design: makeModel(),
          spaces,
          designStatus: null,
          layoutStatus: null,
        }}
        put={put}
      />,
    );
    expect(screen.getByText(/Unresolved station.*old-station/)).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Off line/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Find station or operation"), {
      target: { value: "ST-102" },
    });
    fireEvent.change(screen.getByLabelText("Add station"), { target: { value: "mix" } });
    expect(put).toHaveBeenCalledWith({ stationIds: ["old-station", "mix"] });
  });
});
