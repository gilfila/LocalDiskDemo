# Parking Garage Registration & Commuter OTP — Design Spec

**Date:** 2026-04-10
**App:** localDisk (localdisk_nkzjqw)
**Status:** Approved

---

## Overview

A self-service Workday Extend application allowing workers to register their vehicle for a company parking garage. Registration routes to the worker's direct manager for approval. Workers who live more than 20 miles from the nearest office receive an annual $100 one-time payment (OTP) as a commuter benefit, triggered on the anniversary of their registration date. Managers have a dedicated page to review their team's registrations and issue ad-hoc OTPs.

---

## Pages (PMD Files)

### 1. `home.pmd` — Route: `/`

Worker status hub. Loads on app open for all users.

**Endpoints:**
- `getWorkerRegistration` — fetches the signed-in worker's CarRegistration record
- Workday Staffing API `/workers/me` — worker profile (name, title, location)

**Behaviour by registration state:**

| State | Display |
|---|---|
| No record | Worker profile card + "Register My Car" button |
| `status=pending` | Profile card + pending approval badge + car details summary |
| `status=approved` | Profile card + car details + distance/eligibility + last OTP date + OTP count |
| `status=denied` | Profile card + denied badge + denial reason + "Register Again" button |

**Manager detection:** If `currentUser` is a manager (has direct reports), show a "Manage My Team's Commuters" button linking to `/manage`.

---

### 2. `register-car.pmd` — Route: `/register`

Three-step wizard for vehicle registration. If the worker already has an active (pending or approved) registration, the page immediately redirects to `/` with an informational message.

**Step 1 — Car Details**

On page load, calls `getWorkerEligibility` asynchronously to pre-calculate distance and eligibility. Shows eligibility result as an informational banner (not blocking).

Fields:
- Make (text, required)
- Model (text, required)
- Year (numeric, required, 1980–current year+1)
- License Plate (text, required)
- State (select, 50 US states + DC, required)

**Step 2 — Review**

Read-only summary of entered car details plus:
- Distance to nearest office (miles, calculated from home address)
- Commuter benefit eligibility status (eligible / not eligible)
- Confirmation checkbox: "I confirm the details above are correct"

**Step 3 — Confirmation**

Shown after successful submission. Displays:
- "Your registration has been submitted for manager approval"
- Car details summary
- "Return to Home" button

**Orchestration called on submit:** `submitCarRegistration`

---

### 3. `manage-commuters.pmd` — Route: `/manage`

Manager-only page. Accessible only to workers who have direct reports. Access is enforced at page load (AMD routing does not support access control — the page itself checks for direct reports and shows an access-denied message if the check fails).

**Endpoint:** `getTeamRegistrations` — returns all CarRegistration records for direct reports.

**Table columns:**
- Worker Name
- Car (Year Make Model)
- License Plate / State
- Distance (miles)
- Eligibility (badge: Eligible / Not Eligible)
- Status (badge: Pending / Approved / Denied)
- Last OTP Date
- OTP Count
- Actions

**Actions per row:**
- Pending rows: Approve button, Deny button
- Approved rows: "Issue OTP" button (triggers ad-hoc OTP, disabled after click with confirmation toast)
- All rows: "View Details" link

---

## Custom Business Object — `CarRegistration`

Stored in Workday Extend custom data.

| Field | Type | Notes |
|---|---|---|
| `workerId` | Text | Workday worker ID — primary key |
| `make` | Text | |
| `model` | Text | |
| `year` | Numeric | |
| `licensePlate` | Text | |
| `plateState` | Text | 2-letter state code |
| `status` | Text | `pending` / `approved` / `denied` |
| `distanceMiles` | Numeric | Calculated at registration time |
| `isEligible` | Boolean | `distanceMiles > 20` |
| `registrationDate` | Date | Date of original submission |
| `approvedDate` | Date | Date manager approved |
| `denialReason` | Text | Optional reason entered by manager on deny |
| `lastOtpDate` | Date | Date of most recent OTP issued |
| `otpCount` | Numeric | Total OTPs issued to this worker |

One record per worker. Re-registration (after denial) overwrites the existing record.

---

## Script Modules

### `zipCodeCoordinates`

Lookup table mapping US zip codes to latitude/longitude. Used by `getWorkerEligibility` to geocode the worker's home address.

### `distanceCalculator`

Exports a `haversineDistance(lat1, lng1, lat2, lng2)` function returning distance in miles. Used by `getWorkerEligibility` to compute distance between worker home zip and each office location zip.

---

## Orchestrations

### `getWorkerEligibility`
**Trigger:** Page load on `register-car.pmd` (async)

Steps:
1. Call Workday Staffing API `/workers/me/homeContactInformation` to get home zip code
2. Call Workday Location API to fetch all locations with type = office
3. For each office, look up lat/lng from `zipCodeCoordinates` module
4. Look up worker home zip lat/lng from `zipCodeCoordinates` module
5. Call `distanceCalculator.haversineDistance` for each office, take minimum
6. Return `{ distanceMiles, isEligible: distanceMiles > 20 }`

---

### `submitCarRegistration`
**Trigger:** Worker submits Step 2 of registration wizard

Steps:
1. Validate no active registration exists for worker (status = pending or approved)
2. Create/overwrite `CarRegistration` record with submitted fields + distance/eligibility from pre-calculation
3. Set `status = pending`, `registrationDate = today`
4. Trigger "Car Registration Approval" business process on the worker's business object
5. Return success

---

### `getWorkerRegistration`
**Trigger:** Home page load

Steps:
1. Query `CarRegistration` by `workerId = currentUser.id`
2. Return record or null

---

### `getTeamRegistrations`
**Trigger:** `manage-commuters.pmd` page load

Steps:
1. Fetch manager's direct reports via Workday Staffing API
2. Query `CarRegistration` records where `workerId` in direct reports list
3. Return array of records with worker display names joined

---

### `issueOtp`
**Trigger:** `anniversaryOtpScheduler` (scheduled) or manager ad-hoc button

Input: `workerId`

Steps:
1. Fetch `CarRegistration` for worker — validate exists and status = approved
2. Trigger "Commuter OTP" business process for $100 on worker's business object
3. Update `lastOtpDate = today`, increment `otpCount`
4. Return success/failure

---

### `anniversaryOtpScheduler`
**Trigger:** Scheduled nightly at midnight UTC

Steps:
1. Query all `CarRegistration` records where `status = approved AND isEligible = true`
2. Filter records where `today == anniversary(registrationDate)` (month + day match)
3. For each matching record, call `issueOtp` orchestration
4. Log results (count issued, any failures)

---

## Business Processes

### Car Registration Approval BP
- **Trigger:** Called by `submitCarRegistration`
- **Step 1 — Approval:** Routes to worker's direct manager. Task shows car details, distance, eligibility.
- **On Approve:** Callback orchestration sets `status = approved`, `approvedDate = today`
- **On Deny:** Callback orchestration sets `status = denied`, stores optional `denialReason` from manager's task input

### Commuter OTP BP
- **Trigger:** Called by `issueOtp`
- Issues $100 one-time payment to worker
- Amount hardcoded to `100` for now — to be made configurable via app property in a future iteration

---

## AMD Updates (`localdisk_nkzjqw.amd`)

Add routes and data providers:

```json
{
  "dataProviders": [
    { "key": "workday-staffing", "value": "<% apiGatewayEndpoint + '/staffing/v1' %>" },
    { "key": "workday-core", "value": "<% apiGatewayEndpoint + '/core/v1' %>" }
  ],
  "tasks": [
    { "id": "home", "routingPattern": "/", "page": { "id": "home" } },
    { "id": "register-car", "routingPattern": "/register", "page": { "id": "register-car" } },
    { "id": "manage-commuters", "routingPattern": "/manage", "page": { "id": "manage-commuters" } }
  ]
}
```

---

## Constraints & Notes

- **One registration per worker** — a worker may not have more than one active (pending or approved) registration. Denied workers may re-register, which overwrites the existing record.
- **OTP eligibility** — only workers with `isEligible = true` (distance > 20 miles) receive the scheduled annual OTP. Managers may issue ad-hoc OTPs to any approved worker regardless of eligibility.
- **Distance calculation** — uses zip code centroid coordinates (not street-level geocoding). Accuracy is sufficient for the 20-mile threshold but may be refined in a future iteration with an external geocoding API.
- **OTP amount** — hardcoded to $100. Future iteration should expose this as a configurable app property.
- **Synchronous orchestration limit** — `getWorkerEligibility` is called asynchronously on page load to avoid the 25-second page timeout. The registration form is usable while the distance check loads.
- **Manager access control** — `manage-commuters.pmd` checks that the signed-in worker has at least one direct report. Workers without reports see a 403-style message if they navigate directly to `/manage`.
