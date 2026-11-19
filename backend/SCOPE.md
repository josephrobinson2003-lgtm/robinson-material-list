# Bid scope

A bid job can show its task list on the Scope tab. Prices are removed before the list is saved, and the phone never receives coordinates or money.

## What employees see

`POST` the web app URL with:

```json
{"path":"/api/scope","token":"EMPLOYEE_TOKEN","jobId":"job_…"}
```

or, for a location match:

```json
{"path":"/api/scope","token":"EMPLOYEE_TOKEN","lat":38.63,"lng":-90.2,"accuracyMeters":20}
```

The response scope is only `jobId`, `address`, and `tasks`. A match requires one saved job within 150 meters and a fix no coarser than 150 meters. Otherwise the phone says there is no bid scope and the person picks the job.

## What Joe or an assistant sends

`POST` the same URL with the admin key. The text may still contain prices. The script strips them.

```json
{"path":"/api/scope/upsert","adminKey":"ADMIN_KEY","address":"123 Main St","contractor":"BluSky","tasks":"Install receptacles\nSubtotal $1200\nMount the panel"}
```

The stored sheet tab is `Scopes`: job id, address, latitude, longitude, contractor, the cleaned task list, and the time. Latitude and longitude are for matching only. They are not sent back to a phone. The job id is the same hash the phone uses for that address.

Geocoding uses Apps Script `Maps.newGeocoder` when the upsert does not already include coordinates. That uses the existing scope `https://www.googleapis.com/auth/script.external_request`. No new scope was added. The first geocode still asks Joe to approve the script again if Google shows a new prompt. If geocoding fails, the tasks are still saved and the job can be opened by name, but GPS matching will not find it until a later upsert gets coordinates.

## Redeploy

The live web app is already version 1. After pasting the changed files, deploy a new version. Do not paste the deployment URL into git.

Files to replace in the script editor:

- `Logic.js`
- `Code.js`
- `Store.js`

`appsscript.json` and `Graph.js` did not change for this feature.
