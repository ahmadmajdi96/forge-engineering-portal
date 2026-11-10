import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ArrowUp, ArrowDown, Boxes, ListOrdered, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEngineering } from '@/lib/engineering/context';
import { stationsForStep, lineDesignMetrics } from '@/lib/engineering/asset-flow';
import { AddRecord, RecordActions, useRecords, EngineeringDataDrawer } from './record-editor';
import { ReferencePage, Badge, Notice, DraftDialog } from './reference-ui';

export function AssetStepsPage() {
  const { model, setModel, select } = useEngineering();
  const { rows: steps, put } = useRecords('operation');
  const [selected, setSelected] = useState('OP-6');
  const [saving, setSaving] = useState(false);
  const step = steps.find(record => record.id === selected) ?? steps[0];
  const stations = step ? stationsForStep(model, step) : [];
  const metrics = lineDesignMetrics(model);

  function move(direction: number) {
    if (!step) return;
    const index = steps.findIndex(record => record.id === step.id);
    const other = steps[index + direction];
    if (!other) return;
    const records = [...model.records];
    const a = records.findIndex(record => record.id === step.id);
    const b = records.findIndex(record => record.id === other.id);
    records[a] = other; records[b] = step;
    setModel({ ...model, records });
  }

  function assign(id: string, checked: boolean) {
    if (!step) return;
    const ids = stations.map(station => station.id);
    const next = checked ? [...ids, id] : ids.filter(value => value !== id);
    put({ ...step, parent: next[0] ?? 'L-01', binding: next.slice(1).join(', ') });
  }

  return <ReferencePage title="Production Steps" sub={`${model.scope} / ${model.name} · ${steps.length} steps · Engineering draft`}
    actions={<><AddRecord kind="operation" label="Add production step" /><Button onClick={() => setSaving(true)}><Save size={15} />Save draft</Button></>}>
    <div className="asset-design-metrics" aria-label="Line design metrics">
      {[['Steps', metrics.steps], ['Stations', metrics.stations], ['Manual', metrics.manual], ['Automatic', metrics.automatic], ['Unassigned steps', metrics.unassigned]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}
    </div>
    <div className="asset-steps-layout">
      <aside className="asset-step-collection"><header><ListOrdered size={18} /><h2>Step sequence</h2><Badge>{steps.length}</Badge></header>
        {steps.map((record, index) => <Button key={record.id} variant="ghost" className={`asset-step-row ${record.id === step?.id ? 'is-selected' : ''}`} onClick={() => setSelected(record.id)}>
          <span className="asset-flow-number">{index + 1}</span><span><strong>{record.name}</strong><small>{record.id} · {stationsForStep(model, record).length} stations</small></span><ArrowRight size={14} />
        </Button>)}
      </aside>
      {step ? <div className="asset-step-detail">
        <header className="asset-section-header"><div><small>{step.id} · {step.version}</small><h2>{step.name}</h2></div><div className="ref-actions">
          <Button variant="outline" size="icon" aria-label="Move step earlier" title="Move step earlier" disabled={steps[0]?.id === step.id} onClick={() => move(-1)}><ArrowUp size={15} /></Button>
          <Button variant="outline" size="icon" aria-label="Move step later" title="Move step later" disabled={steps.at(-1)?.id === step.id} onClick={() => move(1)}><ArrowDown size={15} /></Button>
          <RecordActions record={step} />
        </div></header>
        <div className="asset-step-fields"><label>Step name<input aria-label="Production step name" value={step.name} onChange={event => put({...step, name:event.target.value})} /></label>
          <label>Version<input value={step.version} onChange={event => put({...step, version:event.target.value})} /></label>
          <label className="span-two">Parameters & instructions<textarea aria-label="Step instructions" value={step.description} onChange={event => put({...step, description:event.target.value})} /></label>
        </div>
        <h3 className="ref-section-label">Step → station composition</h3>
        <div className="asset-step-visual"><div className="asset-step-source"><ListOrdered size={22} /><strong>{step.name}</strong><small>{step.id}</small></div><ArrowRight size={20} />
          <div className="asset-step-stations">{stations.map(station => <Button variant="outline" asChild key={station.id} onClick={() => select(station.id)}><Link to="/workstations"><Boxes size={20} /><span><strong>{station.name}</strong><small>{station.id} · {station.equipment.length} equipment references</small><small>{station.app || 'Application unassigned'}</small></span><Badge tone={station.mode === 'automatic' ? 'cyan' : 'neutral'}>{station.mode}</Badge><ArrowRight size={15} /></Link></Button>)}</div>
        </div>
        {stations.length === 0 && <Notice tone="warn">No stations assigned to this step.</Notice>}
        <div className="asset-section-header"><h3 className="ref-section-label">Station assignments</h3><EngineeringDataDrawer initialKind="station" label="Manage stations" /></div>
        <div className="asset-assignment-list">{model.stations.map(station => <label key={station.id}><input type="checkbox" aria-label={`Assign ${station.id}`} checked={stations.some(current => current.id === station.id)} onChange={event => assign(station.id, event.target.checked)} /><span><strong>{station.id}</strong> {station.name}</span><Badge tone={station.mode === 'automatic' ? 'cyan' : 'neutral'}>{station.mode}</Badge></label>)}</div>
        <Notice>Engineering draft only · station assignments do not dispatch production or activate equipment.</Notice>
      </div> : <Notice>No production steps in this draft.</Notice>}
    </div><DraftDialog open={saving} onClose={() => setSaving(false)} />
  </ReferencePage>;
}