import { describe, expect, it } from "vitest";
import { makeModel } from "@/lib/engineering/model";
import type { SpatialDocument } from "@/lib/spatial/model";
import { processDocumentSchema } from "./process";
import { processLinkProblems } from "./process-links";

const document = processDocumentSchema.parse({
  version: 1,
  routes: [
    {
      id: "mix",
      lineId: "L-01",
      name: "Mix",
      start: "s1",
      product: null,
      recipe: null,
      quality: { object: "qa", revision: "v1" },
      steps: [
        {
          id: "s1",
          operationId: "OP-1",
          name: "Heat",
          stationIds: ["placed-station"],
          capabilities: [],
          evidence: [],
          expectedSeconds: 240,
          waitTimeoutSeconds: null,
          outcome: "operation",
        },
      ],
      transitions: [],
    },
  ],
});
const spaces: SpatialDocument["spaces"] = [
  {
    id: "placed-line",
    engineeringId: "L-01",
    kind: "line",
    label: "Mixer line",
    parentId: "area",
    floor: null,
  },
  {
    id: "placed-station",
    engineeringId: "ST-102",
    kind: "station",
    label: "Heater",
    parentId: "placed-line",
    floor: null,
  },
];
describe("manufacturing route links", () => {
  it("resolves configured lines and operations independently from station layout IDs", () => {
    const design = makeModel();
    expect(processLinkProblems(document, design, spaces).size).toBe(0);
    expect([
      ...processLinkProblems(document, design, [
        spaces[0]!,
        { ...spaces[1]!, parentId: "other-line" },
      ]).values(),
    ]).toEqual(["Step Heat uses a station outside the selected line layout."]);
    const archived = {
      ...design,
      records: design.records.map((r) => (r.id === "OP-1" ? { ...r, archived: true } : r)),
    };
    expect([...processLinkProblems(document, archived, spaces).values()]).toEqual([
      "Step Heat refers to an unavailable manufacturing operation on this line.",
    ]);
  });
  it("preserves existing factory-wide route data and exact quality references across reload", () => {
    const legacy = {
      ...document.routes[0]!,
      lineId: undefined,
      steps: document.routes[0]!.steps.map((s) => ({ ...s, operationId: undefined })),
    };
    const parsed = processDocumentSchema.parse({ version: 1, routes: [legacy] });
    expect(processLinkProblems(parsed, null, []).size).toBe(0);
    expect(parsed.routes[0]?.quality).toEqual({ object: "qa", revision: "v1" });
  });
});
