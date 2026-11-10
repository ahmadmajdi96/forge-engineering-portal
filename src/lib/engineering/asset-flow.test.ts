import { describe, expect, it } from 'vitest';
import { makeModel } from './model';
import { stationsForStep, lineDesignMetrics } from './asset-flow';

describe('Asset engineering flow', () => {
  it('shows one or more manual or automatic stations inside a production step', () => {
    const model = makeModel();
    const step = model.records.find(record => record.kind === 'operation');
    if (!step) throw Error('Missing step fixture');
    expect(stationsForStep(model, {...step, parent: 'ST-101', binding: 'ST-102, ST-101'}).map(station => [station.id, station.mode])).toEqual([['ST-101', 'manual'], ['ST-102', 'automatic']]);
  });
  it('calculates line design metrics from current components rather than fixed values', () => {
    const model = makeModel();
    expect(lineDesignMetrics(model)).toEqual({steps: 8, stations: 6, manual: 2, automatic: 4, unassigned: 0, missingApps: 0});
    model.stations = model.stations.filter(station => station.id !== 'ST-101');
    expect(lineDesignMetrics(model).stations).toBe(5);
    expect(lineDesignMetrics(model).unassigned).toBe(1);
  });
});