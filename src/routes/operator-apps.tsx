import { StudioPage } from '@/components/engineering/studio-page';
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/operator-apps")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Operator-Apps · Engineering Portal" },
      { property: "og:description", content: "Design operator application workflows in Application Studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Operator-Apps · Engineering Portal" },
      { name: "description", content: "Design operator application workflows in Application Studio." },
    ],
  }),
  component: StudioPage,
});
