import { createFileRoute } from "@tanstack/react-router";
import { StepTemplateLibrary } from "@/components/engineering/reference-process";

export const Route = createFileRoute("/step-templates")({
  head: () => ({
    meta: [
      { title: "Step templates · Factory Engineering" },
      {
        name: "description",
        content:
          "Manage versioned step templates and their station assignments in the factory engineering draft.",
      },
    ],
  }),
  component: StepTemplateLibrary,
});
