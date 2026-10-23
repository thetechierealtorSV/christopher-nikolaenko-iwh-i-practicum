'use strict';
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');

const schema = {
  name: 'practicum_investment_property',
  labels: { singular: 'Investment Property', plural: 'Investment Properties' },
  primaryDisplayProperty: 'name',
  requiredProperties: ['name', 'investment_strategy', 'asking_price'],
  searchableProperties: ['name'],
  secondaryDisplayProperties: ['investment_strategy', 'asking_price'],
  properties: [
    { name: 'name', label: 'Name', type: 'string', fieldType: 'text' },
    { name: 'investment_strategy', label: 'Investment strategy', type: 'string', fieldType: 'text' },
    { name: 'asking_price', label: 'Asking price', type: 'number', fieldType: 'number' },
  ],
  associatedObjects: ['CONTACT'],
};
const seeds = [
  { name: 'Sunnyvale Demo Property', investment_strategy: 'Seller finance', asking_price: '850000' },
  { name: 'Fort Wayne Demo Property', investment_strategy: 'Buy and hold', asking_price: '165000' },
  { name: 'Orlando Demo Property', investment_strategy: 'BRRRR', asking_price: '275000' },
];

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log('Preview only. No API calls or account changes.');
    console.log(JSON.stringify({ schema, fictionalRecords: seeds }, null, 2));
    console.log('After configuring the separate test-account token and ID, run: npm run setup:hubspot -- --apply');
    return;
  }
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  const testAccount = process.env.HUBSPOT_TEST_ACCOUNT_ID;
  if (!token || !/^\d+$/.test(testAccount || '')) throw new Error('Set HUBSPOT_ACCESS_TOKEN and the separately verified HUBSPOT_TEST_ACCOUNT_ID in .env.');
  const api = axios.create({ baseURL: 'https://api.hubapi.com', timeout: 15000, headers: { Authorization: `Bearer ${token}` } });
  // Check the token account before any write. A matching ID is not proof the portal is a developer test account: verify that in the HubSpot UI first.
  const { data: identity } = await api.get('/integrations/v1/me');
  if (String(identity.portalId) !== testAccount) throw new Error('Token account does not match the expected developer test account. No changes made.');
  const { data: all } = await api.get('/crm/v3/schemas');
  let object = all.results.find(item => item.name === schema.name);
  if (!object) ({ data: object } = await api.post('/crm/v3/schemas', schema));
  for (const property of schema.properties) {
    const found = object.properties.find(item => item.name === property.name);
    if (!found || found.type !== property.type) throw new Error('An existing schema has incompatible properties. Review it manually; no schema is overwritten.');
  }
  if (!object.associations?.some(item => item.toObjectTypeId === '0-1' || item.fromObjectTypeId === '0-1')) {
    throw new Error('Contact association was not confirmed. Add the contact association in HubSpot and rerun.');
  }
  for (const properties of seeds) {
    const { data: matches } = await api.post(`/crm/v3/objects/${object.objectTypeId}/search`, {
      filterGroups: [{ filters: [{ propertyName: 'name', operator: 'EQ', value: properties.name }] }], properties: ['name'], limit: 1,
    });
    if (!matches.results.length) await api.post(`/crm/v3/objects/${object.objectTypeId}`, { properties });
  }
  const result = { testAccountId: testAccount, objectTypeId: object.objectTypeId, listUrl: `https://app.hubspot.com/contacts/${testAccount}/objects/${object.objectTypeId}/views/all/list` };
  fs.writeFileSync(path.join(__dirname, '..', 'hubspot-setup.local.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
  console.log('Set HUBSPOT_OBJECT_TYPE in .env and replace the pending README list-view entry with the verified listUrl.');
}
if (require.main === module) main().catch(error => {
  // Never dump the Axios error: it contains the Authorization header.
  console.error(error.response ? `Setup stopped: HubSpot returned HTTP ${error.response.status}. Check scopes and test-account custom-object availability.` : error.message);
  process.exitCode = 1;
});
module.exports = { schema, seeds };
