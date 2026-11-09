import { ProcessRoute } from '@/components/engineering/reference-process';
import {createFileRoute} from '@tanstack/react-router';
import {ProcessPage} from '@/components/engineering/support-pages';
export const Route=createFileRoute('/process-routes')({head:()=>({meta:[{title:'Process & routes · Engineering Portal'},{name:'description',content:'Operation bindings, routing branches and approved recipe references.'},{property:'og:title',content:'Process & routes · Engineering Portal'},{property:'og:description',content:'Operation bindings, routing branches and approved recipe references.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:ProcessRoute});
