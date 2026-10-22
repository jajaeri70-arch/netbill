# ONT sync: backend contract and 502 recovery

## Scope and cause

`POST /api/mobile/v1/ont/:id/sync` and `POST /api/devices/:id/sync`
share the same handler and `devices.edit` authorization. Mobile additionally
requires its existing API key and JWT. The ID is the local device ID, not the
GenieACS ID. Bulk `/ont/sync` is a separate inventory reconciliation operation.

The former handler could spend 60 seconds submitting a task, 45 seconds polling,
then up to six minutes waiting for periodic inform (plus reads/ping). A proxy or
client could time out while the task continued. A screenshot of HTTP 502 does not
prove whether the proxy, Netbill, or GenieACS produced it; correlate logs first.

The handler now submits once with a 1,000 ms NBI task wait and a 10,000 ms HTTP
deadline, without periodic-inform polling. A queued response does not mean ONT
failure, and a new inform alone does not prove this particular task completed.

## Response contract (both routes)

| HTTP | command_status | Meaning / client action |
| --- | --- | --- |
| 200 | completed | NBI confirmed task completion and local data was refreshed. |
| 202 | queued | NBI accepted a task; wait for inform and refresh detail, do not resubmit. |
| 502 | unknown | Submission response failed or was invalid; task may exist. No automatic retry. |
| 502 | completed | Task finished, but readback/local persistence failed. Refresh reads, not POST. |
| 500 | not_submitted | Local lookup failed before submission; inspect backend/database. |

Validation/not-found responses remain 400/404. Existing `ok`, `responded`, and
`message` fields remain. New fields: `command_status`, `task_id` (nullable),
`retry_safe: false`. Error codes are `ONT_SYNC_STATUS_UNKNOWN`,
`ONT_SYNC_READBACK_FAILED`, and `ONT_SYNC_FAILED`. `responded` means task completion
was confirmed, not simply that submission succeeded. Do not show success based
only on a 2xx response or `ok: true`.

Example queued response:

```json
{
  "ok": true,
  "responded": false,
  "command_status": "queued",
  "task_id": "genieacs-task-id",
  "retry_safe": false,
  "last_inform": null,
  "message": "Perintah sinkron diterima dan antre di GenieACS. Segarkan detail ONT setelah inform berikutnya; jangan kirim ulang."
}
```

Use `GET /api/mobile/v1/ont/:id/detail` (web: `/api/devices/:id/detail`) to read
GenieACS data without another command. Queued tasks do not update local `last_sync`.
The history endpoint contains telemetry, **not** a task ledger; it cannot establish
command completion. There is no new background worker, task-status endpoint, or
idempotency guarantee in this change. Repeating POST creates another task.

## Operational recovery

1. Record request time, route, local ID, HTTP response body and `task_id`. Never
   include API keys, JWTs, Basic auth, or WiFi credentials in incident reports.
2. Compare proxy access/error logs with Netbill `devices.summon` /
   `devices.summon.failed` activity. A proxy HTML 502 has no Netbill JSON contract;
   clients must treat it and network timeouts as unknown, without automatic retry.
3. Verify GenieACS is enabled and its configured host, NBI port (normally 7557),
   credentials, TLS certificate, DNS and firewall from the backend host. NBI is
   not the GenieACS UI or CWMP port. Keep NBI private; do not disable TLS verification.
4. In GenieACS inspect the mapped device, pending task ID, faults, last inform,
   CWMP logs and connection-request reachability. Task disappearance alone is not
   proof of success. Offline ONTs can process queued tasks on their next inform.
5. If task completion was confirmed but readback failed, check database connectivity
   and repeat GET/detail. Do not resubmit the task to repair persistence.
6. Check all proxy/load-balancer/client timeouts. Allow time for the 10-second
   submission deadline, a possible 10-second detail read and database/audit work;
   60 seconds is a reasonable initial proxy budget, not an end-to-end guarantee.
   Fix unavailable upstreams rather than extending waits to several minutes.

Deploy the backend and web client together. External mobile clients must adopt
the 202/unknown behavior above. Verify first on a test ONT: online completion,
offline queue, unavailable NBI, and failed readback. Do not issue production
commands solely to test an incident. Run `npm test` from the server directory.