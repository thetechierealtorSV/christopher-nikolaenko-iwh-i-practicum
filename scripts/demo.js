'use strict';
const { createApp } = require('../index');
const records = [
  { id: 'demo-1', name: 'Sunnyvale Demo Property', strategy: 'Seller finance', price: '850000' },
  { id: 'demo-2', name: 'Fort Wayne Demo Property', strategy: 'Buy and hold', price: '165000' },
  { id: 'demo-3', name: 'Orlando Demo Property', strategy: 'BRRRR', price: '275000' },
];
const store = {
  async list() { return { records: [...records], nextAfter: null }; },
  async create(values) { const record = { id: `demo-${records.length + 1}`, ...values }; records.unshift(record); return record; },
};
const port = Number(process.env.PORT || 3000);
createApp({ store, mode: 'demo' }).listen(port, '127.0.0.1', () => console.log(`Fictional in-memory demo: http://localhost:${port}. HubSpot is NOT connected.`));
