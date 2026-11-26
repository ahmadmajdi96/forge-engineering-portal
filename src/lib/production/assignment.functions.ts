import { createServerFn } from "@tanstack/react-start";
import {
  createAssignmentInput,
  listAssignmentInput,
  resolveAssignmentInput,
} from "./assignment.contracts";

export const getFactoryAssignments = createServerFn({ method: "POST" })
  .inputValidator((data) => listAssignmentInput.parse(data))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { listAssignments } = await import("./assignment.server");
    return listAssignments(getRequest(), data);
  });

export const addFactoryAssignment = createServerFn({ method: "POST" })
  .inputValidator((data) => createAssignmentInput.parse(data))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { createAssignment } = await import("./assignment.server");
    return createAssignment(getRequest(), data);
  });

export const resolveFactoryAssignment = createServerFn({ method: "POST" })
  .inputValidator((data) => resolveAssignmentInput.parse(data))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { inspectAssignment } = await import("./assignment.server");
    return inspectAssignment(getRequest(), data);
  });
