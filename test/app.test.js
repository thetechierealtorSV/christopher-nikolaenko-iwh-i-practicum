'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { createApp, createHubSpotStore, readConfig } = require('../index');

async function withApp(t, store) {
  const server = createApp({ store }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
async function form(base) {
  const response = await fetch(base + '/update-cobj');
  const html = await response.text();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: html.match(/name="csrf" value="([^"]+)"/)[1] };
}
async function post(base, session, fields) {
  return fetch(base + '/update-cobj', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: session.cookie }, body: new URLSearchParams({ csrf: session.csrf, ...fields }) });
}

test('table -> form -> create -> redirect -> refreshed table; output is escaped', async t => {
  const records = [{ id: '1', name: 'Seed property', strategy: 'Seller finance', price: '850000' }];
  const base = await withApp(t, { async list() { return { records }; }, async create(values) { records.push(values); } });
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Seed property/);
  const response = await post(base, await form(base), { name: '<script>alert(1)</script>', strategy: 'BRRRR', price: '250000.50' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/?created=1');
  const html = await (await fetch(base + response.headers.get('location'))).text();
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /250,000.50/);
  assert.match(html, /Property created/);
});
test('invalid values preserve the form and make no CRM write', async t => {
  let writes = 0;
  const base = await withApp(t, { async create() { writes++; } });
  const response = await post(base, await form(base), { name: 'Saved text', strategy: 'Unrecognized', price: '-10' });
  assert.equal(response.status, 422);
  const html = await response.text();
  assert.match(html, /Saved text/);
  assert.match(html, /nonnegative/);
  assert.equal(writes, 0);
});
test('missing or tampered CSRF tokens cannot write records', async t => {
  let writes = 0;
  const base = await withApp(t, { async create() { writes++; } });
  const response = await post(base, { cookie: '', csrf: 'bogus' }, { name: 'A', strategy: 'BRRRR', price: '1' });
  assert.equal(response.status, 403);
  assert.equal(writes, 0);
});
test('API errors preserve input without leaking token or Axios internals', async t => {
  const base = await withApp(t, { async create() { throw { response: { status: 429 }, config: { headers: { Authorization: 'Bearer SECRET_TOKEN' } } }; } });
  const response = await post(base, await form(base), { name: 'Retry property', strategy: 'BRRRR', price: '100' });
  assert.equal(response.status, 503);
  const html = await response.text();
  assert.match(html, /Retry property/);
  assert.match(html, /rate limiting/);
  assert.doesNotMatch(html, /SECRET_TOKEN|Authorization/);
});
test('pagination and malformed cursors are handled', async t => {
  let cursor;
  const base = await withApp(t, { async list(after) { cursor = after; return { records: [], nextAfter: '200' }; } });
  const response = await fetch(base + '/?after=100');
  assert.match(await response.text(), /after=200/);
  assert.equal(cursor, '100');
  assert.equal((await fetch(base + '/?after=%3Cscript%3E')).status, 400);
});
test('HubSpot adapter GET and POST carry the three properties and server token', async () => {
  const original = axios.defaults.adapter;
  const calls = [];
  axios.defaults.adapter = async config => {
    calls.push(config);
    const data = config.method === 'get' ? { results: [{ id: '42', properties: { name: 'Test', investment_strategy: 'BRRRR', asking_price: '123' } }], paging: { next: { after: '43' } } } : { id: '44' };
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  try {
    const store = createHubSpotStore(readConfig({ HUBSPOT_ACCESS_TOKEN: 'test-secret', HUBSPOT_OBJECT_TYPE: '2-123' }));
    const page = await store.list('40');
    assert.deepEqual(page.records[0], { id: '42', name: 'Test', strategy: 'BRRRR', price: '123' });
    assert.equal(page.nextAfter, '43');
    await store.create({ name: 'New', strategy: 'Buy and hold', price: '42' });
    assert.equal(calls[0].url, '/crm/v3/objects/2-123');
    assert.equal(calls[0].params.properties, 'name,investment_strategy,asking_price');
    assert.equal(calls[0].headers.Authorization, 'Bearer test-secret');
    assert.deepEqual(JSON.parse(calls[1].data), { properties: { name: 'New', investment_strategy: 'Buy and hold', asking_price: '42' } });
  } finally { axios.defaults.adapter = original; }
});
test('configuration fails closed without credentials or with duplicate property names', () => {
  assert.throws(() => readConfig({}), /Configure/);
  assert.throws(() => readConfig({ HUBSPOT_ACCESS_TOKEN: 'test', HUBSPOT_OBJECT_TYPE: '2-1', HUBSPOT_PRICE_PROPERTY: 'name' }), /distinct/);
});
