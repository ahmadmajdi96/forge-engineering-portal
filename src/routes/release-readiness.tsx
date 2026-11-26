import { ReleaseApproval } from "@/components/engineering/reference-governance";
import { ItemReadiness } from "@/components/engineering/item-readiness";
import { useFactorySetup } from "@/components/engineering/setup-wizard-context";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
export const Route = createFileRoute("/release-readiness")({
  head: () => ({
    meta: [
      { title: "Release & MES readiness · Engineering Portal" },
      {
        name: "description",
        content:
          "Dependency manifests, independent MES acknowledgements and confirmed edge release gates.",
      },
      { property: "og:title", content: "Release & MES readiness · Engineering Portal" },
      {
        property: "og:description",
        content: "Dependency manifests and independent release activation gates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReadinessRoute,
});
function ReadinessRoute() {
  const wizard = useFactorySetup();
  const requested = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>)["setup"] === "guided",
  });
  return requested || wizard?.active ? <ItemReadiness /> : <ReleaseApproval />;
}
