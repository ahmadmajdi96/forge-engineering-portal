import { z } from "zod";
import { applicationKind, epochMs, identifier, targetContextSchema } from "@/lib/edge/assignment";
import { reasonSchema, siteScope } from "./contracts";

export const assignmentPermission = {
  view: "ems.factory_assignments.view",
  edit: "ems.factory_assignments.edit",
};
export const selectorKeys = [
  "lineId",
  "stationId",
  "machineId",
  "operationId",
  "stepId",
  "terminalId",
] as const;
export const targetSelector = z
  .array(z.enum(selectorKeys))
  .min(1)
  .max(selectorKeys.length)
  .refine((keys) => new Set(keys).size === keys.length);

const dateSchema = epochMs.max(Date.UTC(9999, 11, 31));
export const createAssignmentInput = siteScope.extend({
  id: z.string().uuid(),
  nodeId: identifier,
  kind: applicationKind,
  releaseId: z.string().uuid(),
  configRevision: identifier,
  selectors: targetSelector,
  effectiveFrom: dateSchema,
  effectiveUntil: dateSchema.nullable(),
  reason: reasonSchema,
});
export const resolveAssignmentInput = siteScope
  .extend({
    nodeId: targetContextSchema.shape.nodeId.optional(),
    terminalId: targetContextSchema.shape.terminalId.optional(),
    kind: applicationKind,
    at: dateSchema.optional(),
  })
  .refine(
    ({ nodeId, terminalId }) => !!nodeId !== !!terminalId,
    "Choose one target node or terminal",
  );
export const listAssignmentInput = siteScope.extend({ after: z.string().uuid().optional() });
