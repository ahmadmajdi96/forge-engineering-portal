import { z } from "zod";
import { designRecordSchema, initialDesignRecords } from "./design-records";
import { lineSchema, stationConfigSchema } from "./asset-schema";
export const stationSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  mode: z.enum(["manual", "automatic", "semi_auto"]),
  equipment: z.array(z.string()),
  app: z.string(),
  operation: z.string(),
  tracking: z.enum(["lot", "unit", "batch", "continuous"]),
  requiresScale: z.boolean().optional(),
  requiresChallenge: z.boolean().optional(),
  scaleBound: z.boolean(),
  challengeBound: z.boolean(),
  lineId: z.string().default("L-01"),
  config: stationConfigSchema.optional(),
});
export function isSignalReferenceSafe(value: string) {
  return !/\w+:\/\/[^/\s]+@|(?:^|[?&;\s])(?:password|passwd|api[_-]?key|secret|token)=/i.test(value);
}
export const signalSchema = z.object({
  key: z.string().min(1),
  stationId: z.string().min(1).optional(),
  equipmentId: z.string().min(1).optional(),
  interfaceRef: z.string().trim().max(160).refine(isSignalReferenceSafe, "Enter an interface reference without credentials.").optional(),
  protocol: z.enum(["OPC UA", "MQTT", "Modbus TCP", "EtherNet/IP", "PROFINET", "REST", "Discrete I/O"]).optional(),
  scale: z.number().finite().refine(value => value !== 0).optional(),
  offset: z.number().finite().optional(),
  requiredCapability: z.string().trim().max(160).optional(),
  address: z.string().refine(isSignalReferenceSafe, "Enter a tag reference without credentials."),
  type: z.enum(["Boolean", "Uint32", "Enum", "Number"]),
  unit: z.string(),
  expectedUnit: z.string(),
  access: z.enum(["Read", "Command"]),
  quality: z.enum(["Good", "Stale", "Bad", "Unavailable"]),
  value: z.string(),
  maxAge: z.number().positive(),
  age: z.number().nonnegative(),
  required: z.boolean(),
});
export const stepSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  kind: z.string(),
  signal: z.string(),
  evidence: z.boolean(),
  timeout: z.number().nonnegative(),
  failure: z.boolean(),
  weightTarget: z.number().finite().optional(),
  weightTolerance: z.number().nonnegative().optional(),
});
export const workflowDraftSchema = z.object({
  steps: z.array(stepSchema),
  offline: z.enum(["online-required", "bounded-offline", "read-only-offline"]),
  offlineMinutes: z.number().nonnegative(),
});
export const modelSchema = z.object({
  lines: z
    .array(lineSchema)
    .default([
      {
        id: "L-01",
        name: "Mixer Line A",
        plant: "Plant 01 Riyadh / Process area A",
        status: "idle",
        target: 0,
        archived: false,
      },
    ]),
  records: z.array(designRecordSchema).default(initialDesignRecords),
  name: z.string().min(1),
  scope: z.string(),
  stations: z.array(stationSchema),
  archivedStations: z.array(stationSchema).optional(),
  signals: z.array(signalSchema),
  appWorkflows: z.record(z.string(), workflowDraftSchema).optional(),
  steps: z.array(stepSchema),
  offline: z.enum(["online-required", "bounded-offline", "read-only-offline"]),
  offlineMinutes: z.number().nonnegative(),
  mesAck: z.boolean(),
  edgeAck: z.boolean(),
  commissioned: z.boolean(),
  desired: z.string(),
  actual: z.string(),
  reason: z.string(),
  routeEdges: z.array(z.tuple([z.string(), z.string()])).default([]),
  adapter: z
    .object({
      protocol: z.string(),
      endpoint: z.string(),
      credentialRef: z.string(),
      securityMode: z.string(),
      pollMs: z.number().positive(),
    })
    .default({
      protocol: "OPC UA",
      endpoint: "opc.tcp://10.21.4.14:4840",
      credentialRef: "",
      securityMode: "SignAndEncrypt",
      pollMs: 1000,
    }),
});
export type EngineeringModel = z.infer<typeof modelSchema>;
export type Issue = { id: string; object: string; message: string; category: string };
export function makeModel(): EngineeringModel {
  return {
    lines: [
      {
        id: "L-01",
        name: "Mixer Line A",
        plant: "Plant 01 Riyadh / Process area A",
        status: "idle",
        target: 0,
        archived: false,
      },
    ],
    records: initialDesignRecords(),
    name: "Mixer Line A",
    scope: "Plant 01 Riyadh / Process area A",
    stations: [
      ["ST-101", "Raw Intake", "manual", "Material Intake v1.1", "OP-010"],
      ["ST-102", "Mixing Vessel M1", "automatic", "Mixing Control v2.0", "OP-020"],
      ["ST-103", "Extruder E2", "automatic", "Extrusion Control v2.1", "OP-030"],
      ["ST-104", "Metal Detector (CCP)", "automatic", "Metal Detection v2.3", "OP-040"],
      ["ST-105", "Wrap & Seal", "automatic", "Wrap & Seal v1.4", "OP-050"],
      ["ST-106", "Case Pack & Palletize", "manual", "Palletize v1.3", "OP-060"],
    ].map((s, i) => ({
      id: s[0] ?? "",
      lineId: "L-01",
      name: s[1] ?? "",
      mode: s[2] === "manual" ? "manual" : "automatic",
      equipment: i === 3 ? ["MD-104"] : ["EQ-" + (101 + i), "TERM-" + (101 + i)],
      app: s[3] ?? "",
      operation: s[4] ?? "",
      tracking: "lot",
      requiresScale: i === 0,
      requiresChallenge: i === 3,
      scaleBound: i !== 0,
      challengeBound: i !== 3,
    })),
    signals: [
      {
        key: "metal_detected",
        stationId: "ST-104",
        equipmentId: "MD-104",
        protocol: "OPC UA",
        address: "ns=4;s=MetalDetection/Detected",
        type: "Boolean",
        unit: "—",
        expectedUnit: "—",
        access: "Read",
        quality: "Good",
        value: "False",
        maxAge: 60,
        age: 2,
        required: false,
      },
      {
        key: "reject_count",
        stationId: "ST-104",
        equipmentId: "MD-104",
        protocol: "OPC UA",
        address: "ns=4;s=MetalDetection/RejectCount",
        type: "Uint32",
        unit: "ea",
        expectedUnit: "ea",
        access: "Read",
        quality: "Good",
        value: "127",
        maxAge: 60,
        age: 2,
        required: false,
      },
      {
        key: "challenge_result",
        stationId: "ST-104",
        equipmentId: "MD-104",
        protocol: "OPC UA",
        address: "ns=4;s=MetalDetection/ChallengeResult",
        type: "Enum",
        unit: "Pass, Fail, Pending",
        expectedUnit: "Pass, Fail, Pending",
        access: "Read",
        quality: "Stale",
        value: "Pending",
        maxAge: 60,
        age: 75,
        required: true,
      },
      {
        key: "reject_request",
        stationId: "ST-104",
        equipmentId: "ACT-104",
        protocol: "Modbus TCP",
        address: "Coil 00001",
        type: "Boolean",
        unit: "—",
        expectedUnit: "—",
        access: "Command",
        quality: "Unavailable",
        value: "—",
        maxAge: 10,
        age: 0,
        required: false,
      },
    ],
    steps: [
      {
        id: "scan",
        label: "Identify lot",
        kind: "Scan lot",
        signal: "",
        evidence: true,
        timeout: 60,
        failure: true,
      },
      {
        id: "verify",
        label: "Verify released order",
        kind: "Work instruction",
        signal: "",
        evidence: true,
        timeout: 60,
        failure: true,
      },
      {
        id: "challenge",
        label: "CCP challenge",
        kind: "CCP challenge",
        signal: "challenge_result",
        evidence: false,
        timeout: 60,
        failure: true,
      },
      {
        id: "evaluate",
        label: "Evaluate result",
        kind: "Quality decision",
        signal: "challenge_result",
        evidence: true,
        timeout: 60,
        failure: true,
      },
      {
        id: "record",
        label: "Record result",
        kind: "Record result",
        signal: "",
        evidence: true,
        timeout: 60,
        failure: true,
      },
    ],
    offline: "read-only-offline",
    offlineMinutes: 0,
    mesAck: false,
    edgeAck: false,
    commissioned: false,
    desired: "r4",
    actual: "Unknown",
    reason: "",
    routeEdges: [],
    adapter: {
      protocol: "OPC UA",
      endpoint: "opc.tcp://10.21.4.14:4840",
      credentialRef: "",
      securityMode: "SignAndEncrypt",
      pollMs: 1000,
    },
  };
}
export function validateModel(m: EngineeringModel): Issue[] {
  const issues: Issue[] = [];
  const add = (object: string, message: string, category: string) =>
    issues.push({ id: object + message, object, message, category });
  const ids = new Set<string>();
  for (const s of m.stations) {
    if (ids.has(s.id)) add(s.id, "Duplicate station identity", "Registry");
    ids.add(s.id);
    if (!s.operation) add(s.id, "MES operation mapping missing", "Mapping");
    if (!s.app) add(s.id, "Application binding missing", "Process");
    if (
      (s.requiresScale ??
        m.records.some(
          (r) =>
            !r.archived &&
            r.kind === "terminal" &&
            r.parent === s.id &&
            r.binding === "scale_weight",
        )) &&
      !s.scaleBound
    )
      add(s.id, "Scale binding missing", "Equipment");
    if (
      (s.requiresChallenge ??
        m.records.some(
          (r) =>
            !r.archived &&
            r.kind === "operation" &&
            r.required &&
            r.parent === s.id &&
            /ccp|challenge/i.test(r.name),
        )) &&
      !s.challengeBound
    )
      add(s.id, "CCP challenge workflow unassigned", "Process");
  }
  const signalKeys = new Set<string>();
  for (const s of m.signals) {
    if (signalKeys.has(s.key)) add(s.key, "Duplicate signal key", "Signals");
    signalKeys.add(s.key);
    if (s.stationId && !ids.has(s.stationId)) add(s.key, "Assigned station is unavailable", "Signals");
    if (s.equipmentId && !m.records.some(r => !r.archived && ["equipment", "terminal"].includes(r.kind) && r.id === s.equipmentId && r.parent === s.stationId))
      add(s.key, "Source equipment is unavailable at this station", "Signals");
    if (s.required && (s.quality !== "Good" || s.age > s.maxAge))
      add(s.key, "Required input is stale, bad or unavailable", "Signals");
    if (s.unit !== s.expectedUnit) add(s.key, "Engineering unit mismatch", "Signals");
    if (!s.address) add(s.key, "Source address missing", "Signals");
  }
  for (const item of workflowIssues(m, m)) issues.push(item);
  for (const [id, workflow] of Object.entries(m.appWorkflows ?? {})) {
    if (!m.records.some((r) => r.id === id && r.kind === "app" && !r.archived)) continue;
    for (const issue of workflowIssues(m, workflow))
      issues.push({ ...issue, id: id + "-" + issue.id, object: id + " / " + issue.object });
  }
  if (graphHasCycle(m.routeEdges)) add("route", "Unbounded route cycle", "Process");
  const assigned = new Set<string>();
  for (const station of m.stations)
    for (const asset of station.equipment) {
      if (assigned.has(asset))
        add(asset, "Overlapping exclusive equipment assignment", "Equipment");
      assigned.add(asset);
    }
  return issues;
}
export function activationBlockers(m: EngineeringModel) {
  return [
    ...validateModel(m).map((i) => i.message),
    ...(!m.mesAck ? ["MES business acknowledgement missing"] : []),
    ...(!m.edgeAck || m.actual !== m.desired ? ["Edge actual manifest unconfirmed"] : []),
    ...(!m.commissioned ? ["Plant commissioning sign-off missing"] : []),
  ];
}
export function assignmentOverlap(
  a: { asset: string; from: number; to: number; exclusive: boolean },
  b: { asset: string; from: number; to: number; exclusive: boolean },
) {
  return a.asset === b.asset && (a.exclusive || b.exclusive) && a.from < b.to && b.from < a.to;
}
export function graphHasCycle(edges: [string, string][]) {
  const visit = (n: string, path: Set<string>): boolean => {
    if (path.has(n)) return true;
    const next = new Set(path).add(n);
    return edges.filter((e) => e[0] === n).some((e) => visit(e[1], next));
  };
  return edges.some((e) => visit(e[0], new Set()));
}
export function acceptSequence(
  seen: string[],
  last: number,
  event: { id: string; sequence: number },
) {
  return seen.includes(event.id) ? "duplicate" : event.sequence !== last + 1 ? "gap" : "accepted";
}
export function pinSession(release: string) {
  return Object.freeze({ release });
}

export function workflowIssues(
  model: Pick<EngineeringModel, "signals">,
  workflow: z.infer<typeof workflowDraftSchema>,
): Issue[] {
  const issues: Issue[] = [];
  function issue(object: string, message: string) {
    issues.push({ id: object + message, object, message, category: "Workflow" });
  }
  for (const step of workflow.steps) {
    if (step.kind === "CCP challenge" && !step.evidence)
      issue(step.id, "CCP evidence policy incomplete");
    if (!step.failure) issue(step.id, "Failure path missing");
    if (step.timeout <= 0) issue(step.id, "Unbounded wait");
    if (step.signal && !model.signals.some((s) => s.key === step.signal))
      issue(step.id, "Unknown semantic signal");
  }
  if (workflow.offline === "bounded-offline" && workflow.offlineMinutes <= 0)
    issues.push({
      id: "offline",
      object: "offline",
      category: "Policy",
      message: "Approved bounded offline interval missing",
    });
  return issues;
}
// Original workspaces store the intake workflow at the document root.
export function appWorkflow(
  model: EngineeringModel,
  id: string,
): z.infer<typeof workflowDraftSchema> {
  if (id === "APP-INTAKE")
    return { steps: model.steps, offline: model.offline, offlineMinutes: model.offlineMinutes };
  return model.appWorkflows?.[id] ?? { steps: [], offline: "online-required", offlineMinutes: 0 };
}
export function setAppWorkflow(
  model: EngineeringModel,
  id: string,
  draft: z.infer<typeof workflowDraftSchema>,
): EngineeringModel {
  return id === "APP-INTAKE"
    ? { ...model, ...draft }
    : { ...model, appWorkflows: { ...model.appWorkflows, [id]: draft } };
}
