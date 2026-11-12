# Job photos

Photos stay in Joe's existing OneDrive, in a top-level folder named Job Photos.
That folder is separate from Accounting. The app does not create the folder and
does not store a Microsoft token.

```
Job Photos / Contractor / Job address / Rough-In | Trim | Finished / file
```

The phone offers BluSky, Scout Roe Construction, Horn Restoration, and Other.
The server can list additional contractor folders that already exist under Job Photos.

Employees do not sign in to Microsoft. They sign in to this app. The phone
calls only the private backend. Joe signs in to Microsoft once, on that
server, and the refresh token stays there.

Until that server is configured, the phone shows Not connected. It does not
list photos, and Upload does not report success. Pictures picked on the phone
remain saved on the phone.

Employees can browse and view photos, and upload new ones. They cannot delete
or rename. The server rejects DELETE and PATCH. It also rejects any path that
is not inside Job Photos, including Accounting and `..`.

## Routes

All routes require the employee's own app token. A missing token is 401.
If Joe's Microsoft connection is not configured, every route returns 503 and
an empty list. Responses never include the refresh token.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/job-photos/contractors` | Contractor folders |
| GET | `/api/job-photos/contractors/:contractor/jobs` | Job-address folders |
| GET | `/api/job-photos/contractors/:contractor/jobs/:job/stages/:stage/photos` | Photos and thumbnail ids |
| GET | `/api/job-photos/photos/:photoId?size=thumb` or `size=full` | One thumbnail or the full picture |
| POST | `/api/job-photos/contractors/:contractor/jobs/:job/stages/:stage` | Upload. The server assigns the file name |

The file name is `Job address - Stage - date - id.jpg`. The date comes from
the camera clock only when the file has one. Otherwise it is the day the
photo was added. The id avoids two photos getting the same name.

The POST body is the picture plus contractor, job address, stage, date, and
id. A client-supplied path or file name is not used as the storage location.

## Joe's one-time Microsoft sign-in

1. In Azure, register an app that can use delegated Microsoft Graph on Joe's account.
   Prefer a permission that can be limited to the Job Photos folder or to a
   SharePoint site that contains only that folder. Do not grant access to the
   whole drive if a narrower choice is available.
2. Sign in once as Joe and store the refresh token in the server's secret
   store. Do not put it in this repo, the phone app, or GitHub.
3. The server must check every path with the same rule as `js/photo-paths.js`:
   the first folder is Job Photos, then a contractor, a job address, and
   Rough-In, Trim, or Finished. Reject Accounting and any `..` segment.
4. Set the server's photo connection to configured only after that token works.
   Leave it unset until then. The phone has no switch that turns this on.
