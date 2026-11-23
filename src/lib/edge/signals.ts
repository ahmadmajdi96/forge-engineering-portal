import { z } from "zod";
import { epochMs, identifier } from "./assignment";

export const signalContractSchema = z
  .object({
    id: identifier,
    sourceId: identifier,
    addressReference: identifier,
    type: z.enum(["number", "boolean", "text"]),
    unit: z.string().trim().max(24),
    multiplier: z.number().finite(),
    offset: z.number().finite(),
    freshnessMs: z.number().int().min(250).max(600_000),
    samplingMs: z.number().int().min(250).max(600_000),
    access: z.enum(["read", "write-request"]),
  })
  .strict()
  .refine(
    (signal) =>
      signal.type === "number"
        ? signal.multiplier !== 0
        : signal.multiplier === 1 && signal.offset === 0 && signal.unit === "",
    "Scaling applies only to numeric signals",
  );

export const signalSampleSchema = z
  .object({
    signalId: identifier,
    sourceId: identifier,
    sourceTimestamp: epochMs,
    receiptTimestamp: epochMs,
    quality: z.enum(["good", "bad", "unknown"]),
    value: z.union([z.number().finite(), z.boolean(), z.string().max(1024), z.null()]),
  })
  .strict();

export type SignalContract = z.infer<typeof signalContractSchema>;
export type SignalSample = z.infer<typeof signalSampleSchema>;

export function evaluateSignal(
  contract: SignalContract,
  sample: SignalSample | undefined,
  now: number,
) {
  if (!sample || sample.signalId !== contract.id || sample.sourceId !== contract.sourceId) {
    return { quality: "unavailable", value: null } as const;
  }
  const timestamps = {
    sourceTimestamp: sample.sourceTimestamp,
    receiptTimestamp: sample.receiptTimestamp,
  };
  if (
    sample.sourceTimestamp > sample.receiptTimestamp + 30_000 ||
    sample.receiptTimestamp > now + 30_000
  ) {
    return { quality: "unknown", value: null, ...timestamps } as const;
  }
  if (
    now - sample.sourceTimestamp > contract.freshnessMs ||
    now - sample.receiptTimestamp > contract.freshnessMs
  ) {
    return { quality: "stale", value: null, ...timestamps } as const;
  }
  if (sample.quality !== "good")
    return { quality: sample.quality, value: null, ...timestamps } as const;
  const type = contract.type === "text" ? "string" : contract.type;
  if (typeof sample.value !== type) return { quality: "bad", value: null, ...timestamps } as const;
  const value =
    typeof sample.value === "number"
      ? sample.value * contract.multiplier + contract.offset
      : sample.value;
  if (typeof value === "number" && !Number.isFinite(value))
    return { quality: "bad", value: null, ...timestamps } as const;
  return { quality: "good", value, unit: contract.unit, ...timestamps } as const;
}

export const commandRequestSchema = z
  .object({
    id: identifier,
    idempotencyKey: identifier,
    capability: identifier,
    policyRevision: identifier,
    qualityDecision: identifier,
    actor: identifier,
    deviceId: identifier,
    siteId: identifier,
    targetId: identifier,
    assignmentId: identifier,
    expectedStateVersion: identifier,
    requestedAt: epochMs,
    expiresAt: epochMs,
    reason: z.string().trim().min(3).max(300),
  })
  .strict()
  .refine(
    ({ requestedAt, expiresAt }) => expiresAt > requestedAt && expiresAt - requestedAt <= 300_000,
  );

type Outcome =
  "requested" | "accepted" | "executed" | "rejected" | "timed-out-unknown" | "reconciled";
type Observation = {
  status: Outcome;
  lastObservedAt: number;
  confirmedOutcome: "executed" | "rejected" | null;
};

export function applyCommandOutcome(before: Observation, next: Observation): Observation {
  if (next.lastObservedAt < before.lastObservedAt)
    throw new Error("Command observation would move backwards");
  if (next.status === "requested")
    throw new Error("A request cannot replace observed command status");
  const final =
    next.status === "executed" || next.status === "rejected" || next.status === "reconciled";
  if (
    (!final && next.confirmedOutcome !== null) ||
    (next.status === "executed" && next.confirmedOutcome !== "executed") ||
    (next.status === "rejected" && next.confirmedOutcome !== "rejected") ||
    (next.status === "reconciled" && !next.confirmedOutcome)
  )
    throw new Error("Inconsistent confirmed outcome");
  if (before.confirmedOutcome && next.confirmedOutcome !== before.confirmedOutcome) {
    throw new Error("Confirmed command outcome cannot be replaced");
  }
  if (
    before.status === "timed-out-unknown" &&
    next.status !== "reconciled" &&
    next.status !== "timed-out-unknown"
  ) {
    throw new Error("Uncertain command requires explicit reconciliation");
  }
  return next;
}
