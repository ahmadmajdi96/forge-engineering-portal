import { describe, expect, it } from "vitest";
import { makeModel } from "@/lib/engineering/model";
import { newStudioApplication } from "@/lib/studio/model";
import { createOccurrence, emptySpatialDocument, origin } from "@/lib/spatial/model";
import { processTrace } from "@/lib/spatial/process-trace";
import { processDocumentSchema, validateRoute, type ProcessRoute } from "./process";
import { processLinkProblems, stationHandoffIssues } from "./process-links";

function fixture() {
  const design = makeModel(),
    station = design.stations[0]!;
  station.mode = "semi_auto";
  const source = design.signals[0]!;
  Object.assign(source, {
    stationId: station.id,
    equipmentId: "scale",
    access: "Read",
    type: "Number",
    unit: "kg",
  });
  const app = newStudioApplication("inspection", "Inspection", "hmi");
  app.signals = [{ id: "net", name: "Net weight", unit: "kg", type: "number", freshnessMs: 1000 }];
  const studio = { version: 1 as const, applications: [app] };
  const route: ProcessRoute = {
    id: "pack",
    name: "Pack",
    lineId: station.lineId,
    sections: [{ id: "inspection", name: "Inspection" }],
    product: null,
    recipe: null,
    start: "weigh",
    transitions: [],
    steps: [
      {
        id: "weigh",
        name: "Weigh",
        sectionId: "inspection",
        stationIds: [],
        engineeringStationIds: [station.id],
        completionSignal: source.key,
        consumers: [{ kind: "studio", appId: app.id, signalId: "net" }],
        capabilities: [],
        evidence: [],
        expectedSeconds: 25,
        waitTimeoutSeconds: null,
        outcome: "operation",
      },
    ],
  };
  const document = { version: 1 as const, routes: [route] };
  return { design, station, source, studio, app, document, route, step: route.steps[0]! };
}
describe("connected production line", () => {
  it("preserves legacy routes and rejects invalid section membership and ambiguous participation", () => {
    const { document, route, step } = fixture();
    step.engineeringStationIds!.push("second");
    expect(validateRoute(route)).toContain("Weigh needs a participation rule for its stations.");
    step.participation = "all";
    expect(validateRoute(route)).not.toContain(
      "Weigh needs a participation rule for its stations.",
    );
    step.sectionId = "missing";
    expect(processDocumentSchema.safeParse(document).success).toBe(false);
    delete route.sections;
    delete step.sectionId;
    delete step.engineeringStationIds;
    delete step.consumers;
    delete step.completionSignal;
    delete step.participation;
    step.stationIds = ["old-placement"];
    expect(processDocumentSchema.parse(document)).toEqual(document);
  });
  it("checks a handoff, source ownership and engineering units even before placement", () => {
    const { document, route, step, design, source, app, studio } = fixture();
    const issues = () => [...processLinkProblems(document, design, [], studio).values()];
    expect(issues()).toEqual([]);
    expect(stationHandoffIssues(route, design)).toHaveLength(2);
    step.operatorRole = "Inspector";
    step.handoff = "Confirm the fresh weight";
    expect(stationHandoffIssues(route, design)).toEqual([]);
    app.signals[0]!.unit = "lb";
    expect(issues().join()).toMatch(/matching type and unit/);
    source.stationId = "other";
    expect(issues().join()).toMatch(/owned by an assigned station/);
  });
  it("traces the assigned scale to its placed HMI and excludes another station using the same HMI", () => {
    const { design, route, station, app } = fixture(),
      layout = emptySpatialDocument("training");
    layout.spaces.push(
      {
        id: "line",
        kind: "line",
        parentId: "area",
        engineeringId: station.lineId,
        label: "Pack",
        floor: null,
      },
      {
        id: "place",
        kind: "station",
        parentId: "line",
        engineeringId: station.id,
        label: "Inspection",
        floor: null,
      },
    );
    const source = createOccurrence(layout.catalog[0]!, "place", origin),
      sink = createOccurrence(layout.catalog[0]!, "place", origin);
    source.asset = { system: "EMS", kind: "equipment", id: "scale", exclusive: true };
    sink.authoringAppId = app.id;
    layout.occurrences.push(source, sink, { ...sink, id: "outside", stationId: "another-station" });
    expect(processTrace(route, "weigh", "inspection", layout, design).paths).toEqual([
      { from: source.id, to: sink.id },
    ]);
    expect(processTrace(route, "weigh", "another-section", layout, design).paths).toEqual([]);
    layout.occurrences.shift();
    expect(processTrace(route, "weigh", "inspection", layout, design).findings).toContain(
      "Weigh · Source equipment placement unresolved",
    );
  });
});

it("resolves every published training example reference before a fixture install", async () => {
  const { default: example } =
    await import("../../../docs/factory-engineering/packaging-training.json");
  const { modelSchema } = await import("@/lib/engineering/model");
  const { studioWorkspaceSchema } = await import("@/lib/studio/model");
  const { spatialDocumentSchema } = await import("@/lib/spatial/model");
  const { validateSpatialRelationships } = await import("@/lib/spatial/validation");
  const design = modelSchema.parse(example.engineering.model),
    studio = studioWorkspaceSchema.parse(example.studio),
    layout = spatialDocumentSchema.parse(example.spatial),
    process = processDocumentSchema.parse(example.process),
    route = process.routes[0]!;
  expect(validateRoute(route)).toEqual([]);
  expect(stationHandoffIssues(route, design)).toEqual([]);
  expect([...processLinkProblems(process, design, layout.spaces, studio).values()]).toEqual([]);
  expect(validateSpatialRelationships(layout)).toEqual([]);
  const trace = processTrace(route, "weigh", "fill-inspect", layout, design);
  expect(trace.findings).toEqual([]);
  expect(trace.stations.size).toBe(2);
  expect(trace.paths).toHaveLength(1);
  expect(layout.connections.some((c) => c.kind === "network")).toBe(true);
});
