# Investment Properties — HubSpot Foundations Practicum

A standalone Node.js learning project forked from the official HubSpot Academy starter. It lists fictional investment properties and creates new records through the HubSpot CRM API. This repository does not contain or depend on the private Creative REI application.

**Status:** application implemented; seven automated tests pass. A developer test account, private app, live API verification, and the required list-view URL remain pending. This is not yet ready for assessment submission.

**Authorship:** implementation and testing were assisted by OpenAI Codex. The Git history records that assistance. The learner should review, run, and understand this code and confirm that this assistance is acceptable to HubSpot Academy before requesting certification credit. No acceptance or passing grade is implied.

## Required developer test account list view

**PENDING — replace this line with the verified list URL after test-account setup.**

Required format: `https://app.hubspot.com/contacts/<test-account-id>/objects/<custom-object-id>/views/all/list`

Do not use a production portal. No account ID or object ID is fabricated here.

## Run the fictional local demonstration

Use Node.js 22 or newer:

```sh
npm ci
npm run demo
```

Open `http://localhost:3000`. The banner explicitly identifies the in-memory demo. Three fictional properties are included, and the creation form updates the table. Demo data resets on restart. The demo does not make HubSpot API calls and cannot establish that the live integration works.

## Connect a separate HubSpot developer test account

1. Create or select a developer test account and verify its account ID in HubSpot.
2. Create `Christopher’s Practicum Private App` in that test account with the course-required read and write scopes for custom schemas, custom objects, and contacts. Review permissions before generating the token.
3. Copy `.env.example` to `.env` locally. Set `HUBSPOT_ACCESS_TOKEN` and `HUBSPOT_TEST_ACCOUNT_ID`. Keep the token local and never paste it into the public repository, an issue, a screenshot, or a chat.
4. Run `npm run setup:hubspot` to preview the schema and seed records without calling the API.
5. After verifying the account and intended changes, run `npm run setup:hubspot -- --apply`. The script verifies that the token account matches the configured ID before writes. It creates the investment-property schema if absent, verifies its three property types and contact association, then adds any missing fictional seed records. It never deletes existing data.
6. Copy the returned object type ID into `HUBSPOT_OBJECT_TYPE` in `.env`. Use the returned list-view URL to replace the pending README entry and verify that the three records are visible in HubSpot.
7. Run `npm start`, open `http://localhost:3000`, create a fourth fictional property through the form, and verify it both in the homepage table and HubSpot's list view.

The setup script checks the account ID but cannot independently prove a portal is a developer test account. That designation must be verified in the HubSpot UI. If custom objects are unavailable, the course allows a standard object. The application supports alternate property names through `.env`; a standard-object schema and any additional required fields/scopes must be configured before using that fallback. The script intentionally does not change production objects or automatically fall back to one.

## Object definition

| Internal property | Label | HubSpot type |
| --- | --- | --- |
| `name` | Name | string / text |
| `investment_strategy` | Investment strategy | string / text |
| `asking_price` | Asking price | number / number |

The schema defines the contact object as an associated object type. Seed records are fictional and use Sunnyvale, Fort Wayne, and Orlando as descriptive names, not real addresses or valuations.

## Required routes and templates

| Method and route | Action | Template |
| --- | --- | --- |
| `GET /` | Retrieve the three CRM property fields; render a paginated HTML table | `views/homepage.pug` |
| `GET /update-cobj` | Render a form with the three properties | `views/updates.pug` |
| `POST /update-cobj` | Validate, create a CRM record, redirect to the homepage | redirects with HTTP 303 |

The title, homepage return link, and “Add to this table” link follow the course directions. The starter `contacts.pug` remains for reference, and the original sample server is preserved as `index.starter-reference.js`.

## Verification

```sh
npm test
npm run check
npm run setup:hubspot
```

Seven tests cover the form/create/redirect/table flow, HTML escaping, validation without writes, rejected CSRF tokens, rate-limit errors without credential leakage, pagination, API request mapping, and fail-closed configuration. API transport is mocked in tests; live HubSpot verification is a separate required step.

The server binds to localhost. It is a local practicum, not a publicly deployed production service. Tokens remain server-side. The form has CSRF protection, bounded inputs, and escaped Pug output. Failed POST requests are not automatically retried to avoid duplicate creation after ambiguous timeouts.

## Submission checklist

- [x] Fork the official starter into a separately named repository.
- [x] Create `working-branch` and retain honest incremental commit history.
- [x] Implement three routes and the two required Pug templates.
- [x] Use Express, Axios, dotenv, and Pug; keep `.env` ignored.
- [x] Complete local tests and syntax checks.
- [ ] Verify a separate developer test account and create the required private app.
- [ ] Verify the custom object, three properties, contact association, and at least three records.
- [ ] Replace the pending README entry with the real test-account list URL.
- [ ] Verify a live form submission creates a HubSpot record.
- [ ] Merge the working branch into main after final connection verification.
- [ ] Review authorship requirements and submit the public repository link in Academy.

Do not upload a file or submit a preview URL. HubSpot Academy determines acceptance and manually grades the practicum.

## Sources

- [Official starter repository](https://github.com/HubSpot-Academy/integrating-with-hubspot-i-foundations-practicum)
- [HubSpot custom objects and private apps](https://developers.hubspot.com/blog/how-to-build-a-custom-object-using-private-apps)
- The instructions shown in the learner's HubSpot Academy Foundations practicum page, reviewed October 23, 2026. The Academy instructions take precedence where the starter README differs.
