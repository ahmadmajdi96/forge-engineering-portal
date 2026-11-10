import { Link } from '@tanstack/react-router';
import { ArrowRight, Cable, Monitor, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEngineering } from '@/lib/engineering/context';
import { lineDesignMetrics } from '@/lib/engineering/asset-flow';
import { EngineeringDataDrawer } from './record-editor';

export function AssetLineMetrics() {
  const { model } = useEngineering();
  const metrics = lineDesignMetrics(model);
  return <div className="asset-design-metrics">{[['Production steps',metrics.steps],['Stations',metrics.stations],['Manual',metrics.manual],['Automatic',metrics.automatic],['Missing app bindings',metrics.missingApps]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}<Button variant="outline" asChild><Link to="/asset-steps">Configure steps<ArrowRight size={15}/></Link></Button></div>;
}

export function AssetStationConfiguration() {
  const {model,setModel,selected} = useEngineering();
  const station = model.stations.find(item=>item.id===selected)??model.stations[0];
  if (!station) return null;
  return <section className="asset-station-config" aria-label="Station configuration">
    <header className="asset-section-header"><div><small>{station.id} · Engineering draft</small><h2>Station configuration</h2></div><EngineeringDataDrawer initialKind="station" label="Manage stations"/></header>
    <div className="asset-step-fields">
      <label>Station mode<select aria-label="Station mode" value={station.mode} onChange={event=>setModel({...model,stations:model.stations.map(item=>item.id===station.id?{...item,mode:event.target.value==='automatic'?'automatic':'manual'}:item)})}><option value="manual">Manual · human operator</option><option value="automatic">Automatic · machine</option></select></label>
      <label>Edge app binding<input aria-label="Station edge app" value={station.app} onChange={event=>setModel({...model,stations:model.stations.map(item=>item.id===station.id?{...item,app:event.target.value}:item)})}/></label>
      <label>Communication protocol<select aria-label="Station communication protocol" value={model.adapter.protocol} onChange={event=>setModel({...model,adapter:{...model.adapter,protocol:event.target.value}})}>{Array.from(new Set([model.adapter.protocol,'OPC UA','Modbus TCP','MQTT','HTTP'])).map(protocol=><option key={protocol}>{protocol}</option>)}</select></label>
      <label>Source endpoint<input aria-label="Station source endpoint" value={model.adapter.endpoint} onChange={event=>setModel({...model,adapter:{...model.adapter,endpoint:event.target.value}})}/></label>
    </div>
    <nav className="asset-config-links"><Button variant="outline" asChild><Link to="/edge-app-studio"><Workflow size={15}/>Edge app</Link></Button><Button variant="outline" asChild><Link to="/hmi-layouts"><Monitor size={15}/>HMI binding</Link></Button><Button variant="outline" asChild><Link to="/station-connectivity"><Cable size={15}/>Received data</Link></Button><Button variant="outline" asChild><Link to="/command-policy"><ArrowRight size={15}/>Sent data & commands</Link></Button><span className="text-muted-foreground">Shared source adapter · not commissioned</span></nav>
  </section>;
}