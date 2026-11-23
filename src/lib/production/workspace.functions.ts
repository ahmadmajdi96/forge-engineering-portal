import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { reasonSchema, workspaceScope } from "./contracts";

export const loadFactoryWorkspace = createServerFn({ method: "POST", strict: { output: false } })
  .inputValidator((input) => workspaceScope.parse(input))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { readWorkspace } = await import("./workspace.server");
    return readWorkspace(getRequest(), data);
  });

export const saveFactoryWorkspace = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    workspaceScope
      .extend({
        expected: z.number().int().min(0).max(2147483646),
        payload: z.unknown(),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { writeWorkspace } = await import("./workspace.server");
    return writeWorkspace(getRequest(), data);
  });
