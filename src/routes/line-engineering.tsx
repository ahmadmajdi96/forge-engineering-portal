import { LineTopology } from "@/components/engineering/reference-process";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/line-engineering")({
  head: () => ({
    meta: [
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
      { title: "Production Lines · Engineering Portal" },
      {
        name: "description",
        content: "Define production lines, workstation sequencing and buffer rules.",
      },
      { property: "og:title", content: "Production Lines · Engineering Portal" },
      {
        property: "og:description",
        content: "Define production lines, workstation sequencing and buffer rules.",
      },
    ],
  }),
  component: LineTopology,
});
