import { expect, it } from "vitest";
import {
  applyCommandOutcome,
  evaluateSignal,
  signalContractSchema,
  signalSampleSchema,
} from "./signals";

it("preserves source and receipt times and stops showing stale or invalid measurements", () => {
  const contract = signalContractSchema.parse({
    id: "mass",
    sourceId: "scale-adapter",
    addressReference: "scale-gross",
    type: "number",
    unit: "kg",
    multiplier: 0.001,
    offset: 0,
    freshnessMs: 1_000,
    samplingMs: 500,
    access: "read",
  });
  const observation = signalSampleSchema.parse({
    signalId: "mass",
    sourceId: "scale-adapter",
    sourceTimestamp: 1_000,
    receiptTimestamp: 1_030,
    quality: "good",
    value: 1_500,
  });
  expect(evaluateSignal(contract, observation, 1_100)).toEqual({
    quality: "good",
    value: 1.5,
    unit: "kg",
    sourceTimestamp: 1_000,
    receiptTimestamp: 1_030,
  });
  expect(evaluateSignal(contract, observation, 2_100)).toMatchObject({
    quality: "stale",
    value: null,
  });
  expect(evaluateSignal(contract, { ...observation, value: true }, 1_100)).toMatchObject({
    quality: "bad",
    value: null,
  });
  expect(evaluateSignal(contract, { ...observation, sourceId: "other" }, 1_100)).toEqual({
    quality: "unavailable",
    value: null,
  });
});

it("requires explicit reconciliation after a lost physical command response", () => {
  const unknown = {
    status: "timed-out-unknown",
    lastObservedAt: 100,
    confirmedOutcome: null,
  } as const;
  const direct = { status: "executed", lastObservedAt: 110, confirmedOutcome: "executed" } as const;
  expect(() => applyCommandOutcome(unknown, direct)).toThrow("explicit reconciliation");
  expect(applyCommandOutcome(unknown, { ...direct, status: "reconciled" })).toMatchObject({
    status: "reconciled",
    confirmedOutcome: "executed",
  });
});
