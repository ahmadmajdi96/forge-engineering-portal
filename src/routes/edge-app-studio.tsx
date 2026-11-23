import {WorkflowDesigner} from '@/components/engineering/reference-studio';
import {createFileRoute} from '@tanstack/react-router';
import {StudioPage} from '@/components/engineering/studio-page';
export const Route=createFileRoute('/edge-app-studio')({head:()=>({meta:[{title:'Edge App Studio · Engineering Portal'},{name:'description',content:'Author, simulate and validate versioned operator workflows in an isolated sandbox.'},{property:'og:title',content:'Edge App Studio · Engineering Portal'},{property:'og:description',content:'Versioned workflow authoring and isolated app previews.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:WorkflowDesigner});
