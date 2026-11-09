import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {workspaceHistory} from '@/lib/engineering/workspace.functions';
import {useEngineering} from '@/lib/engineering/context';
import {Button} from '@/components/ui/button';
import {Frame,Badge} from './common';
export function WorkspaceHistory(){const {authenticated}=useEngineering();const read=useServerFn(workspaceHistory);const [rows,setRows]=useState<Awaited<ReturnType<typeof workspaceHistory>>>([]);const [error,setError]=useState('');return <Frame title="Saved revision history"><Button variant="outline" size="sm" disabled={!authenticated} onClick={async()=>{try{setRows(await read());setError('');}catch{setError('Shared history could not be loaded.');}}}>Load immutable revisions</Button>{!authenticated&&<p className="text-xs text-muted-foreground mt-3">Verified account required to read your saved revisions.</p>}{error&&<p className="text-warning">{error}</p>}<div className="eng-table-wrap mt-3"><table className="eng-table"><thead><tr><th>Revision</th><th>Lifecycle</th><th>Actor ID</th><th>Reason</th><th>Saved</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>r{r.revision}</td><td><Badge>{r.lifecycle}</Badge></td><td className="font-mono">{r.actor_id}</td><td>{r.reason}</td><td>{new Date(r.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></Frame>;}
