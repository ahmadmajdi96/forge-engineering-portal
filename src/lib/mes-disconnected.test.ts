import { describe, expect, it } from "vitest";
import { refuseMesAction, submitOrQueue, MES_CONNECTION_MESSAGE } from "./mes-disconnected";

describe("Disconnected MES runtime", () => {
  it("refuses machine actions rather than reporting success", async () => {
    await expect(refuseMesAction({ event: "processed" })).rejects.toThrow(MES_CONNECTION_MESSAGE);
  });
  it("does not queue operational records for an unconnected MES", async () => {
    await expect(submitOrQueue("unit_event", { unit_uid: "UNIT-1" }, "Pass")).rejects.toThrow(MES_CONNECTION_MESSAGE);
  });
});