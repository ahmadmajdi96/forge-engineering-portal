import type { EngineeringModel } from './model';
import type { DesignRecord } from './design-records';

// Operation parents identify the primary station; binding may carry additional station IDs.
export function stationsForStep(model: EngineeringModel, step: DesignRecord) {
  const ids = new Set([step.parent, ...step.binding.split(',').map(id => id.trim())]);
  return model.stations.filter(station => ids.has(station.id));
}

export function lineDesignMetrics(model: EngineeringModel) {
  const steps = model.records.filter(record => record.kind === 'operation' && !record.archived);
  return {
    steps: steps.length,
    stations: model.stations.length,
    manual: model.stations.filter(station => station.mode === 'manual').length,
    automatic: model.stations.filter(station => station.mode === 'automatic').length,
    unassigned: steps.filter(step => stationsForStep(model, step).length === 0).length,
    missingApps: model.stations.filter(station => !station.app.trim()).length,
  };
}