# Set up the private Robinson Electrical backend

Do these steps in the company Google account, RobinsonElectricalLlc@gmail.com.
Nothing in this folder is deployed by itself. The phone stays disconnected until
you paste the web app address and a token into that phone.

Do not put the admin key, employee tokens, Microsoft client secret, or refresh
token in git.

## 1. Create the Apps Script

1. Sign in to Google as RobinsonElectricalLlc@gmail.com.
2. Open https://script.google.com and create a project named Robinson Electrical backend.
3. Project Settings, check "Show appsscript.json".
4. Either paste the files in `backend/apps-script/` over the default files, or use clasp:
   - `npm install -g @google/clasp`
   - `clasp login` as that Google account
   - Put the script ID from Project Settings into `backend/apps-script/.clasp.json`, replacing `REPLACE_WITH_SCRIPT_ID`
   - From `backend/apps-script`, run `clasp push`
5. In the Apps Script library dialog, add the OAuth2 library with ID
   `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`, identifier `OAuth2`.
   Use the latest version the dialog offers if version 43 is not listed. The
   `appsscript.json` in this folder already names version 43.

## 2. Script Properties

Project Settings, Script properties. Add:

| Property | Value |
| --- | --- |
| ADMIN_KEY | A long random string you invent. This opens only the Microsoft authorization page. |
| MS_CLIENT_ID | From the Microsoft app in step 5. Leave blank until then. |
| MS_CLIENT_SECRET | From that same Microsoft app. Leave blank until then. |

Do not add employee tokens here. The script stores only hashes after step 4.

## 3. Deploy the web app

1. Deploy, New deployment, type Web app.
2. Execute as: Me (RobinsonElectricalLlc@gmail.com).
3. Who has access: Anyone. Employees do not have company Google accounts. The script still rejects calls that lack a valid employee token.
4. Copy the web app URL. It ends in `/exec`. That URL is what each phone saves. It is not a secret by itself, but do not publish it.

## 4. Sheet, Sunday trigger, and Jarred

1. In the editor, select `ensureCompanySheet` and Run. Approve the spreadsheet permission. The sheet is created in this Google account. Copy is not required. The script saves the spreadsheet id.
2. Select `installSundayTrigger` and Run. Approve the trigger permission. This schedules `sendWeeklyReports` for Sunday around 8:00 America/Chicago. Google can start weekly triggers a little late. The subject line is `Robinson Electrical Weekly Timecards YYYY-MM-DD to YYYY-MM-DD`.
3. Select the function `addJarred` and Run. The execution log shows Jarred's token once. Copy it into a password note and give it to Jarred. The script stores only a hash. For Joe's own phone, select `addEmployee` and run it from the editor after setting the name, or add another small function the same way as `addJarred`. Do not paste the token into git.
4. To revoke someone, run `revokeEmployeeToken("emp_...")` using the id from `listEmployees`. `listEmployees` does not show tokens.

## 5. Microsoft app for Job Photos

Employees never sign in to Microsoft. This registration is for Joe, once.

1. Open https://entra.microsoft.com or https://portal.azure.com with the personal Microsoft account that owns the Job Photos folder.
2. App registrations, New registration. Supported account types: personal Microsoft accounts.
3. Redirect URI, platform Web: `https://script.google.com/macros/d/SCRIPT_ID/usercallback`. SCRIPT_ID is the Apps Script project id from Project Settings, not the web app deployment id.
4. Certificates and secrets, New client secret. Put the client id and secret in the Script Properties from step 2. Do not commit them.
5. API permissions, Microsoft Graph, delegated `Files.ReadWrite` and `offline_access`. Grant admin consent if the portal offers it.
6. A personal Microsoft account cannot limit `Files.ReadWrite` to one folder in the portal. The script still refuses every path that is not under `Job Photos`, and it refuses delete and rename. That path check is the guard.
7. Open `WEB_APP_URL?adminKey=YOUR_ADMIN_KEY` while signed in to the company Google account. Choose "Authorize Microsoft once" and sign in as the Microsoft account that owns Job Photos.
8. The page should say Microsoft connected. The refresh token is stored by the OAuth2 library in Script Properties.

## 6. Phones

On each phone, open Robinson Electrical, Timecards, Server. Paste the `/exec` URL and that person's token. Save. The page should say the server answered. Until this is saved, time, material copies, and photos stay on the phone.

Confirming a day sends only confirmed intervals. The phone still keeps the day if the server is down. Sending a material list still opens the existing email share, and also stores a copy without the $100/$85 fields when the server is configured.

Job photos stay "not connected" until step 5 is finished. After that, any employee token can browse Job Photos. Timecards and material lists stay limited to the employee whose token was used.

## 7. Smoke test

Replace the URL and token. Do not paste a real token into a ticket or into git.

```bash
curl -s -X POST "https://script.google.com/macros/s/DEPLOYMENT_ID/exec?path=/api/health" \
  -H "content-type: text/plain;charset=utf-8" \
  -d '{"path":"/api/health"}'
```

Expect `"ok": true` and `"photos": false` before Microsoft is authorized, then `"photos": true` after.

```bash
curl -s -X POST "https://script.google.com/macros/s/DEPLOYMENT_ID/exec?path=/api/timecards" \
  -H "content-type: text/plain;charset=utf-8" \
  -d '{"path":"/api/timecards","token":"TOKEN_FROM_addEmployee"}'
```

Expect `"entries": []` the first time. A second person's token must not return the first person's rows.

A path such as `Accounting` or `Job Photos/../Accounting` must come back as an error and must not create a file.

## 8. Bid scopes

See `backend/SCOPE.md`. To load a price-free task list, post to `/api/scope/upsert` with the admin key. The proposal text may still contain prices; the script removes them before saving. Redeploy the web app after replacing `Logic.js` and `Code.js`. The first geocode may ask you to approve the script again. No new OAuth scope was added. Maps uses the external-request scope already in `appsscript.json`.

The phone posts JSON with header `content-type: text/plain;charset=utf-8`. Apps Script still reads `e.postData.contents`. A JSON content type makes the phone send a CORS preflight, which the web app does not answer.

## 9. Holiday logo

Script property `THEME_OVERRIDE` is optional. Leave it blank or set `auto` and the phone picks the mark from the Chicago date. Set `off` for the plain logo. Set one theme name to force it without a new app build: `new-year`, `mlk`, `valentines`, `presidents`, `st-patricks`, `easter`, `memorial-day`, `juneteenth`, `july-4`, `labor-day`, `peoples-day`, `halloween`, `veterans`, `thanksgiving`, `christmas`.

`GET /api/theme` and `/api/health` return that value and nothing else from Script Properties. Health does not require an employee token. An unknown name is treated as `auto`. No new OAuth scope.
