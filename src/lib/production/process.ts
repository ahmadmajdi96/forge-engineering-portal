import { z } from "zod";

const key = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const reference = z.object({ object: key, revision: key }).strict();
const stepSchema = z
  .object({
    id: key,
    name: z.string().trim().min(1).max(160),
    operationId: key.optional(),
    // Legacy stationIds refer to spatial nodes. Logical assignments can precede placement.
    stationIds: z.array(key).max(25),
    engineeringStationIds: z.array(key).max(25).optional(),
    participation: z.enum(["any", "all"]).optional(),
    sectionId: key.optional(),
    operatorRole: z.string().trim().max(160).optional(),
    handoff: z.string().trim().max(1000).optional(),
    consumers: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("studio"),
              appId: z.string().min(1).max(96),
              signalId: z.string().min(1).max(96),
            })
            .strict(),
          z.object({ kind: z.literal("mes"), mappingId: z.string().min(1).max(180) }).strict(),
        ]),
      )
      .max(40)
      .optional(),
    completionSignal: z.string().trim().min(1).max(160).optional(),
    capabilities: z.array(key).max(25),
    evidence: z.array(key).max(25),
    expectedSeconds: z.number().int().min(0).max(86400),
    waitTimeoutSeconds: z.number().int().positive().max(86400).nullable(),
    outcome: z.enum(["operation", "complete", "failed"]),
  })
  .strict();
const transitionSchema = z
  .object({
    from: key,
    to: key,
    outcome: z.enum(["success", "failure", "rework"]),
    condition: z
      .object({
        variable: key,
        equals: z.union([z.string().max(128), z.number().finite(), z.boolean()]),
      })
      .nullable(),
    maxAttempts: z.number().int().min(1).max(20).nullable(),
  })
  .strict();
const routeSchema = z
  .object({
    id: key,
    name: z.string().trim().min(1).max(160),
    lineId: key.optional(),
    quality: reference.nullable().optional(),
    product: reference.nullable(),
    recipe: reference.nullable(),
    start: z.union([key, z.literal("")]),
    sections: z
      .array(z.object({ id: key, name: z.string().trim().min(1).max(160) }).strict())
      .max(100)
      .optional(),
    steps: z.array(stepSchema).max(300),
    transitions: z.array(transitionSchema).max(1000),
  })
  .strict();
export const processDocumentSchema = z
  .object({
    version: z.literal(1),
    routes: z.array(routeSchema).max(50),
  })
  .strict()
  .superRefine(({ routes }, context) => {
    for (const route of routes) {
      const sections = new Set((route.sections ?? []).map((section) => section.id));
      if (
        sections.size !== (route.sections?.length ?? 0) ||
        route.steps.some((step) => step.sectionId && !sections.has(step.sectionId))
      )
        context.addIssue({
          code: "custom",
          message: "Each section needs a unique identity and its steps must refer to that section.",
        });
      for (const step of route.steps) {
        const consumers = step.consumers ?? [];
        if (
          consumers.length &&
          (!step.completionSignal ||
            new Set(consumers.map((c) => JSON.stringify(c))).size !== consumers.length)
        )
          context.addIssue({
            code: "custom",
            message: "Consumers need a source signal and must be unique.",
          });
        const ids = step.engineeringStationIds ?? [];
        if (new Set(ids).size !== ids.length || ids.length + step.stationIds.length > 25)
          context.addIssue({
            code: "custom",
            message: "Choose up to 25 distinct station assignments per step.",
          });
      }
    }
    if (new Set(routes.map((route) => route.id)).size !== routes.length)
      context.addIssue({
        code: "custom",
        path: ["routes"],
        message: "Route identities must be unique.",
      });
  });

export type ProcessDocument = z.infer<typeof processDocumentSchema>;
export type ProcessRoute = z.infer<typeof routeSchema>;

export function validateRoute(route: ProcessRoute) {
  const issues = [];
  const steps = new Map(route.steps.map((step) => [step.id, step]));
  if (steps.size !== route.steps.length) issues.push("Step identities must be unique.");
  if (!steps.has(route.start)) issues.push("Choose a valid entry step.");
  const edges = new Map<string, ProcessRoute["transitions"]>();
  const outcomes = new Set<string>();
  for (const edge of route.transitions) {
    const outcome = JSON.stringify([edge.from, edge.outcome, edge.condition]);
    if (outcomes.has(outcome))
      issues.push("Each outcome and condition needs an unambiguous route.");
    outcomes.add(outcome);
    if (!steps.has(edge.from) || !steps.has(edge.to))
      issues.push("A transition refers to a missing step.");
    if ((edge.outcome === "rework") !== (edge.maxAttempts !== null))
      issues.push("Rework must have an attempt limit.");
    const list = edges.get(edge.from) ?? [];
    list.push(edge);
    edges.set(edge.from, list);
  }
  for (const step of route.steps) {
    const outgoing = edges.get(step.id) ?? [];
    if (step.outcome !== "operation" && outgoing.length)
      issues.push(step.name + " must end the route.");
    if (
      step.outcome === "operation" &&
      (!outgoing.some((edge) => edge.outcome === "success" && !edge.condition) ||
        !outgoing.some((edge) => edge.outcome === "failure" && !edge.condition))
    )
      issues.push(step.name + " needs default success and failure paths.");
    if (
      step.outcome === "operation" &&
      (step.engineeringStationIds?.length || step.sectionId) &&
      (step.engineeringStationIds?.length ?? 0) + step.stationIds.length > 1 &&
      !step.participation
    )
      issues.push(step.name + " needs a participation rule for its stations.");
    if (
      step.outcome === "operation" &&
      !step.engineeringStationIds?.length &&
      step.stationIds.length === 0
    )
      issues.push(step.name + " needs an assigned station.");
  }
  const seen = new Set<string>();
  const open = new Set<string>();
  let cycle = false;
  function walk(id: string) {
    if (open.has(id)) cycle = true;
    if (seen.has(id) || !steps.has(id)) return;
    open.add(id);
    seen.add(id);
    for (const edge of edges.get(id) ?? []) {
      if (edge.outcome !== "rework") walk(edge.to);
    }
    open.delete(id);
  }
  walk(route.start);
  if (cycle)
    issues.push("Normal and failure paths must be acyclic. Use a bounded rework transition.");
  if (seen.size !== steps.size)
    issues.push("Every step must be reachable through a normal or failure path.");
  if (!route.steps.some((step) => seen.has(step.id) && step.outcome === "complete"))
    issues.push("Provide a reachable completion outcome.");
  return [...new Set(issues)];
}
