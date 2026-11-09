import {ReleaseApproval} from '@/components/engineering/reference-governance';
import {createFileRoute} from '@tanstack/react-router';
import {ReleasePage} from '@/components/engineering/release-page';
export const Route=createFileRoute('/release-readiness')({head:()=>({meta:[{title:'Release & MES readiness · Engineering Portal'},{name:'description',content:'Dependency manifests, independent MES acknowledgements and confirmed edge release gates.'},{property:'og:title',content:'Release & MES readiness · Engineering Portal'},{property:'og:description',content:'Dependency manifests and independent release activation gates.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:ReleaseApproval});
