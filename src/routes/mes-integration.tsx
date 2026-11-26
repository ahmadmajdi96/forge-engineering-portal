import { MesMappings } from "@/components/engineering/reference-governance";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/mes-integration")({
  validateSearch: (search): { mapping?: string | undefined } => ({
    mapping: typeof search["mapping"] === "string" ? search["mapping"].slice(0, 180) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "MES integration · Engineering Portal" },
      {
        name: "description",
        content: "Engineering, deployment and execution streams with independent acknowledgement.",
      },
      { property: "og:title", content: "MES integration · Engineering Portal" },
      {
        property: "og:description",
        content: "Engineering, deployment and execution streams with independent acknowledgement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MappingPage,
});

function MappingPage() {
  const search = Route.useSearch();
  return (
    <MesMappings
      key={JSON.stringify([search.site, search.engLine, search.engStation, search.mapping])}
      initialMapping={search.mapping}
    />
  );
}
