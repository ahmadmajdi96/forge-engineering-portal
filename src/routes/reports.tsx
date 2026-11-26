import { z } from "zod";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
      { title: "Engineering Reports · Engineering Portal" },
      {
        name: "description",
        content:
          "Canonical station and equipment inventory, calibration evidence and legacy identity crosswalk reports.",
      },
      { property: "og:title", content: "Engineering Reports · Engineering Portal" },
      {
        property: "og:description",
        content: "Canonical engineering inventory and legacy identity crosswalk reports.",
      },
    ],
  }),
  validateSearch: z.object({
    report: z
      .enum(["inventory", "assignments", "calibration", "crosswalk", "changes"])
      .optional()
      .catch(undefined),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/registry",
      replace: true,
      search: { ...search, view: "reports", report: search.report ?? "inventory" } as never,
    });
  },
});
