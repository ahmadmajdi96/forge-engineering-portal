import { createFileRoute } from '@tanstack/react-router';
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
  component: ApprovalsPage,
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
  const load = useCallback(() => list().then(setData).catch((e) => setErr(e.message)), [list]);
  useEffect(() => { load(); }, [load]);
  const rev = data?.revisions.find((r) => r.id === sel) ?? data?.revisions[0];
  const act = async (stage: (typeof NEXT)[string][number]['stage']) => {
    if (!rev) return;
    try { await sign({ data: { revisionId: rev.id, stage, meaning, reason } }); toast.success(`Signed: ${stage}`); setMeaning(''); setReason(''); load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  if (err) return <div className="p-6 text-sm text-muted-foreground">Sign in to view the approval chain. ({err})</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="p-6 space-y-4">
      <div><h1 className="text-xl font-semibold">Approval Chain</h1>
        <p className="text-sm text-muted-foreground">Sandbox review records authors and independent approvers. Factory publication uses the factory release workspace. Your roles: {data.roles.length ? data.roles.join(', ') : 'none (author only)'}</p></div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-md border border-border divide-y divide-border">
          {data.revisions.length === 0 && <div className="p-4 text-sm text-muted-foreground">No saved revisions yet. Save a draft from any engineering page.</div>}
          {data.revisions.map((r) => (
            <button key={r.id} onClick={() => setSel(r.id)} className={`w-full text-left p-3 text-sm hover:bg-muted ${rev?.id === r.id ? 'bg-muted' : ''}`}>
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
            <Input placeholder="Signature meaning (e.g. I approve this configuration)" value={meaning} onChange={(e) => setMeaning(e.target.value)} />
            <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">{(NEXT[rev.stage] ?? []).map((n) => <Button key={n.stage} size="sm" variant={n.stage === 'Rejected' ? 'destructive' : 'default'} disabled={meaning.trim().length < 3 || reason.trim().length < 3} onClick={() => act(n.stage)}>{n.label}</Button>)}</div>
          </div> : <p className="text-xs text-muted-foreground">Chain complete.</p>}
        </div>}
      </div>
    </div>);
}
