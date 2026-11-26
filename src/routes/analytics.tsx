import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
      { title: "Engineering Analytics · Engineering Portal" },
      {
        name: "description",
        content:
          "Actionable engineering readiness analytics for scoped assets, signals and release blockers.",
      },
      { property: "og:title", content: "Engineering Analytics · Engineering Portal" },
      {
        property: "og:description",
        content: "Scoped engineering readiness analytics and release blockers.",
      },
    ],
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/diagnostics", replace: true, search: { ...search } as never });
  },
});
