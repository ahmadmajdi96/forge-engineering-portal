import { createFileRoute } from '@tanstack/react-router';
import { AssetStepsPage } from '@/components/engineering/asset-steps-page';

export const Route = createFileRoute('/asset-steps')({
  head: () => ({ meta: [
    { title: 'Production Steps · Engineering Portal' },
    { name: 'description', content: 'Organize production steps, sequence and manual or automatic station assignments in engineering drafts.' },
    { property: 'og:title', content: 'Production Steps · Engineering Portal' },
    { property: 'og:description', content: 'Production step sequence and station composition for engineering drafts.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: AssetStepsPage,
});