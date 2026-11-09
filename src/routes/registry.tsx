import { AssetHierarchy } from '@/components/engineering/reference-assets';
import {createFileRoute} from '@tanstack/react-router';
import {RegistryPage} from '@/components/engineering/support-pages';
export const Route=createFileRoute('/registry')({head:()=>({meta:[{title:'Asset registry · Engineering Portal'},{name:'description',content:'Stable scoped identities, equipment assignments and legacy crosswalk review.'},{property:'og:title',content:'Asset registry · Engineering Portal'},{property:'og:description',content:'Stable scoped identities, equipment assignments and legacy crosswalk review.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:AssetHierarchy});
