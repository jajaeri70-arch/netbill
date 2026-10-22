# Product Requirements Document: NetBill Wi-Fi Customer Portal

**Status:** Draft for review  
**Version:** 1.0  
**Date:** 2026-10-14  
**Product:** Customer-facing portal within NetBill

## 1. Overview

Build a mobile-friendly Wi-Fi customer portal as part of the existing NetBill web application. A customer signs in using the mobile phone number registered in NetBill, views their own customer name and subscribed package, sees traffic information and total traffic, and can perform approved ONT settings through the ACS portal integration. NetBill remains the source of truth for customer identity and package assignment; the ACS remains the system of record for device state and supported device operations.

This document specifies the intended behavior, not existing implementation details. Existing NetBill models, authentication, traffic collectors, ACS API capabilities, and deployment topology must be verified before implementation.

## 2. Goals and success measures

| Goal | Acceptance measure |
| --- | --- |
| Customers can securely access their own information | A customer with a verified registered mobile number can sign in; an unverified number cannot access customer data. Cross-customer access tests pass. |
| Customers understand their subscription | Customer name, package name, service status, and available package attributes match NetBill records. |
| Customers understand usage | Current traffic and period total are labelled with units, time range, source, and last update; totals can be reconciled against the chosen source. |
| Customers can safely manage their own ONT | Only explicitly approved ACS operations are available for ONTs linked to the signed-in customer; every change has an auditable outcome. |
| Portal works inside NetBill | Customer and staff routes/roles coexist without exposing staff functions to customers; no duplicate customer master data is created. |

Usage/adoption and availability targets require product-owner approval before release; the proposed performance target and release gates appear in section 10.

## 3. Users, scope, and exclusions

**Primary user:** a residential or business subscriber whose active service, mobile number, and ONT association are recorded in NetBill. **Secondary users:** support agents who resolve identity, phone-number, usage, or device-linkage issues through existing authorized NetBill workflows. A customer can have multiple services/ONTs; the UI must make the selected service explicit.

**MVP in scope:** phone-number-based login with ownership verification; customer/service and package summary; current traffic and period total; read-only ONT status and a restricted, configurable set of ACS-backed settings; responsive layout; session management; audit events and supportable error states.

**Out of scope for MVP:** public registration, changing a NetBill customer record from the portal, billing/payment flows, arbitrary ACS command execution, firmware upgrades, factory reset, WAN/PPPoE credentials, administrator password changes, and third-party customer accounts. Adding these requires separate approval and security review.

## 4. Source of truth and key definitions

| Data | Authority | Required interpretation |
| --- | --- | --- |
| Customer name, registered phone, service and package | NetBill | Resolve through a server-side customer/service association, never through a client-supplied customer ID. |
| ONT identity and customer linkage | NetBill service-to-ONT mapping, validated against ACS device identifier | An ONT is manageable only if linked to the signed-in customer's selected service and found in ACS. |
| ONT status and settings | ACS portal/API | Show supported fields and their observation time; distinguish requested, pending, succeeded, and failed changes. |
| Traffic and total traffic | Existing NetBill traffic source or an approved collector | Define whether counters are for a service, session, or ONT. Do not sum unrelated sources or silently equate speed with transferred data. |

**Current traffic** means the most recent available upload/download rate (e.g., Mbps), if the source supplies rate data. If only byte counters are available, show recent transfer over a stated interval instead, not a fabricated live rate. **Total traffic** means upload bytes plus download bytes consumed by the selected service over the displayed period, with separate upload and download amounts. Default period: current calendar month in the configured business timezone; show the period start/end, unit conversion, and `last_updated_at`. Counter resets, missing samples, or unlinked sources must result in an explicit unavailable/partial state, not a misleading zero. The traffic source, refresh interval, retention, and whether package quota exists are discovery decisions, not assumed capabilities.

## 5. Core journeys and functional requirements

### 5.1 Phone-number login

- **AUTH-01:** Customer enters the phone number already stored in NetBill. Normalize supported local/international formats consistently and match only verified, uniquely attributable records. Mask the number when displayed.
- **AUTH-02:** A matching number alone is not proof of ownership. Send a one-time code to that number through an approved SMS/WhatsApp provider; create a customer session only after successful code verification. If an existing NetBill customer-auth method is already approved, it may replace this flow only with equivalent ownership verification and security review.
- **AUTH-03:** OTP is single-use, expires after 5 minutes, is limited to 5 verification attempts, and can be resent no sooner than 60 seconds; rate-limit requests by number and source IP. These defaults are configurable and subject to security review. Do not log OTP values. Show a generic response for unknown, duplicate, and valid numbers to limit enumeration.
- **AUTH-04:** If the phone maps to more than one customer account, block access until support resolves the association; if one customer has multiple authorized services, allow selecting among those services after login. A missing/unverified phone requires support-led remediation, not self-service reassignment.
- **AUTH-05:** Customer session is isolated from staff/admin privileges; logout invalidates the session. Enforce secure, HttpOnly, SameSite cookies, CSRF protection for state-changing requests, TLS, idle timeout, and server-side authorization on every portal endpoint.

### 5.2 Dashboard and package

- **DASH-01:** Show the signed-in customer's name and the selected service identifier in a privacy-aware format; never display another customer's data.
- **DASH-02:** Show package name and available attributes (e.g., advertised speed, quota if applicable, service status) only when present in NetBill. Do not infer a quota for unlimited packages. If a field is missing, display “Unavailable” instead of a guessed value.
- **DASH-03:** If multiple services exist, switching services refreshes package, traffic, and ONT data together. Backend access must revalidate ownership after every switch.

### 5.3 Traffic information

- **TRF-01:** Display upload/download current rates if available, including units, observation timestamp, and freshness indicator; otherwise show a labelled recent interval or an unavailable state.
- **TRF-02:** Display upload, download, and combined total traffic for the selected period, defaulting to the current calendar month. All three values use the same service, period boundary, source, and unit rules.
- **TRF-03:** Support an explicit manual refresh and protect the data source through server-side caching/rate limiting. Stale, delayed, absent, or partial data must be marked as such, while the rest of the dashboard remains usable.
- **TRF-04:** Document and test how cumulative counters, session resets, duplicate samples, and timezone boundaries are handled by the selected traffic integration before the chart/total is released.

### 5.4 ONT and ACS

- **ONT-01:** Show the selected service's linked ONT, connection state, model/serial masked where appropriate, and last ACS contact time where available. No link or offline status must be explained without offering an unsafe fallback.
- **ONT-02:** MVP write operations are limited to ACS-supported customer-safe Wi-Fi SSID and Wi-Fi password changes, **only if** the customer's ONT model, ACS API, and operator policy support them. Unsupported devices are read-only. Do not display existing Wi-Fi passwords.
- **ONT-03:** Before a write, validate ownership of the service and ONT on the server, validate inputs (SSID/password against device/operator constraints), show a confirmation, and use step-up verification if the security review requires it. Send commands from the NetBill server to ACS using server-held credentials; never expose ACS credentials or direct ACS access to the browser.
- **ONT-04:** Show operation state as submitted, pending, successful, failed, or timed out based on ACS confirmation. Do not claim success when a command has merely been queued. Prevent duplicate submissions, record actor/service/device/action/timestamp/outcome (never the plaintext password), and provide actionable recovery guidance.
- **ONT-05:** Additional actions (e.g., reboot) are deferred until explicitly approved per device model and risk; no generic ACS parameter editor is permitted.

## 6. UX and states

Provide a responsive sign-in and OTP screen, service selector where needed, dashboard cards for customer/package and traffic, and an ONT panel with a separate settings form. Show loading, empty, stale, unsupported, offline, pending, validation error, and retry states. Use plain language and accessible form labels, focus management, keyboard operation, and sufficient contrast. Keep potentially disruptive Wi-Fi changes behind clear confirmation explaining that connectivity may briefly drop. Do not put secrets or full phone numbers in URLs, analytics, or error text.

## 7. Integration and authorization design

Use NetBill's existing application and customer/service IDs rather than a separate customer database or independent portal account. Introduce a customer role/scope distinct from staff privileges. The server resolves the customer from the verified session, then lists only associated services. Each service resolves its package from NetBill, traffic from the approved traffic source, and ONT mapping from NetBill plus ACS confirmation. NetBill mediates all ACS reads/writes via a narrowly scoped adapter; allowlist operations and fields per supported model. Store provider/ACS credentials in server-side secrets management. Record correlation IDs for integration requests without storing sensitive values. Expose only fields necessary for each view; never accept client-provided customer/device identifiers as authorization evidence.

Proposed logical flow: `Customer browser -> NetBill customer routes/session -> NetBill customer/service records -> traffic adapter and ACS adapter`. Exact endpoints, schema, and provider choices are intentionally unspecified until technical discovery confirms existing NetBill interfaces.

## 8. Acceptance scenarios

1. A customer with one verified, unique NetBill phone number completes OTP and sees only their own name, package, traffic, and linked ONT.
2. An unknown or duplicate phone number receives no customer data; ambiguous mapping is referred to support without leaking account existence in the public response.
3. A customer with two services switches between them; package, traffic, and ONT all change consistently, and direct requests for a third party's service/ONT return an authorization error.
4. Current traffic without a usable rate source is labelled unavailable or displayed as a clearly labelled interval; monthly total still displays only when supported by reliable usage data.
5. Missing, stale, or reset traffic data is not rendered as zero and includes an understandable state and observation time.
6. A supported ONT accepts a valid SSID/password request, records an audit event, and shows pending until ACS confirms success or failure. Unsupported or unlinked ONTs have no write controls.
7. ACS timeout, offline ONT, invalid input, and duplicate click do not produce a false success, leak secrets, or affect another device.
8. Staff/admin endpoints remain inaccessible to customer sessions, including through manually constructed URLs and API calls.

## 9. Delivery phases and dependencies

1. **Discovery/design:** map NetBill customer/phone/service/package records; determine duplicate-number policy; confirm existing auth/session facilities, traffic source/counter semantics, ACS API/device mapping, supported Wi-Fi parameters, SMS/WhatsApp provider, timezone, and support escalation process. Approve security and privacy design.
2. **MVP build:** customer routes/role, verified phone login, dashboard and service selection, traffic adapter, read-only ONT panel, approved model-specific Wi-Fi controls, audit logs, monitoring, and responsive UI.
3. **Verification/release:** run authorization and OTP abuse tests; reconcile traffic with source samples across month boundaries and counter resets; test supported/unsupported ONT models, queued changes and failures; run accessibility/mobile checks and a limited pilot before broader rollout.

## 10. Non-functional requirements and release gates

- **Security/privacy:** TLS, least privilege, session and CSRF protection, OTP throttling, audit logging, server-only integration secrets, retention/access controls for phone and usage data, and a threat-model review. Define retention periods under the operator's privacy policy.
- **Reliability:** dashboard remains readable if traffic or ACS is down; unavailable components are identified without returning another customer's cached data. Retry device writes only when idempotency and device state are understood.
- **Performance target (to validate in pilot):** 95% of dashboard requests complete within 3 seconds excluding delayed external provider responses; asynchronous ACS commands show an acknowledgement quickly rather than holding an HTTP request open. Monitor OTP delivery/verification, traffic freshness, ACS error rate, and authorization denials.
- **Accessibility/compatibility:** mobile-first layout and keyboard-accessible controls on current supported browsers; confirm concrete browser/version and accessibility standard with the product owner.
- **Release gate:** no public launch without verified phone ownership, per-service/ONT authorization tests, documented traffic semantics, approved ACS allowlist, and support runbooks for login, stale usage, and failed ONT actions.

## 11. Open decisions for product and engineering

1. Which existing NetBill customer and phone fields are authoritative? Are numbers verified, unique, and associated with multiple accounts or services?
2. Is an OTP delivery provider already available and approved? What are its cost, delivery, retry, and failure policies?
3. Which collector supplies traffic, at what granularity and freshness, and is total usage measured per service, session, or ONT? What is the configured business timezone?
4. What is the exact NetBill-to-ACS ONT mapping, which ONT models and parameters are supported, and does ACS report completion rather than just command acceptance?
5. Which Wi-Fi settings are operator-approved for self-service, and is step-up verification required for writes?
6. What are the deployment URL, support contact, language/localization requirements, analytics policy, and approved retention periods?

Until these are answered, the portal must not present unsupported traffic as live or expose ONT write actions on unsupported devices.