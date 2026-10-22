# Customer portal API

Mount `/api/portal` before staff JWT authentication. Customer cookies must never
authorize staff API routes. The router handles its own authentication and 404s.

## Deployment

Deploy the updated backend and restart the actual process targeted by the domain
reverse proxy. Merely rebuilding the frontend cannot register backend endpoints.
For `https://netbill.skynetwifi.site`, configure:

```dotenv
NODE_ENV=production
PORTAL_ORIGIN=https://netbill.skynetwifi.site
```

Use HTTPS. Preserve the cookie and request headers through the proxy. Set
`TRUST_PROXY=1` only when the backend is behind exactly one trusted proxy and
cannot be reached directly by untrusted clients. Do not disable CSRF or staff
authentication to work around routing errors.

GET `/api/portal/me` without a cookie must return 401 with code
`PORTAL_SESSION_REQUIRED` and response header `X-NetBill-Portal: 1`.
If it returns `Tidak terautentikasi`, the domain still targets an old or different
backend. Check the process, port and reverse-proxy target before retrying login.

## Contract

All requests use same-origin cookies. Writes require `X-Portal-CSRF: 1`.
`X-Portal-Request: 1` remains accepted for older clients. When Origin is supplied,
it must match PORTAL_ORIGIN (or the request origin when unconfigured).

- POST `/login`: `{ "phone": "08..." }`. Returns name, masked phone and a
  `customer` object; sets a 24-hour HttpOnly customer cookie. Duplicate numbers
  are rejected for support resolution; account selection is not implemented.
- GET `/me`: returns name, code, masked phone and the same fields in `customer`.
  No customer ID from the browser is used to select the account.
- GET `/dashboard`: session-scoped profile, package and latest invoice dates.
  Missing values are null. Announcements are not integrated:
  `announcements: []`, `announcements_available: false`.
- POST `/logout`: invalidates the server session and clears the cookie;
  succeeds even when already logged out.
- `/ont`, `/announcements`, `/select`: authenticated requests return 501 with
  `PORTAL_FEATURE_UNAVAILABLE`. They do not fall through to staff auth.

Sessions and throttling are in memory: a restart logs customers out, and multiple
workers require a shared session/rate-limit store before deployment. Phone-only
login does not prove ownership. Login events mask numbers. No ONT changes are
authorized by this implementation.

Run regression checks with `npm test` from the server directory.