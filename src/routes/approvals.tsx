import {useEngineering} from "@/lib/engineering/context";
import {engineeringHistory} from "@/lib/production/workspace.functions";
import {reviewEngineering} from "@/lib/production/engineering-review.functions";
import {useQuery,useMutation} from "@tanstack/react-query";
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { listApprovals, signRevision, STAGES } from '@/lib/engineering/approvals.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export const Route = createFileRoute('/approvals')({
  head: () => ({ meta: [
    { title: 'Approval Chain — Engineering Portal' },
    { name: 'description', content: 'Review, approve, release and make engineering revisions effective with e-signatures.' },
    { property: 'og:title', content: 'Approval Chain — Engineering Portal' },
    { property: 'og:description', content: 'E-signature approval chain for engineering revisions.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: ApprovalWorkspace,
});

type Data = Awaited<ReturnType<typeof listApprovals>>;
const NEXT: Record<string, { stage: 'In Review' | 'Approved' | 'Rejected'; label: string }[]> = {
  Draft: [{ stage: 'In Review', label: 'Submit for review' }],
  Rejected: [{ stage: 'In Review', label: 'Resubmit' }],
  'In Review': [{ stage: 'Approved', label: 'Approve' }, { stage: 'Rejected', label: 'Reject' }],
  Approved: [],
  Released: [],
  Effective: [],
};

function ApprovalsPage() {
  const list = useServerFn(listApprovals); const sign = useServerFn(signRevision);
  const [data, setData] = useState<Data | null>(null); const [err, setErr] = useState('');
  const [sel, setSel] = useState<string | null>(null); const [meaning, setMeaning] = useState(''); const [reason, setReason] = useState('');
  const [signing,setSigning]=useState(false);
  const load = useCallback(() => list().then(result=>{setData(result);setErr('');}).catch((e) => setErr(e.message)), [list]);
  useEffect(() => { load(); }, [load]);
  const rev = data?.revisions.find((r) => r.id === sel) ?? data?.revisions[0];
  const act = async (stage: (typeof NEXT)[string][number]['stage']) => {
    if (!rev || signing) return;
    setSigning(true);
    try { await sign({ data: { revisionId: rev.id, stage, meaning, reason } }); toast.success(`Signed: ${stage}`); setMeaning(''); setReason(''); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setSigning(false); }
  };
  if (err) return <div className="p-6 text-sm text-muted-foreground">Approval history is unavailable. {err} <Button variant="outline" onClick={()=>void load()}>Retry</Button></div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="p-6 space-y-4">
      <div><h1 className="text-xl font-semibold">Approval Chain</h1>
        <p className="text-sm text-muted-foreground">Sandbox review records authors and independent approvers. Factory publication uses the factory release workspace. Your roles: {data.roles.length ? data.roles.join(', ') : 'none (author only)'}</p></div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-md border border-border divide-y divide-border">
          {data.revisions.length === 0 && <div className="p-4 text-sm text-muted-foreground">No saved revisions yet. Save a draft from any engineering page.</div>}
          {data.revisions.map((r) => (
            <button key={r.id} aria-pressed={rev?.id===r.id} onClick={() => {setSel(r.id);setMeaning('');setReason('');}} className={`w-full text-left p-3 text-sm hover:bg-muted ${rev?.id === r.id ? 'bg-muted' : ''}`}>
              <div className="flex justify-between"><span className="font-mono">Rev {r.revision}</span><Badge variant="outline">{r.stage}</Badge></div>
              <div className="text-xs text-muted-foreground truncate">{r.reason}</div>
            </button>))}
        </div>
        {rev && <div className="rounded-md border border-border p-4 space-y-4">
          <div className="flex gap-2 flex-wrap">{STAGES.map((s) => { const i = STAGES.indexOf(s), c = STAGES.indexOf(rev.stage as never); return <Badge key={s} variant={i <= c ? 'default' : 'outline'}>{s}</Badge>; })}{rev.stage === 'Rejected' && <Badge variant="destructive">Rejected</Badge>}</div>
          <div className="text-sm"><b>Rev {rev.revision}</b> · {rev.reason} · {new Date(rev.created_at).toLocaleString()} {rev.actor_id === data.userId && <Badge variant="secondary">You are the author</Badge>}</div>
          <div><h2 className="text-sm font-semibold mb-2">Signatures</h2>
            {rev.signatures.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> :
              <ul className="space-y-1 text-xs">{rev.signatures.map((s) => <li key={s.id} className="font-mono">{new Date(s.created_at).toLocaleString()} · {s.stage} · {s.signer_email} · “{s.meaning}” — {s.reason}</li>)}</ul>}</div>
          {NEXT[rev.stage]?.length ? <div className="space-y-2 border-t border-border pt-3">
            <h2 className="text-sm font-semibold">Sign next step</h2>
            <label className="grid gap-1 text-sm">Signature meaning<Input maxLength={200} placeholder="I approve this configuration" value={meaning} onChange={(e) => setMeaning(e.target.value)} /></label>
            <label className="grid gap-1 text-sm">Reason<Input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <div className="flex gap-2">{(NEXT[rev.stage] ?? []).map((n) => <Button key={n.stage} size="sm" variant={n.stage === 'Rejected' ? 'destructive' : 'default'} disabled={signing || meaning.trim().length < 3 || reason.trim().length < 3} onClick={() => act(n.stage)}>{n.label}</Button>)}</div>
          </div> : <p className="text-xs text-muted-foreground">Chain complete.</p>}
        </div>}
      </div>
    </div>);
}

function ApprovalWorkspace() {
  const {native, site} = useEngineering();
  return native ? <EngineeringReviews key={site} site={site}/> : <ApprovalsPage/>;
}
function EngineeringReviews({site}:{site:string|undefined}) {
  const history=useQuery({queryKey:["engineering-reviews",site],enabled:!!site,retry:false,queryFn:()=>engineeringHistory({data:{site:site!}})});
  const current=history.data?.[0];
  return <section className="max-w-4xl space-y-4"><header><h1 className="font-display text-2xl font-semibold">Approval Chain</h1>
    <p className="text-sm text-muted-foreground">Review the latest engineering revision and trace previous decisions for this factory.</p></header>
    {!site && <p role="status">Choose a factory to review its revisions.</p>}
    {site && history.isPending && <p role="status">Loading revisions…</p>}
    {history.error && <div role="alert">{history.error.message} <Button variant="outline" onClick={()=>void history.refetch()}>Retry</Button></div>}
    {history.data?.length===0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4 text-sm">
      <p>Save an engineering revision to start its review history.</p><Button asChild variant="outline"><Link to="/line-engineering" search={site ? {site}: {}}>Open line engineering</Link></Button></div>}
    {site && current && <div className="glass-panel space-y-3 rounded-lg p-4"><h2 className="text-sm text-muted-foreground">Latest revision</h2>
      <div className="flex flex-wrap items-center gap-2"><strong>Revision {current.revision}</strong><Badge variant="secondary">{current.lifecycle}</Badge></div>
      <p className="break-words">{current.reason}</p><p className="text-sm text-muted-foreground"><time dateTime={current.created_at}>{new Date(current.created_at).toLocaleString()}</time></p>
      {current.lifecycle==="In Review" && <RevisionDecision key={current.id} site={site} revision={current.revision} refresh={()=>history.refetch()}/>}
    </div>}
    {history.data && history.data.length>1 && <section className="space-y-2"><h2 className="font-semibold">Previous revisions</h2>
      <ul className="divide-y rounded-lg border bg-card">{history.data.slice(1).map(row=><li className="space-y-1 p-3 text-sm" key={row.id}>
        <strong>Revision {row.revision}</strong> · {row.lifecycle}<p className="break-words text-muted-foreground">{row.reason}</p></li>)}</ul></section>}
  </section>;
}
function RevisionDecision({site,revision,refresh}:{site:string;revision:number;refresh:()=>Promise<unknown>}) {
  const [reason,setReason]=useState("");
  const decision=useMutation({mutationFn:(value:"Approved"|"Rejected")=>reviewEngineering({data:{site,revision,decision:value,reason}}),
    onSuccess:async(_,value)=>{toast.success(`Revision ${revision} ${value.toLowerCase()}`);await refresh();}});
  return <div className="space-y-3 border-t pt-3"><label className="grid gap-1 text-sm">Review reason
    <Input required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <div className="flex flex-wrap gap-2">{(["Approved","Rejected"] as const).map(value=><Button key={value} variant={value==="Approved"?"default":"outline"} disabled={decision.isPending || reason.trim().length<3} onClick={()=>decision.mutate(value)}>{decision.isPending && decision.variables === value ? "Recording…" : value==="Approved"?"Approve":"Reject"}</Button>)}</div>
    {decision.error && <p role="alert" className="text-sm text-destructive">{decision.error.message}</p>}
  </div>;
}
