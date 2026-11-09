import {EdgeFleet} from '@/components/engineering/reference-governance';
import {createFileRoute} from '@tanstack/react-router';
import {FleetPage} from '@/components/engineering/support-pages';
export const Route=createFileRoute('/edge-fleet')({head:()=>({meta:[{title:'Edge fleet & deployments · Engineering Portal'},{name:'description',content:'Target enrollment, actual release evidence and controlled rollout readiness.'},{property:'og:title',content:'Edge fleet & deployments · Engineering Portal'},{property:'og:description',content:'Target enrollment, actual release evidence and controlled rollout readiness.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:EdgeFleet});
