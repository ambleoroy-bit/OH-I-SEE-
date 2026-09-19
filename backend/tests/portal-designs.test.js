'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, records, reset, token } = require('./marketplace-fixture');
app.use('/api/portal', require('../src/routes/portal'));
let server, base;
test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/portal/projects/P1/designs`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => { reset(); records.portal_design_versions = []; });
for (const [label, budget, setupBudget, expected] of [
  ['Indian-formatted currency', '₹5,00,00,000', undefined, 50000000],
  ['numeric budget', 2500000, undefined, 2500000],
  ['zero budget', 0, '₹50,00,000', 0],
  ['setup fallback', undefined, '₹5,00,00,000', 50000000],
  ['invalid answer fallback', 'not a number', '₹25,00,000', 2500000],
]) {
  test(`design version persists a numeric cost for ${label}`, async () => {
    records.projects[0].construction_context = { intentAnswers: { budget }, projectSetup: { estimated_budget: setupBudget } };
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('c1')}` }, body: JSON.stringify({ packages: ['floor_plan'], preferences: {} }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.cost_estimate, expected);
    assert.equal(records.portal_design_versions[0].cost_estimate, expected);
    const saved = await fetch(base, { headers: { Authorization: `Bearer ${token('c1')}` } });
    assert.equal((await saved.json()).data[0].cost_estimate, expected);
  });
}
test('another customer cannot create a design for this project', async () => {
  const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('c2')}` }, body: '{}' });
  assert.equal(response.status, 404);
  assert.equal(records.portal_design_versions.length, 0);
});