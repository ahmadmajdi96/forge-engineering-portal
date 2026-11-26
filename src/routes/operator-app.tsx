import { StudioPage } from '@/components/engineering/studio-page';
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/operator-app")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Operator-App · Engineering Portal" },
      { property: "og:description", content: "Design operator application workflows in Application Studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Operator-App · Engineering Portal" },
      { name: "description", content: "Design operator application workflows in Application Studio." },
    ],
  }),
  component: StudioPage,
});
