import test from 'node:test';
import assert from 'node:assert/strict';
import {getScenario, periods, type Period} from '../../../apps/web/app/city-insights-data';
test('synthetic city scenarios have consistent, bounded measures and stable identities', () => {
  const baseline = getScenario('peak').map(row => row.id).sort();
  assert.equal(new Set(baseline).size, 6);
  for (const period of Object.keys(periods) as Period[]) {
    const scenario = getScenario(period);
    assert.deepEqual(scenario.map(row => row.id).sort(), baseline);
    assert.deepEqual(getScenario(period), scenario);
    for (let i = 0; i < scenario.length; i++) {
      const row = scenario[i];
      assert.ok(row.delayMinutes > 0 && row.delayMinutes <= 5);
      assert.ok(row.ridersPerHour > 0);
      assert.ok(row.savedMinutes > 0 && row.savedMinutes < row.delayMinutes);
      assert.ok(Math.abs(row.savedMinutes - row.delayMinutes * row.reduction) <= 0.051);
      if (i) assert.ok(scenario[i - 1].delayMinutes >= row.delayMinutes);
    }
  }
  assert.notDeepEqual(getScenario('peak'), getScenario('weekend'));
});
