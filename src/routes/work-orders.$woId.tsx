import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMes } from "@/lib/mes-store";
export const Route = createFileRoute("/work-orders/$woId")({
 head: ({params}) => ({meta:[{title:`Work Order ${params.woId} · Engineering Portal`},{name:"description",content:"MES work-order preview."},{property:"og:title",content:`Work Order ${params.woId} · Engineering Portal`},{property:"og:description",content:"MES work-order preview."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
 component: WorkOrder,
});
function WorkOrder(){const {woId}=Route.useParams();const {workOrders}=useMes();const order=workOrders.find(x=>x.id===woId);if(!order)throw notFound();return <div className="space-y-4"><Link to="/lines" className="text-sm text-primary">← Production Lines</Link><h1 className="font-display text-2xl font-semibold">{order.id}</h1><dl className="grid gap-4 sm:grid-cols-2">{Object.entries(order).map(([key,value])=><div key={key}><dt className="text-xs uppercase text-muted-foreground">{key}</dt><dd className="text-sm">{String(value)}</dd></div>)}</dl></div>}
