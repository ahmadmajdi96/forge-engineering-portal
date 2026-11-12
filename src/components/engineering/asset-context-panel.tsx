import { Link } from '@tanstack/react-router';
import { ArrowRight, Cable, Monitor, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEngineering } from '@/lib/engineering/context';
import { lineDesignMetrics } from '@/lib/engineering/asset-flow';
import { EngineeringDataDrawer } from './record-editor';
import { projectAssets,putStation } from '@/lib/engineering/asset-registry';

export function AssetLineMetrics() {
  const { model } = useEngineering();
  const metrics = lineDesignMetrics(model);
  return <div className="asset-design-metrics">{[['Production steps',metrics.steps],['Stations',metrics.stations],['Manual',metrics.manual],['Automatic',metrics.automatic],['Missing app bindings',metrics.missingApps]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}<Button variant="outline" asChild><Link to="/asset-steps">Configure steps<ArrowRight size={15}/></Link></Button></div>;
}

export function AssetStationConfiguration() {
  const {model,setModel,selected} = useEngineering();
  const station = model.stations.find(item=>item.id===selected)??model.stations[0];
  if (!station) return null;
  const profile=projectAssets(model).stations.find(s=>s.id===station.id);
  const machine=profile?.machine;
  function configure(key:string,value:string){if(!profile)return;const base=machine??{model:profile.name,vendor:'',ipAddress:'',port:4840,protocol:'OPC-UA' as const,receivedDataTypes:'',sentDataTypes:''};setModel(putStation(model,{...profile,machine:{...base,[key]:value}}));}
  return <section className="asset-station-config" aria-label="Station configuration">
    <header className="asset-section-header"><div><small>{station.id} · Engineering draft</small><h2>Station configuration</h2></div><EngineeringDataDrawer initialKind="station" label="Manage stations"/></header>
    <div className="asset-step-fields">
      <label>Station mode<select aria-label="Station mode" value={station.mode} onChange={event=>setModel({...model,stations:model.stations.map(item=>item.id===station.id?{...item,mode:event.target.value==='automatic'?'automatic':'manual'}:item)})}><option value="manual">Manual · human operator</option><option value="automatic">Automatic · machine</option></select></label>
      <label>Edge app binding<input aria-label="Station edge app" value={station.app} onChange={event=>setModel({...model,stations:model.stations.map(item=>item.id===station.id?{...item,app:event.target.value}:item)})}/></label>
      <label>Communication protocol<select aria-label="Station communication protocol" value={machine?.protocol??'OPC-UA'} onChange={event=>configure('protocol',event.target.value)}>{['OPC-UA','Modbus-TCP','MQTT','REST','EtherNet/IP','Profinet'].map(protocol=><option key={protocol}>{protocol}</option>)}</select></label>
      <label>Source endpoint<input aria-label="Station source endpoint" value={machine?.ipAddress??''} onChange={event=>configure('ipAddress',event.target.value)}/></label>
    </div>
    <nav className="asset-config-links"><Button variant="outline" asChild><Link to="/edge-app-studio"><Workflow size={15}/>Edge app</Link></Button><Button variant="outline" asChild><Link to="/hmi-layouts"><Monitor size={15}/>HMI binding</Link></Button><Button variant="outline" asChild><Link to="/station-connectivity"><Cable size={15}/>Received data</Link></Button><Button variant="outline" asChild><Link to="/command-policy"><ArrowRight size={15}/>Sent data & commands</Link></Button><span className="text-muted-foreground">Station machine configuration · not commissioned</span></nav>
  </section>;
}