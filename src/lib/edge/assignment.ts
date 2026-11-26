import { z } from "zod";

export const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);
export const epochMs = z.number().int().nonnegative().safe();
const identifiers = z
  .array(identifier)
  .max(64)
  .refine((ids) => new Set(ids).size === ids.length);
export const applicationKind = z.enum(["operator", "hmi"]);
const dimensions = z
  .object({
    lineId: identifier.optional(),
    stationId: identifier.optional(),
    machineId: identifier.optional(),
    operationId: identifier.optional(),
    stepId: identifier.optional(),
    terminalId: identifier.optional(),
  })
  .strict();

export const targetContextSchema = dimensions
  .extend({
    siteId: identifier,
    nodeId: identifier,
    lineId: identifier,
    stationId: identifier,
    terminalId: identifier,
  })
  .strict();

export const compatibilitySchema = z
  .object({
    runtime: z.number().int().positive(),
    os: z.enum(["linux"]),
    architectures: z
      .array(z.enum(["amd64", "arm64"]))
      .min(1)
      .max(2),
    displays: identifiers,
    peripherals: identifiers,
    signals: identifiers,
    commandPolicies: identifiers,
  })
  .strict();

export const nodeCapabilitiesSchema = compatibilitySchema
  .omit({ architectures: true })
  .extend({
    nodeId: identifier,
    architecture: z.enum(["amd64", "arm64"]),
  })
  .strict();

const configValue = z.union([z.string().max(512), z.number().finite(), z.boolean(), z.null()]);
export const configValuesSchema = z
  .record(identifier, configValue)
  .refine((record) => Object.keys(record).length <= 64);

export const assignmentSchema = z
  .object({
    id: identifier,
    siteId: identifier,
    nodeId: identifier,
    kind: applicationKind,
    selector: dimensions,
    releaseId: identifier,
    releaseDigest: digest,
    configRevision: identifier,
    configuration: configValuesSchema,
    secretReferences: identifiers,
    effectiveFrom: epochMs,
    effectiveUntil: epochMs.nullable(),
  })
  .strict()
  .refine(
    ({ effectiveFrom, effectiveUntil }) =>
      effectiveUntil === null || effectiveUntil > effectiveFrom,
    "Effective end must follow start",
  );

export type Assignment = z.infer<typeof assignmentSchema>;
export type TargetContext = z.infer<typeof targetContextSchema>;
export type Compatibility = z.infer<typeof compatibilitySchema>;
export type NodeCapabilities = z.infer<typeof nodeCapabilitiesSchema>;
export type AppKind = z.infer<typeof applicationKind>;
export type ReleaseForAssignment = {
  manifest: { id: string; siteId: string; kind: AppKind; compatibility: Compatibility };
  contentDigest: string;
};

const keys = ["lineId", "stationId", "machineId", "operationId", "stepId", "terminalId"] as const;
const isEffective = (assignment: Assignment, at: number) =>
  assignment.effectiveFrom <= at &&
  (assignment.effectiveUntil === null || at < assignment.effectiveUntil);
const refines = (candidate: Assignment, base: Assignment) =>
  keys.every(
    (key) => base.selector[key] === undefined || base.selector[key] === candidate.selector[key],
  ) &&
  keys.some((key) => candidate.selector[key] !== undefined && base.selector[key] === undefined);

export function conflictingAssignments(assignments: readonly Assignment[]) {
  const issues: { first: string; second: string; reason: string }[] = [];
  for (const [index, first] of assignments.entries()) {
    for (const second of assignments.slice(index + 1)) {
      if (first.id === second.id) {
        issues.push({ first: first.id, second: second.id, reason: "Duplicate assignment ID" });
        continue;
      }
      if (
        first.siteId !== second.siteId ||
        first.nodeId !== second.nodeId ||
        first.kind !== second.kind
      )
        continue;
      if (
        first.effectiveFrom >= (second.effectiveUntil ?? Infinity) ||
        second.effectiveFrom >= (first.effectiveUntil ?? Infinity)
      )
        continue;
      if (
        keys.some(
          (key) =>
            first.selector[key] !== undefined &&
            second.selector[key] !== undefined &&
            first.selector[key] !== second.selector[key],
        )
      )
        continue;
      if (!refines(first, second) && !refines(second, first)) {
        issues.push({
          first: first.id,
          second: second.id,
          reason: "Overlapping assignments have no unique override",
        });
      }
    }
  }
  return issues;
}

export function compatibilityIssues(required: Compatibility, node: NodeCapabilities): string[] {
  const issues: string[] = [];
  if (node.runtime !== required.runtime) issues.push("Runtime version differs");
  if (node.os !== required.os || !required.architectures.includes(node.architecture))
    issues.push("Unsupported platform");
  for (const field of ["displays", "peripherals", "signals", "commandPolicies"] as const) {
    for (const value of required[field]) {
      if (!node[field].includes(value)) issues.push(`Missing ${field} capability: ${value}`);
    }
  }
  return issues;
}

export function resolveAssignment({
  assignments,
  releases,
  context,
  node,
  kind,
  at,
}: {
  assignments: readonly Assignment[];
  releases: readonly ReleaseForAssignment[];
  context: TargetContext;
  node: NodeCapabilities;
  kind: AppKind;
  at: number;
}):
  | { status: "resolved"; assignment: Assignment; overridden: string[] }
  | {
      status: "unassigned" | "ambiguous" | "incompatible";
      candidates: string[];
      issues: string[];
    } {
  const candidates = assignments.filter(
    (assignment) =>
      assignment.kind === kind &&
      assignment.siteId === context.siteId &&
      assignment.nodeId === context.nodeId &&
      isEffective(assignment, at) &&
      keys.every(
        (key) =>
          assignment.selector[key] === undefined || assignment.selector[key] === context[key],
      ),
  );
  const applicable = candidates.filter(
    (candidate) => !candidates.some((other) => other !== candidate && refines(other, candidate)),
  );
  const ids = applicable.map(({ id }) => id).sort();
  const winner = applicable[0];
  if (!winner)
    return {
      status: "unassigned",
      candidates: ids,
      issues: ["No effective assignment for context"],
    };
  if (applicable.length !== 1) {
    return { status: "ambiguous", candidates: ids, issues: ["No unique assignment override"] };
  }
  const release = releases.find(
    ({ manifest, contentDigest }) =>
      manifest.id === winner.releaseId &&
      manifest.siteId === winner.siteId &&
      manifest.kind === winner.kind &&
      contentDigest === winner.releaseDigest,
  );
  const issues =
    node.nodeId === context.nodeId ? [] : ["Node capabilities belong to a different node"];
  if (release) issues.push(...compatibilityIssues(release.manifest.compatibility, node));
  else issues.push("Exact release is unavailable within the assignment scope");
  if (issues.length) return { status: "incompatible", candidates: ids, issues };
  return {
    status: "resolved",
    assignment: winner,
    overridden: candidates
      .filter((candidate) => candidate !== winner)
      .map(({ id }) => id)
      .sort(),
  };
}
