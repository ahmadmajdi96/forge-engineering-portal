import { SignalBindings } from '@/components/engineering/reference-process';
import {createFileRoute} from '@tanstack/react-router';
import {StationConnectivityPage} from '@/components/engineering/station-page';
export const Route=createFileRoute('/station-connectivity')({head:()=>({meta:[{title:'Station connectivity · Engineering Portal'},{name:'description',content:'Typed signals, equipment relationships and station commissioning readiness.'},{property:'og:title',content:'Station connectivity · Engineering Portal'},{property:'og:description',content:'Typed signals and station commissioning readiness.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:SignalBindings});
