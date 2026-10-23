'use strict';
require('dotenv').config({ quiet: true });
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const axios = require('axios');

const STRATEGIES = ['Seller finance', 'Subject-to', 'Buy and hold', 'Fix and flip', 'BRRRR'];

function readConfig(env = process.env) {
  const token = env.HUBSPOT_ACCESS_TOKEN || '';
  const objectType = env.HUBSPOT_OBJECT_TYPE || '';
  const propertyNames = {
    name: env.HUBSPOT_NAME_PROPERTY || 'name',
    strategy: env.HUBSPOT_STRATEGY_PROPERTY || 'investment_strategy',
    price: env.HUBSPOT_PRICE_PROPERTY || 'asking_price',
  };
  if (!token || !objectType) throw new Error('Configure HUBSPOT_ACCESS_TOKEN and HUBSPOT_OBJECT_TYPE in a local .env file.');
  if (!/^[a-zA-Z0-9_-]+$/.test(objectType)) throw new Error('Invalid HubSpot object type.');
  for (const value of Object.values(propertyNames)) {
    if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error('Invalid HubSpot property name.');
  }
  if (new Set(Object.values(propertyNames)).size !== 3) throw new Error('Use three distinct HubSpot property names.');
  return { token, objectType, propertyNames };
}

function createHubSpotStore(config) {
  // The token stays server-side and is never passed to Pug, a URL, or a browser.
  const client = axios.create({
    baseURL: 'https://api.hubapi.com', timeout: 15000,
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
  });
  const endpoint = `/crm/v3/objects/${encodeURIComponent(config.objectType)}`;
  return {
    async list(after) {
      const { data } = await client.get(endpoint, { params: {
        limit: 100, archived: false,
        properties: Object.values(config.propertyNames).join(','),
        ...(after ? { after } : {}),
      } });
      return {
        records: data.results.map(record => ({
          id: record.id,
          name: record.properties[config.propertyNames.name] || '',
          strategy: record.properties[config.propertyNames.strategy] || '',
          price: record.properties[config.propertyNames.price] ?? '',
        })),
        nextAfter: data.paging?.next?.after || null,
      };
    },
    async create(values) {
      const properties = Object.fromEntries(Object.entries(config.propertyNames).map(([key, property]) => [property, String(values[key])]));
      const { data } = await client.post(endpoint, { properties });
      return data;
    },
  };
}

function validate(body) {
  const values = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    strategy: typeof body.strategy === 'string' ? body.strategy.trim() : '',
    price: typeof body.price === 'string' ? body.price.trim() : '',
  };
  const errors = [];
  if (!values.name || values.name.length > 120) errors.push('Enter a property name of 1–120 characters.');
  if (!STRATEGIES.includes(values.strategy)) errors.push('Choose a supported investment strategy.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(values.price) || Number(values.price) > 9999999999) errors.push('Enter a nonnegative asking price with at most two decimal places.');
  return { values, errors };
}

function safeApiError(error) {
  const status = error.response?.status;
  if (status === 401) return { status: 502, message: 'HubSpot rejected the private app token. Check the local configuration.' };
  if (status === 403) return { status: 502, message: 'The private app needs the correct object read and write permissions.' };
  if (status === 429) return { status: 503, message: 'HubSpot is temporarily rate limiting requests. Wait before trying again.' };
  if (status === 400) return { status: 502, message: 'HubSpot rejected the record. Check the object properties and required fields.' };
  return { status: 502, message: 'HubSpot could not complete this request. Check the connection and try again.' };
}

function createApp({ store, mode = 'hubspot' }) {
  const app = express();
  const formSecret = crypto.randomBytes(32);
  const sessionCookie = 'practicum_form';
  app.disable('x-powered-by');
  app.set('view engine', 'pug');
  app.set('views', path.join(__dirname, 'views'));
  app.use((req, res, next) => {
    res.set({ 'Content-Security-Policy': "default-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    res.locals.mode = mode;
    next();
  });
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));

  function issueFormToken(req, res) {
    const nonce = crypto.randomBytes(24).toString('hex');
    const token = `${nonce}.${crypto.createHmac('sha256', formSecret).update(nonce).digest('hex')}`;
    res.cookie(sessionCookie, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 3600000, path: '/' });
    return token;
  }
  function validFormToken(req) {
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${sessionCookie}=`));
    const supplied = typeof req.body.csrf === 'string' ? req.body.csrf : '';
    const stored = cookie ? decodeURIComponent(cookie.slice(sessionCookie.length + 1)) : '';
    const [nonce, mac] = supplied.split('.');
    if (!nonce || !mac || stored !== supplied) return false;
    const expected = crypto.createHmac('sha256', formSecret).update(nonce).digest('hex');
    return mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  }

  // Route 1: request all three configured properties and render one paginated table.
  app.get('/', async (req, res) => {
    try {
      const after = typeof req.query.after === 'string' ? req.query.after : '';
      if (after && !/^[a-zA-Z0-9_-]{1,200}$/.test(after)) return res.status(400).render('error', { title: 'Invalid page', message: 'The page cursor is invalid.' });
      const { records, nextAfter } = await store.list(after);
      res.render('homepage', { title: 'Investment Properties | Integrating With HubSpot I Practicum', records, nextAfter, created: req.query.created === '1', money: value => value === '' ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value)) });
    } catch (error) {
      const safe = safeApiError(error);
      res.status(safe.status).render('error', { title: 'Connection needs attention', message: safe.message });
    }
  });

  // Route 2: render the create-record form, without placing credentials in HTML.
  app.get('/update-cobj', (req, res) => {
    res.render('updates', { title: 'Update Custom Object Form | Integrating With HubSpot I Practicum', values: {}, errors: [], strategies: STRATEGIES, csrf: issueFormToken(req, res) });
  });

  // Route 3: validate, POST to HubSpot, then redirect to a fresh GET of the table.
  app.post('/update-cobj', async (req, res) => {
    if (!validFormToken(req)) return res.status(403).render('error', { title: 'Form expired', message: 'Return to the form and try again.' });
    const { values, errors } = validate(req.body);
    if (errors.length) return res.status(422).render('updates', { title: 'Update Custom Object Form | Integrating With HubSpot I Practicum', values, errors, strategies: STRATEGIES, csrf: issueFormToken(req, res) });
    try {
      await store.create(values);
      res.clearCookie(sessionCookie, { path: '/' });
      res.redirect(303, '/?created=1');
    } catch (error) {
      const safe = safeApiError(error);
      res.status(safe.status).render('updates', { title: 'Update Custom Object Form | Integrating With HubSpot I Practicum', values, errors: [safe.message + ' Check the table before retrying a timed-out request to avoid duplicate records.'], strategies: STRATEGIES, csrf: issueFormToken(req, res) });
    }
  });
  app.use((req, res) => res.status(404).render('error', { title: 'Page not found', message: 'This page does not exist.' }));
  app.use((error, req, res, next) => res.status(400).render('error', { title: 'Invalid request', message: 'The request could not be processed.' }));
  return app;
}

if (require.main === module) {
  try {
    const app = createApp({ store: createHubSpotStore(readConfig()) });
    const port = Number(process.env.PORT || 3000);
    app.listen(port, '127.0.0.1', () => console.log(`Listening on http://localhost:${port}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { createApp, createHubSpotStore, readConfig, validate };
