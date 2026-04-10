# Parking Garage Registration & Commuter OTP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-service Workday Extend app for vehicle parking registration with manager approval, auto distance-based OTP eligibility, and annual/ad-hoc commuter payments.

**Architecture:** Three PMD pages (home, register-car wizard, manage-commuters) backed by six orchestrations that read/write a `CarRegistration` custom business object. Distance eligibility uses a Haversine script module against a zip code coordinate lookup. OTP payments run via Workday business processes, triggered both by a nightly scheduled orchestration and ad-hoc by managers.

**Tech Stack:** Workday Extend Local Disk, JSON (PMD/AMD/CBO/BP), JavaScript (.script modules), Workday REST APIs (Staffing v1, Common v1), Workday Custom Objects API, Workday Business Process framework.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `localdisk_nkzjqw/presentation/localdisk_nkzjqw.amd` | Modify | Add routes, data providers, page flows |
| `localdisk_nkzjqw/presentation/home.pmd` | Modify | Registration status hub, manager nav button |
| `localdisk_nkzjqw/presentation/register-step1.pmd` | Create | Car details form (wizard step 1) |
| `localdisk_nkzjqw/presentation/register-step2.pmd` | Create | Review + submit (wizard step 2) |
| `localdisk_nkzjqw/presentation/register-step3.pmd` | Create | Confirmation (wizard step 3) |
| `localdisk_nkzjqw/presentation/manage-commuters.pmd` | Create | Manager commuter table + OTP actions |
| `localdisk_nkzjqw/scripts/distanceCalculator.script` | Create | Haversine distance formula |
| `localdisk_nkzjqw/scripts/zipCodeCoordinates.script` | Create | US zip code → lat/lng lookup |
| `localdisk_nkzjqw/orchestrations/getWorkerRegistration.orchestration` | Create | Fetch worker's CarRegistration record |
| `localdisk_nkzjqw/orchestrations/getWorkerEligibility.orchestration` | Create | Distance check + eligibility flag |
| `localdisk_nkzjqw/orchestrations/submitCarRegistration.orchestration` | Create | Save registration + trigger approval BP |
| `localdisk_nkzjqw/orchestrations/updateRegistrationStatus.orchestration` | Create | BP callback for approve/deny |
| `localdisk_nkzjqw/orchestrations/getTeamRegistrations.orchestration` | Create | Fetch all direct reports' registrations |
| `localdisk_nkzjqw/orchestrations/issueOtp.orchestration` | Create | Issue $100 OTP payment |
| `localdisk_nkzjqw/orchestrations/anniversaryOtpScheduler.orchestration` | Create | Nightly anniversary OTP batch |
| `localdisk_nkzjqw/model/CarRegistration.cbo` | Create | Custom business object definition |
| `localdisk_nkzjqw/model/CarRegistrationApproval.bp` | Create | Manager approval business process |
| `localdisk_nkzjqw/model/CommuterOtp.bp` | Create | OTP payment business process |

---

## Task 1: Scaffold + AMD

**Files:**
- Modify: `localdisk_nkzjqw/presentation/localdisk_nkzjqw.amd`
- Create dirs: `localdisk_nkzjqw/scripts/`, `localdisk_nkzjqw/orchestrations/`, `localdisk_nkzjqw/model/`

- [ ] **Step 1: Create directories**

```bash
mkdir -p localdisk_nkzjqw/scripts
mkdir -p localdisk_nkzjqw/orchestrations
mkdir -p localdisk_nkzjqw/model
```

- [ ] **Step 2: Replace `localdisk_nkzjqw/presentation/localdisk_nkzjqw.amd`**

```json
{
  "appProperties": [],
  "dataProviders": [
    {
      "key": "workday-staffing",
      "value": "<% apiGatewayEndpoint + '/staffing/v1' %>"
    },
    {
      "key": "workday-common",
      "value": "<% apiGatewayEndpoint + '/common/v1' %>"
    },
    {
      "key": "workday-customObjects",
      "value": "<% apiGatewayEndpoint + '/customobjects/v1' %>"
    }
  ],
  "tasks": [
    {
      "id": "home",
      "routingPattern": "/",
      "page": { "id": "home" }
    },
    {
      "id": "register-step1",
      "page": { "id": "register-step1" }
    },
    {
      "id": "register-step2",
      "page": { "id": "register-step2" }
    },
    {
      "id": "register-step3",
      "page": { "id": "register-step3" }
    },
    {
      "id": "register-car",
      "routingPattern": "/register",
      "flow": { "id": "registerCarFlow" }
    },
    {
      "id": "manage-commuters",
      "routingPattern": "/manage",
      "page": { "id": "manage-commuters" }
    }
  ],
  "flowDefinitions": [
    {
      "id": "registerCarFlow",
      "flowSteps": [
        {
          "id": "carDetailsStep",
          "startsFlow": true,
          "taskId": "register-step1",
          "transitions": [
            { "order": "a", "value": "reviewStep", "condition": "true" }
          ]
        },
        {
          "id": "reviewStep",
          "taskId": "register-step2",
          "transitions": [
            { "order": "a", "value": "confirmStep", "condition": "true" }
          ]
        },
        {
          "id": "confirmStep",
          "endsFlow": true,
          "taskId": "register-step3"
        }
      ]
    }
  ],
  "applicationId": "localdisk_nkzjqw"
}
```

- [ ] **Step 3: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/presentation/localdisk_nkzjqw.amd','utf8')); console.log('AMD valid')"
```
Expected: `AMD valid`

- [ ] **Step 4: Commit**

```bash
git add localdisk_nkzjqw/presentation/localdisk_nkzjqw.amd
git commit -m "feat: scaffold directories and update AMD with new routes and page flow"
```

---

## Task 2: distanceCalculator Script Module

**Files:**
- Create: `localdisk_nkzjqw/scripts/distanceCalculator.script`

This is pure JS — test it with node before importing into Workday Studio.

- [ ] **Step 1: Create `localdisk_nkzjqw/scripts/distanceCalculator.script`**

```javascript
// distanceCalculator.script
// Haversine formula — returns distance in miles between two lat/lng points.

var EARTH_RADIUS_MILES = 3958.8;

var toRadians = function(degrees) {
  return degrees * (Math.PI / 180);
};

var haversineDistance = function(lat1, lng1, lat2, lng2) {
  var dLat = toRadians(lat2 - lat1);
  var dLng = toRadians(lng2 - lng1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
};

// Returns the minimum distance from point to any location in a list.
// locations: array of { lat, lng }
var minDistanceToLocations = function(homeLat, homeLng, locations) {
  var minDist = null;
  for (var i = 0; i < locations.length; i++) {
    var dist = haversineDistance(homeLat, homeLng, locations[i].lat, locations[i].lng);
    if (minDist === null || dist < minDist) {
      minDist = dist;
    }
  }
  return minDist;
};

{
  "haversineDistance": haversineDistance,
  "minDistanceToLocations": minDistanceToLocations,
  "toRadians": toRadians
}
```

- [ ] **Step 2: Write a quick node test to verify the math**

Create `localdisk_nkzjqw/scripts/distanceCalculator.test.js`:

```javascript
// Quick sanity test — run with: node distanceCalculator.test.js
// New York City to Los Angeles is ~2,445 miles
var EARTH_RADIUS_MILES = 3958.8;
var toRadians = function(d) { return d * Math.PI / 180; };
var haversineDistance = function(lat1, lng1, lat2, lng2) {
  var dLat = toRadians(lat2 - lat1);
  var dLng = toRadians(lng2 - lng1);
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
          Math.cos(toRadians(lat1))*Math.cos(toRadians(lat2))*
          Math.sin(dLng/2)*Math.sin(dLng/2);
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

var nyToLA = haversineDistance(40.7128, -74.0060, 34.0522, -118.2437);
console.assert(nyToLA > 2400 && nyToLA < 2500, "NYC to LA should be ~2445 miles, got: " + nyToLA);
console.log("NYC to LA: " + Math.round(nyToLA) + " miles — PASS");

// Short distance: two points 0.1 deg apart (~7 miles)
var short = haversineDistance(40.0, -74.0, 40.1, -74.0);
console.assert(short > 6 && short < 8, "Short distance test failed: " + short);
console.log("Short distance: " + short.toFixed(2) + " miles — PASS");

// 20-mile threshold test: office at 40.0, worker at 40.28 (~19.3 mi)
var near = haversineDistance(40.0, -74.0, 40.28, -74.0);
console.assert(near < 20, "Should be under 20 miles: " + near);
console.log("Near-threshold: " + near.toFixed(2) + " miles (< 20) — PASS");
```

- [ ] **Step 3: Run the test**

```bash
node localdisk_nkzjqw/scripts/distanceCalculator.test.js
```
Expected output (all three lines ending in `PASS`):
```
NYC to LA: 2445 miles — PASS
Short distance: 6.91 miles — PASS
Near-threshold: 19.30 miles (< 20) — PASS
```

- [ ] **Step 4: Commit**

```bash
git add localdisk_nkzjqw/scripts/distanceCalculator.script localdisk_nkzjqw/scripts/distanceCalculator.test.js
git commit -m "feat: add distanceCalculator script module with Haversine formula"
```

---

## Task 3: zipCodeCoordinates Script Module

**Files:**
- Create: `localdisk_nkzjqw/scripts/zipCodeCoordinates.script`

> **Note:** This file includes ~60 representative zip codes for development/testing. Before production, replace `ZIP_COORDS` with a full US zip code dataset (available from USPS/Census as CSV — ~40k entries). The structure and `getCoordsForZip` function remain identical.

- [ ] **Step 1: Create `localdisk_nkzjqw/scripts/zipCodeCoordinates.script`**

```javascript
// zipCodeCoordinates.script
// Maps US zip codes to { lat, lng } centroid coordinates.
// Dev dataset — replace ZIP_COORDS with full dataset before production.

var ZIP_COORDS = {
  // New York
  "10001": { "lat": 40.7484, "lng": -73.9967 },
  "10002": { "lat": 40.7157, "lng": -73.9863 },
  "10003": { "lat": 40.7317, "lng": -73.9892 },
  // Los Angeles
  "90001": { "lat": 33.9731, "lng": -118.2479 },
  "90210": { "lat": 34.0901, "lng": -118.4065 },
  "90024": { "lat": 34.0635, "lng": -118.4437 },
  // Chicago
  "60601": { "lat": 41.8827, "lng": -87.6233 },
  "60614": { "lat": 41.9244, "lng": -87.6530 },
  "60657": { "lat": 41.9401, "lng": -87.6531 },
  // San Francisco
  "94102": { "lat": 37.7792, "lng": -122.4191 },
  "94105": { "lat": 37.7897, "lng": -122.3942 },
  "94107": { "lat": 37.7648, "lng": -122.3984 },
  // Seattle
  "98101": { "lat": 47.6089, "lng": -122.3352 },
  "98103": { "lat": 47.6594, "lng": -122.3449 },
  // Austin
  "78701": { "lat": 30.2672, "lng": -97.7431 },
  "78702": { "lat": 30.2587, "lng": -97.7176 },
  // Boston
  "02101": { "lat": 42.3584, "lng": -71.0598 },
  "02115": { "lat": 42.3433, "lng": -71.0839 },
  // Denver
  "80201": { "lat": 39.7392, "lng": -104.9903 },
  "80203": { "lat": 39.7287, "lng": -104.9805 },
  // Atlanta
  "30301": { "lat": 33.7490, "lng": -84.3880 },
  "30303": { "lat": 33.7537, "lng": -84.3863 },
  // Miami
  "33101": { "lat": 25.7617, "lng": -80.1918 },
  "33130": { "lat": 25.7653, "lng": -80.2001 },
  // Dallas
  "75201": { "lat": 32.7767, "lng": -96.7970 },
  "75202": { "lat": 32.7775, "lng": -96.8019 },
  // Phoenix
  "85001": { "lat": 33.4484, "lng": -112.0740 },
  "85004": { "lat": 33.4500, "lng": -112.0670 },
  // Minneapolis
  "55401": { "lat": 44.9778, "lng": -93.2650 },
  "55414": { "lat": 44.9813, "lng": -93.2232 },
  // Portland
  "97201": { "lat": 45.5051, "lng": -122.6750 },
  "97203": { "lat": 45.5831, "lng": -122.7374 },
  // Washington DC
  "20001": { "lat": 38.9072, "lng": -77.0369 },
  "20002": { "lat": 38.8999, "lng": -76.9913 },
  // Houston
  "77001": { "lat": 29.7604, "lng": -95.3698 },
  "77002": { "lat": 29.7543, "lng": -95.3677 },
  // Philadelphia
  "19101": { "lat": 39.9526, "lng": -75.1652 },
  "19103": { "lat": 39.9533, "lng": -75.1756 },
  // San Diego
  "92101": { "lat": 32.7157, "lng": -117.1611 },
  "92103": { "lat": 32.7468, "lng": -117.1592 },
  // Detroit
  "48201": { "lat": 42.3314, "lng": -83.0458 },
  "48202": { "lat": 42.3706, "lng": -83.0708 },
  // Nashville
  "37201": { "lat": 36.1627, "lng": -86.7816 },
  "37203": { "lat": 36.1453, "lng": -86.7932 },
  // Charlotte
  "28201": { "lat": 35.2271, "lng": -80.8431 },
  "28203": { "lat": 35.2108, "lng": -80.8551 }
};

// Returns { lat, lng } for a zip code string, or null if not found.
var getCoordsForZip = function(zip) {
  if (!zip) { return null; }
  var clean = zip.toString().trim().substring(0, 5);
  return ZIP_COORDS[clean] || null;
};

{
  "getCoordsForZip": getCoordsForZip,
  "ZIP_COORDS": ZIP_COORDS
}
```

- [ ] **Step 2: Write node test**

Create `localdisk_nkzjqw/scripts/zipCodeCoordinates.test.js`:

```javascript
// node localdisk_nkzjqw/scripts/zipCodeCoordinates.test.js
var ZIP_COORDS = { "10001": { "lat": 40.7484, "lng": -73.9967 }, "90210": { "lat": 34.0901, "lng": -118.4065 } };
var getCoordsForZip = function(zip) {
  if (!zip) { return null; }
  return ZIP_COORDS[zip.toString().trim().substring(0,5)] || null;
};

var nyc = getCoordsForZip("10001");
console.assert(nyc && nyc.lat > 40 && nyc.lat < 41, "NYC lat wrong: " + JSON.stringify(nyc));
console.log("NYC lookup — PASS: " + JSON.stringify(nyc));

var missing = getCoordsForZip("99999");
console.assert(missing === null, "Unknown zip should return null");
console.log("Unknown zip returns null — PASS");

var padded = getCoordsForZip("10001-1234");
console.assert(padded && padded.lat > 40, "Should strip +4 suffix");
console.log("Strips +4 suffix — PASS");
```

- [ ] **Step 3: Run test**

```bash
node localdisk_nkzjqw/scripts/zipCodeCoordinates.test.js
```
Expected (all PASS):
```
NYC lookup — PASS: {"lat":40.7484,"lng":-73.9967}
Unknown zip returns null — PASS
Strips +4 suffix — PASS
```

- [ ] **Step 4: Commit**

```bash
git add localdisk_nkzjqw/scripts/zipCodeCoordinates.script localdisk_nkzjqw/scripts/zipCodeCoordinates.test.js
git commit -m "feat: add zipCodeCoordinates script module with dev dataset"
```

---

## Task 4: CarRegistration Custom Business Object

**Files:**
- Create: `localdisk_nkzjqw/model/CarRegistration.cbo`

> **Workday Studio step:** After writing this file, open Workday Studio → your app → Business Objects → Add Business Object. Use the JSON below as the reference for field names and types. The `.cbo` file here documents the definition for version control.

- [ ] **Step 1: Create `localdisk_nkzjqw/model/CarRegistration.cbo`**

```json
{
  "id": "CarRegistration",
  "name": "CarRegistration",
  "label": "Car Registration",
  "description": "Stores a worker's parking garage car registration and commuter OTP eligibility",
  "fields": [
    { "id": "workerId",        "label": "Worker ID",          "type": "string",  "required": true },
    { "id": "make",            "label": "Make",               "type": "string",  "required": true },
    { "id": "model",           "label": "Model",              "type": "string",  "required": true },
    { "id": "year",            "label": "Year",               "type": "numeric", "required": true },
    { "id": "licensePlate",    "label": "License Plate",      "type": "string",  "required": true },
    { "id": "plateState",      "label": "Plate State",        "type": "string",  "required": true },
    { "id": "status",          "label": "Status",             "type": "string",  "required": true,
      "note": "Values: pending | approved | denied" },
    { "id": "distanceMiles",   "label": "Distance Miles",     "type": "numeric" },
    { "id": "isEligible",      "label": "Is Eligible",        "type": "boolean" },
    { "id": "registrationDate","label": "Registration Date",  "type": "date" },
    { "id": "approvedDate",    "label": "Approved Date",      "type": "date" },
    { "id": "denialReason",    "label": "Denial Reason",      "type": "string" },
    { "id": "lastOtpDate",     "label": "Last OTP Date",      "type": "date" },
    { "id": "otpCount",        "label": "OTP Count",          "type": "numeric" }
  ]
}
```

- [ ] **Step 2: Verify JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/model/CarRegistration.cbo','utf8')); console.log('CBO valid')"
```
Expected: `CBO valid`

- [ ] **Step 3: Create the CBO in Workday Studio**

In Workday Studio: App → Business Objects → + → name it `CarRegistration` → add each field from the JSON above with matching types. Save and publish the app version.

- [ ] **Step 4: Note the CBO Definition ID**

After creating in Studio, the CBO will have a system-assigned `definitionId` (a GUID or slug). You will need this in orchestration steps. Record it here: `_________________________`

(It is typically the same as the `id` field: `CarRegistration`)

- [ ] **Step 5: Commit**

```bash
git add localdisk_nkzjqw/model/CarRegistration.cbo
git commit -m "feat: add CarRegistration CBO definition"
```

---

## Task 5: Business Process Definitions

**Files:**
- Create: `localdisk_nkzjqw/model/CarRegistrationApproval.bp`
- Create: `localdisk_nkzjqw/model/CommuterOtp.bp`

> **Workday Studio step:** These JSON files document the BP configurations. Create both BPs in Workday Studio → App → Business Processes.

- [ ] **Step 1: Create `localdisk_nkzjqw/model/CarRegistrationApproval.bp`**

```json
{
  "id": "CarRegistrationApproval",
  "name": "CarRegistrationApproval",
  "label": "Car Registration Approval",
  "description": "Routes a worker's car registration to their direct manager for approval or denial",
  "targetBusinessObject": "Worker",
  "allowsCancel": false,
  "allowsRescind": false,
  "approvalStep": {
    "routesTo": "direct_manager",
    "actions": ["APPROVE", "DENY"],
    "taskLabel": "Review Car Registration",
    "pageRoute": "/manage"
  },
  "onApprove": {
    "orchestration": "updateRegistrationStatus",
    "payload": { "status": "approved" }
  },
  "onDeny": {
    "orchestration": "updateRegistrationStatus",
    "payload": { "status": "denied" }
  }
}
```

- [ ] **Step 2: Create `localdisk_nkzjqw/model/CommuterOtp.bp`**

```json
{
  "id": "CommuterOtp",
  "name": "CommuterOtp",
  "label": "Commuter OTP",
  "description": "Issues a $100 one-time payment to an eligible worker as a commuter benefit",
  "targetBusinessObject": "Worker",
  "paymentStep": {
    "amount": 100,
    "currency": "USD",
    "paymentType": "OneTimePayment",
    "note": "Annual commuter benefit — parking distance offset"
  }
}
```

- [ ] **Step 3: Verify both JSON files**

```bash
node -e "JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/model/CarRegistrationApproval.bp','utf8')); JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/model/CommuterOtp.bp','utf8')); console.log('BPs valid')"
```
Expected: `BPs valid`

- [ ] **Step 4: Create both BPs in Workday Studio**

In Workday Studio: App → Business Processes → + for each BP.
- `CarRegistrationApproval`: type = Custom BP, target object = Worker, add an Approval step routing to direct manager.
- `CommuterOtp`: type = One-Time Payment BP, amount = $100 USD.

After creation, note the BP names exactly as they appear in Studio — they are referenced by name in orchestration steps.

- [ ] **Step 5: Commit**

```bash
git add localdisk_nkzjqw/model/CarRegistrationApproval.bp localdisk_nkzjqw/model/CommuterOtp.bp
git commit -m "feat: add business process definitions for approval and OTP"
```

---

## Task 6: getWorkerRegistration Orchestration

**Files:**
- Create: `localdisk_nkzjqw/orchestrations/getWorkerRegistration.orchestration`

> Synchronous orchestration. Called on `home.pmd` page load (non-deferred). Returns the CarRegistration record for the signed-in worker, or null.

- [ ] **Step 1: Create `localdisk_nkzjqw/orchestrations/getWorkerRegistration.orchestration`**

```json
{
  "id": "getWorkerRegistration",
  "name": "getWorkerRegistration",
  "label": "Get Worker Registration",
  "description": "Returns the CarRegistration record for the signed-in worker. Returns null if no record exists.",
  "type": "synchronous",
  "steps": [
    {
      "id": "fetchRegistration",
      "name": "Fetch Registration",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "fetchRegistration",
        "method": "GET",
        "baseUrlType": "workday-customObjects",
        "url": "<% 'customObjectDefinitions/CarRegistration/instances?workerId=' + input.workerId %>",
        "authType": "sso"
      }
    },
    {
      "id": "buildResponse",
      "name": "Build Response",
      "type": "Create Values",
      "properties": {
        "referenceName": "buildResponse",
        "values": {
          "registration": "<% steps.fetchRegistration.responseData.data.length > 0 ? steps.fetchRegistration.responseData.data[0] : null %>",
          "hasRegistration": "<% steps.fetchRegistration.responseData.data.length > 0 %>"
        }
      }
    }
  ],
  "inboundFields": [
    { "id": "workerId", "label": "Worker ID", "type": "string", "required": true }
  ],
  "outboundFields": [
    { "id": "registration", "label": "Registration Record", "type": "object" },
    { "id": "hasRegistration", "label": "Has Registration", "type": "boolean" }
  ]
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/orchestrations/getWorkerRegistration.orchestration','utf8')); console.log('valid')"
```

- [ ] **Step 3: Import into Workday Studio**

Workday Studio → App → Orchestrations → + → import or recreate the steps above. Name it exactly `getWorkerRegistration`. Publish.

- [ ] **Step 4: Commit**

```bash
git add localdisk_nkzjqw/orchestrations/getWorkerRegistration.orchestration
git commit -m "feat: add getWorkerRegistration orchestration"
```

---

## Task 7: getWorkerEligibility Orchestration

**Files:**
- Create: `localdisk_nkzjqw/orchestrations/getWorkerEligibility.orchestration`

> Asynchronous orchestration. Called on `register-step1.pmd` load. Fetches home address, gets office locations, runs Haversine distance check, returns `{ distanceMiles, isEligible }`.

- [ ] **Step 1: Create `localdisk_nkzjqw/orchestrations/getWorkerEligibility.orchestration`**

```json
{
  "id": "getWorkerEligibility",
  "name": "getWorkerEligibility",
  "label": "Get Worker Eligibility",
  "description": "Calculates the worker's distance to the nearest office and returns eligibility for the commuter OTP benefit (> 20 miles = eligible).",
  "type": "synchronous",
  "include": ["distanceCalculator.script", "zipCodeCoordinates.script"],
  "steps": [
    {
      "id": "getHomeAddress",
      "name": "Get Home Address",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "getHomeAddress",
        "method": "GET",
        "baseUrlType": "workday-staffing",
        "url": "<% 'workers/' + input.workerId + '/homeContactInformation' %>",
        "authType": "sso"
      }
    },
    {
      "id": "getOfficeLocations",
      "name": "Get Office Locations",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "getOfficeLocations",
        "method": "GET",
        "baseUrlType": "workday-common",
        "url": "locations?type=Office&limit=50",
        "authType": "sso"
      }
    },
    {
      "id": "calculateDistance",
      "name": "Calculate Distance",
      "type": "Create Values",
      "properties": {
        "referenceName": "calculateDistance",
        "values": {
          "homeZip": "<% steps.getHomeAddress.responseData.data[0].postalCode %>",
          "homeCoords": "<% zipCodeCoordinates.getCoordsForZip(steps.getHomeAddress.responseData.data[0].postalCode) %>",
          "officeCoords": "<% steps.getOfficeLocations.responseData.data.map(function(loc) { return zipCodeCoordinates.getCoordsForZip(loc.postalCode); }).filter(function(c) { return c !== null; }) %>",
          "distanceMiles": "<% steps.calculateDistance.homeCoords !== null && steps.calculateDistance.officeCoords.length > 0 ? distanceCalculator.minDistanceToLocations(steps.calculateDistance.homeCoords.lat, steps.calculateDistance.homeCoords.lng, steps.calculateDistance.officeCoords) : -1 %>",
          "isEligible": "<% steps.calculateDistance.distanceMiles > 20 %>",
          "zipFound": "<% steps.calculateDistance.homeCoords !== null %>"
        }
      }
    }
  ],
  "inboundFields": [
    { "id": "workerId", "label": "Worker ID", "type": "string", "required": true }
  ],
  "outboundFields": [
    { "id": "distanceMiles", "label": "Distance in Miles", "type": "numeric" },
    { "id": "isEligible", "label": "Is Eligible (>20 mi)", "type": "boolean" },
    { "id": "homeZip", "label": "Home Zip Code", "type": "string" },
    { "id": "zipFound", "label": "Zip Code Found in Lookup", "type": "boolean" }
  ]
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/orchestrations/getWorkerEligibility.orchestration','utf8')); console.log('valid')"
```

- [ ] **Step 3: Import into Workday Studio**

Workday Studio → App → Orchestrations → + → name `getWorkerEligibility`. Add steps in order: `getHomeAddress` (Send Workday API Request), `getOfficeLocations` (Send Workday API Request), `calculateDistance` (Create Values using both script modules). Add both script modules to the orchestration's includes. Publish.

- [ ] **Step 4: App Preview smoke test**

Open the app in App Preview → navigate to `/register`. Confirm the eligibility banner appears (or shows "zip code not found" for unknown zips). No 500 errors.

- [ ] **Step 5: Commit**

```bash
git add localdisk_nkzjqw/orchestrations/getWorkerEligibility.orchestration
git commit -m "feat: add getWorkerEligibility orchestration with distance check"
```

---

## Task 8: submitCarRegistration + updateRegistrationStatus Orchestrations

**Files:**
- Create: `localdisk_nkzjqw/orchestrations/submitCarRegistration.orchestration`
- Create: `localdisk_nkzjqw/orchestrations/updateRegistrationStatus.orchestration`

- [ ] **Step 1: Create `localdisk_nkzjqw/orchestrations/submitCarRegistration.orchestration`**

```json
{
  "id": "submitCarRegistration",
  "name": "submitCarRegistration",
  "label": "Submit Car Registration",
  "description": "Creates or overwrites the worker's CarRegistration record (status=pending) and triggers the manager approval business process.",
  "type": "synchronous",
  "steps": [
    {
      "id": "checkExisting",
      "name": "Check Existing Registration",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "checkExisting",
        "method": "GET",
        "baseUrlType": "workday-customObjects",
        "url": "<% 'customObjectDefinitions/CarRegistration/instances?workerId=' + input.workerId %>",
        "authType": "sso"
      }
    },
    {
      "id": "deleteExisting",
      "name": "Delete Existing If Present",
      "type": "Branch on Conditions",
      "properties": {
        "referenceName": "deleteExisting",
        "branches": [
          {
            "condition": "<% steps.checkExisting.responseData.data.length > 0 %>",
            "steps": [
              {
                "id": "deleteRecord",
                "name": "Delete Old Record",
                "type": "Send Workday API Request",
                "properties": {
                  "referenceName": "deleteRecord",
                  "method": "DELETE",
                  "baseUrlType": "workday-customObjects",
                  "url": "<% 'customObjectDefinitions/CarRegistration/instances/' + steps.checkExisting.responseData.data[0].id %>",
                  "authType": "sso"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "id": "createRecord",
      "name": "Create Registration Record",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "createRecord",
        "method": "POST",
        "baseUrlType": "workday-customObjects",
        "url": "customObjectDefinitions/CarRegistration/instances",
        "authType": "sso",
        "body": {
          "workerId": "<% input.workerId %>",
          "make": "<% input.make %>",
          "model": "<% input.model %>",
          "year": "<% input.year %>",
          "licensePlate": "<% input.licensePlate %>",
          "plateState": "<% input.plateState %>",
          "status": "pending",
          "distanceMiles": "<% input.distanceMiles %>",
          "isEligible": "<% input.isEligible %>",
          "registrationDate": "<% date:now() %>",
          "otpCount": 0
        }
      }
    },
    {
      "id": "triggerApprovalBP",
      "name": "Trigger Approval Business Process",
      "type": "Trigger Business Process",
      "properties": {
        "referenceName": "triggerApprovalBP",
        "targetId": "<% input.workerId %>",
        "abpName": "CarRegistrationApproval",
        "authType": "sso"
      }
    }
  ],
  "inboundFields": [
    { "id": "workerId",      "type": "string",  "required": true },
    { "id": "make",          "type": "string",  "required": true },
    { "id": "model",         "type": "string",  "required": true },
    { "id": "year",          "type": "numeric", "required": true },
    { "id": "licensePlate",  "type": "string",  "required": true },
    { "id": "plateState",    "type": "string",  "required": true },
    { "id": "distanceMiles", "type": "numeric", "required": true },
    { "id": "isEligible",    "type": "boolean", "required": true }
  ],
  "outboundFields": [
    { "id": "recordId", "label": "Created Record ID", "type": "string" }
  ]
}
```

- [ ] **Step 2: Create `localdisk_nkzjqw/orchestrations/updateRegistrationStatus.orchestration`**

```json
{
  "id": "updateRegistrationStatus",
  "name": "updateRegistrationStatus",
  "label": "Update Registration Status",
  "description": "BP callback — sets status to approved or denied on the worker's CarRegistration record. Called by CarRegistrationApproval BP on manager decision.",
  "type": "synchronous",
  "steps": [
    {
      "id": "fetchRecord",
      "name": "Fetch Existing Record",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "fetchRecord",
        "method": "GET",
        "baseUrlType": "workday-customObjects",
        "url": "<% 'customObjectDefinitions/CarRegistration/instances?workerId=' + input.workerId %>",
        "authType": "sso"
      }
    },
    {
      "id": "buildPatch",
      "name": "Build Patch Payload",
      "type": "Create Values",
      "properties": {
        "referenceName": "buildPatch",
        "values": {
          "recordId": "<% steps.fetchRecord.responseData.data[0].id %>",
          "patchBody": "<% input.status === 'approved' ? { status: 'approved', approvedDate: date:now() } : { status: 'denied', denialReason: input.denialReason } %>"
        }
      }
    },
    {
      "id": "patchRecord",
      "name": "Patch Record",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "patchRecord",
        "method": "PATCH",
        "baseUrlType": "workday-customObjects",
        "url": "<% 'customObjectDefinitions/CarRegistration/instances/' + steps.buildPatch.recordId %>",
        "authType": "sso",
        "body": "<% steps.buildPatch.patchBody %>"
      }
    }
  ],
  "inboundFields": [
    { "id": "workerId",      "type": "string",  "required": true },
    { "id": "status",        "type": "string",  "required": true,  "note": "approved | denied" },
    { "id": "denialReason",  "type": "string",  "required": false }
  ]
}
```

- [ ] **Step 3: Validate both JSON files**

```bash
node -e "
  JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/orchestrations/submitCarRegistration.orchestration','utf8'));
  JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/orchestrations/updateRegistrationStatus.orchestration','utf8'));
  console.log('both valid');
"
```

- [ ] **Step 4: Import into Workday Studio**

Create both orchestrations in Studio. Ensure `submitCarRegistration`'s "Trigger Business Process" step references the exact BP name `CarRegistrationApproval`.

- [ ] **Step 5: Commit**

```bash
git add localdisk_nkzjqw/orchestrations/submitCarRegistration.orchestration localdisk_nkzjqw/orchestrations/updateRegistrationStatus.orchestration
git commit -m "feat: add submitCarRegistration and updateRegistrationStatus orchestrations"
```

---

## Task 9: getTeamRegistrations Orchestration

**Files:**
- Create: `localdisk_nkzjqw/orchestrations/getTeamRegistrations.orchestration`

- [ ] **Step 1: Create `localdisk_nkzjqw/orchestrations/getTeamRegistrations.orchestration`**

```json
{
  "id": "getTeamRegistrations",
  "name": "getTeamRegistrations",
  "label": "Get Team Registrations",
  "description": "Returns CarRegistration records for all of the manager's direct reports, joined with worker display names.",
  "type": "synchronous",
  "steps": [
    {
      "id": "getDirectReports",
      "name": "Get Direct Reports",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "getDirectReports",
        "method": "GET",
        "baseUrlType": "workday-staffing",
        "url": "<% 'workers/' + input.managerId + '/directReports?limit=100' %>",
        "authType": "sso"
      }
    },
    {
      "id": "buildWorkerIds",
      "name": "Build Worker IDs List",
      "type": "Create Values",
      "properties": {
        "referenceName": "buildWorkerIds",
        "values": {
          "workerIds": "<% steps.getDirectReports.responseData.data.map(function(w) { return w.id; }) %>",
          "workerNames": "<% steps.getDirectReports.responseData.data.reduce(function(acc, w) { acc[w.id] = w.descriptor; return acc; }, {}) %>"
        }
      }
    },
    {
      "id": "fetchAllRegistrations",
      "name": "Fetch All Registrations",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "fetchAllRegistrations",
        "method": "GET",
        "baseUrlType": "workday-customObjects",
        "url": "customObjectDefinitions/CarRegistration/instances?limit=500",
        "authType": "sso"
      }
    },
    {
      "id": "filterAndJoin",
      "name": "Filter and Join with Worker Names",
      "type": "Create Values",
      "properties": {
        "referenceName": "filterAndJoin",
        "values": {
          "teamRegistrations": "<% steps.fetchAllRegistrations.responseData.data.filter(function(r) { return steps.buildWorkerIds.workerIds.indexOf(r.workerId) !== -1; }).map(function(r) { return Object.assign({}, r, { workerName: steps.buildWorkerIds.workerNames[r.workerId] || r.workerId }); }) %>"
        }
      }
    }
  ],
  "inboundFields": [
    { "id": "managerId", "type": "string", "required": true }
  ],
  "outboundFields": [
    { "id": "teamRegistrations", "label": "Team Registrations", "type": "array" }
  ]
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/orchestrations/getTeamRegistrations.orchestration','utf8')); console.log('valid')"
```

- [ ] **Step 3: Import into Workday Studio and publish**

- [ ] **Step 4: Commit**

```bash
git add localdisk_nkzjqw/orchestrations/getTeamRegistrations.orchestration
git commit -m "feat: add getTeamRegistrations orchestration"
```

---

## Task 10: issueOtp + anniversaryOtpScheduler Orchestrations

**Files:**
- Create: `localdisk_nkzjqw/orchestrations/issueOtp.orchestration`
- Create: `localdisk_nkzjqw/orchestrations/anniversaryOtpScheduler.orchestration`

- [ ] **Step 1: Create `localdisk_nkzjqw/orchestrations/issueOtp.orchestration`**

```json
{
  "id": "issueOtp",
  "name": "issueOtp",
  "label": "Issue Commuter OTP",
  "description": "Issues a $100 one-time payment to a worker via the CommuterOtp business process. Updates lastOtpDate and increments otpCount on the CarRegistration record.",
  "type": "synchronous",
  "steps": [
    {
      "id": "fetchRecord",
      "name": "Fetch Registration Record",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "fetchRecord",
        "method": "GET",
        "baseUrlType": "workday-customObjects",
        "url": "<% 'customObjectDefinitions/CarRegistration/instances?workerId=' + input.workerId %>",
        "authType": "sso"
      }
    },
    {
      "id": "validateApproved",
      "name": "Validate Status Is Approved",
      "type": "Validate",
      "properties": {
        "referenceName": "validateApproved",
        "condition": "<% steps.fetchRecord.responseData.data.length > 0 && steps.fetchRecord.responseData.data[0].status === 'approved' %>",
        "errorMessage": "Worker does not have an approved car registration."
      }
    },
    {
      "id": "triggerOtpBP",
      "name": "Trigger Commuter OTP Business Process",
      "type": "Trigger Business Process",
      "properties": {
        "referenceName": "triggerOtpBP",
        "targetId": "<% input.workerId %>",
        "abpName": "CommuterOtp",
        "authType": "sso"
      }
    },
    {
      "id": "updateRecord",
      "name": "Update lastOtpDate and otpCount",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "updateRecord",
        "method": "PATCH",
        "baseUrlType": "workday-customObjects",
        "url": "<% 'customObjectDefinitions/CarRegistration/instances/' + steps.fetchRecord.responseData.data[0].id %>",
        "authType": "sso",
        "body": {
          "lastOtpDate": "<% date:now() %>",
          "otpCount": "<% (steps.fetchRecord.responseData.data[0].otpCount || 0) + 1 %>"
        }
      }
    }
  ],
  "inboundFields": [
    { "id": "workerId", "type": "string", "required": true }
  ],
  "outboundFields": [
    { "id": "success", "type": "boolean" }
  ]
}
```

- [ ] **Step 2: Create `localdisk_nkzjqw/orchestrations/anniversaryOtpScheduler.orchestration`**

```json
{
  "id": "anniversaryOtpScheduler",
  "name": "anniversaryOtpScheduler",
  "label": "Anniversary OTP Scheduler",
  "description": "Nightly batch: queries all approved+eligible CarRegistration records, filters to those whose anniversary is today (month + day match), and calls issueOtp for each. Schedule via Workday Integration System scheduling — run nightly at midnight UTC.",
  "type": "asynchronous",
  "steps": [
    {
      "id": "fetchEligible",
      "name": "Fetch Approved Eligible Registrations",
      "type": "Send Workday API Request",
      "properties": {
        "referenceName": "fetchEligible",
        "method": "GET",
        "baseUrlType": "workday-customObjects",
        "url": "customObjectDefinitions/CarRegistration/instances?status=approved&isEligible=true&limit=1000",
        "authType": "sso"
      }
    },
    {
      "id": "filterAnniversaries",
      "name": "Filter to Today's Anniversaries",
      "type": "Create Values",
      "properties": {
        "referenceName": "filterAnniversaries",
        "values": {
          "todayMonthDay": "<% date:format(date:now(), 'MM-dd') %>",
          "dueToday": "<% steps.fetchEligible.responseData.data.filter(function(r) { return r.registrationDate && date:format(date:parse(r.registrationDate), 'MM-dd') === steps.filterAnniversaries.todayMonthDay; }) %>"
        }
      }
    },
    {
      "id": "issueLoop",
      "name": "Issue OTP for Each",
      "type": "Loop",
      "properties": {
        "referenceName": "issueLoop",
        "on": "<% steps.filterAnniversaries.dueToday %>",
        "as": "registration",
        "steps": [
          {
            "id": "callIssueOtp",
            "name": "Call issueOtp",
            "type": "Call Suborchestration",
            "properties": {
              "referenceName": "callIssueOtp",
              "orchestrationId": "issueOtp",
              "input": {
                "workerId": "<% registration.workerId %>"
              }
            }
          }
        ]
      }
    },
    {
      "id": "logResults",
      "name": "Log Results",
      "type": "Log",
      "properties": {
        "referenceName": "logResults",
        "message": "<% 'Anniversary OTP batch complete. Processed: ' + steps.filterAnniversaries.dueToday.length + ' workers.' %>"
      }
    }
  ]
}
```

- [ ] **Step 3: Validate both JSON files**

```bash
node -e "
  JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/orchestrations/issueOtp.orchestration','utf8'));
  JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/orchestrations/anniversaryOtpScheduler.orchestration','utf8'));
  console.log('both valid');
"
```

- [ ] **Step 4: Import into Workday Studio**

Import both. For `anniversaryOtpScheduler`, after importing: Workday → Integration System → Schedule Integration → select `anniversaryOtpScheduler` → set to run daily at 00:00 UTC.

- [ ] **Step 5: Commit**

```bash
git add localdisk_nkzjqw/orchestrations/issueOtp.orchestration localdisk_nkzjqw/orchestrations/anniversaryOtpScheduler.orchestration
git commit -m "feat: add issueOtp and anniversaryOtpScheduler orchestrations"
```

---

## Task 11: home.pmd Update

**Files:**
- Modify: `localdisk_nkzjqw/presentation/home.pmd`

- [ ] **Step 1: Replace `localdisk_nkzjqw/presentation/home.pmd`**

```json
{
  "id": "home",
  "endPoints": [
    {
      "name": "currentUser",
      "baseUrlType": "workday-staffing",
      "url": "/workers/me",
      "authType": "sso"
    },
    {
      "name": "workerRegistration",
      "baseUrlType": "orchestrate",
      "url": "getWorkerRegistration/launch",
      "httpMethod": "post",
      "authType": "sso",
      "deferred": false,
      "onSend": "<% self.data = { workerId: currentUser.id }; %>"
    }
  ],
  "presentation": {
    "title": {
      "type": "title",
      "label": "Parking Registration"
    },
    "body": {
      "type": "section",
      "horizontal": false,
      "children": [
        {
          "type": "fieldSet",
          "id": "profileSection",
          "title": "My Profile",
          "children": [
            {
              "type": "text",
              "id": "profileName",
              "label": "Name",
              "enabled": false,
              "value": "<% currentUser.descriptor %>"
            },
            {
              "type": "text",
              "id": "profileBusinessTitle",
              "label": "Business Title",
              "enabled": false,
              "value": "<% currentUser.primaryJob.businessTitle %>"
            },
            {
              "type": "text",
              "id": "profileLocation",
              "label": "Primary Work Location",
              "enabled": false,
              "value": "<% currentUser.primaryJob.location.descriptor %>"
            }
          ]
        },
        {
          "type": "fieldSet",
          "id": "registrationStatus",
          "title": "My Car Registration",
          "children": [
            {
              "type": "richText",
              "id": "noRegistrationMsg",
              "visible": "<% !workerRegistration.hasRegistration %>",
              "value": "You have no active car registration. Register your vehicle to apply for a parking space."
            },
            {
              "type": "button",
              "id": "registerButton",
              "label": "Register My Car",
              "visible": "<% !workerRegistration.hasRegistration %>",
              "buttonStyle": "primary",
              "taskId": "register-car"
            },
            {
              "type": "richText",
              "id": "pendingMsg",
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status === 'pending' %>",
              "value": "Your registration is pending manager approval."
            },
            {
              "type": "richText",
              "id": "deniedMsg",
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status === 'denied' %>",
              "value": "<% 'Your registration was denied. Reason: ' + (workerRegistration.registration.denialReason || 'No reason provided.') %>"
            },
            {
              "type": "button",
              "id": "reRegisterButton",
              "label": "Register Again",
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status === 'denied' %>",
              "buttonStyle": "primary",
              "taskId": "register-car"
            },
            {
              "type": "text",
              "id": "carMake",
              "label": "Make",
              "enabled": false,
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status !== 'denied' %>",
              "value": "<% workerRegistration.registration.make %>"
            },
            {
              "type": "text",
              "id": "carModel",
              "label": "Model",
              "enabled": false,
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status !== 'denied' %>",
              "value": "<% workerRegistration.registration.model %>"
            },
            {
              "type": "text",
              "id": "carYear",
              "label": "Year",
              "enabled": false,
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status !== 'denied' %>",
              "value": "<% workerRegistration.registration.year %>"
            },
            {
              "type": "text",
              "id": "carPlate",
              "label": "License Plate",
              "enabled": false,
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status !== 'denied' %>",
              "value": "<% workerRegistration.registration.licensePlate + ' (' + workerRegistration.registration.plateState + ')' %>"
            },
            {
              "type": "text",
              "id": "registrationStatusField",
              "label": "Status",
              "enabled": false,
              "visible": "<% workerRegistration.hasRegistration %>",
              "value": "<% workerRegistration.registration.status %>"
            },
            {
              "type": "text",
              "id": "eligibilityField",
              "label": "Commuter Benefit",
              "enabled": false,
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status === 'approved' %>",
              "value": "<% workerRegistration.registration.isEligible ? 'Eligible (>' + workerRegistration.registration.distanceMiles + ' mi)' : 'Not eligible (<= 20 mi)' %>"
            },
            {
              "type": "text",
              "id": "lastOtpField",
              "label": "Last OTP Issued",
              "enabled": false,
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status === 'approved' && workerRegistration.registration.lastOtpDate %>",
              "value": "<% workerRegistration.registration.lastOtpDate %>"
            },
            {
              "type": "text",
              "id": "otpCountField",
              "label": "Total OTPs Received",
              "enabled": false,
              "visible": "<% workerRegistration.hasRegistration && workerRegistration.registration.status === 'approved' %>",
              "value": "<% workerRegistration.registration.otpCount || 0 %>"
            }
          ]
        },
        {
          "type": "fieldSet",
          "id": "managerSection",
          "title": "Manager Actions",
          "visible": "<% currentUser.managementLevel && currentUser.managementLevel !== 'Individual Contributor' %>",
          "children": [
            {
              "type": "button",
              "id": "manageTeamButton",
              "label": "Manage My Team's Commuters",
              "buttonStyle": "secondary",
              "taskId": "manage-commuters"
            }
          ]
        }
      ]
    },
    "footer": {
      "type": "footer",
      "children": [
        {
          "type": "richText",
          "enabled": "false",
          "value": "Powered By Workday Extend"
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/presentation/home.pmd','utf8')); console.log('home.pmd valid')"
```

- [ ] **Step 3: App Preview smoke test**

Open App Preview → home route `/`. Confirm:
- Worker profile displays name, title, location
- "Register My Car" button visible (no active registration)
- Manager section visible only for managers

- [ ] **Step 4: Commit**

```bash
git add localdisk_nkzjqw/presentation/home.pmd
git commit -m "feat: update home.pmd with registration status and manager nav"
```

---

## Task 12: Register Car Wizard PMDs (Steps 1 & 2)

**Files:**
- Create: `localdisk_nkzjqw/presentation/register-step1.pmd`
- Create: `localdisk_nkzjqw/presentation/register-step2.pmd`

- [ ] **Step 1: Create `localdisk_nkzjqw/presentation/register-step1.pmd`**

```json
{
  "id": "register-step1",
  "endPoints": [
    {
      "name": "currentUser",
      "baseUrlType": "workday-staffing",
      "url": "/workers/me",
      "authType": "sso"
    },
    {
      "name": "eligibilityCheck",
      "baseUrlType": "orchestrate",
      "url": "getWorkerEligibility/launch",
      "httpMethod": "post",
      "authType": "sso",
      "deferred": false,
      "onSend": "<% self.data = { workerId: currentUser.id }; %>"
    }
  ],
  "presentation": {
    "pageType": "edit",
    "title": {
      "type": "title",
      "label": "Register My Car — Step 1 of 3"
    },
    "body": {
      "type": "section",
      "horizontal": false,
      "children": [
        {
          "type": "richText",
          "id": "eligibilityBanner",
          "visible": "<% eligibilityCheck.zipFound %>",
          "value": "<% eligibilityCheck.isEligible ? '✓ You live ' + Math.round(eligibilityCheck.distanceMiles) + ' miles from the nearest office. You are eligible for the annual $100 commuter benefit.' : 'You live ' + Math.round(eligibilityCheck.distanceMiles) + ' miles from the nearest office. You are not eligible for the commuter benefit (must be > 20 miles).' %>"
        },
        {
          "type": "richText",
          "id": "zipNotFoundBanner",
          "visible": "<% !eligibilityCheck.zipFound %>",
          "value": "Distance check: your home zip code was not found in our lookup. You can still register your car. Eligibility will be reviewed manually."
        },
        {
          "type": "fieldSet",
          "id": "carDetailsForm",
          "title": "Vehicle Details",
          "children": [
            {
              "type": "text",
              "id": "carMake",
              "label": "Make",
              "required": true,
              "placeholder": "e.g. Toyota"
            },
            {
              "type": "text",
              "id": "carModel",
              "label": "Model",
              "required": true,
              "placeholder": "e.g. Camry"
            },
            {
              "type": "numeric",
              "id": "carYear",
              "label": "Year",
              "required": true,
              "minValue": 1980,
              "maxValue": 2027,
              "placeholder": "e.g. 2022"
            },
            {
              "type": "text",
              "id": "licensePlate",
              "label": "License Plate",
              "required": true,
              "placeholder": "e.g. ABC1234"
            },
            {
              "type": "select",
              "id": "plateState",
              "label": "Plate State",
              "required": true,
              "options": [
                {"id": "AL", "descriptor": "Alabama"},
                {"id": "AK", "descriptor": "Alaska"},
                {"id": "AZ", "descriptor": "Arizona"},
                {"id": "AR", "descriptor": "Arkansas"},
                {"id": "CA", "descriptor": "California"},
                {"id": "CO", "descriptor": "Colorado"},
                {"id": "CT", "descriptor": "Connecticut"},
                {"id": "DC", "descriptor": "District of Columbia"},
                {"id": "DE", "descriptor": "Delaware"},
                {"id": "FL", "descriptor": "Florida"},
                {"id": "GA", "descriptor": "Georgia"},
                {"id": "HI", "descriptor": "Hawaii"},
                {"id": "ID", "descriptor": "Idaho"},
                {"id": "IL", "descriptor": "Illinois"},
                {"id": "IN", "descriptor": "Indiana"},
                {"id": "IA", "descriptor": "Iowa"},
                {"id": "KS", "descriptor": "Kansas"},
                {"id": "KY", "descriptor": "Kentucky"},
                {"id": "LA", "descriptor": "Louisiana"},
                {"id": "ME", "descriptor": "Maine"},
                {"id": "MD", "descriptor": "Maryland"},
                {"id": "MA", "descriptor": "Massachusetts"},
                {"id": "MI", "descriptor": "Michigan"},
                {"id": "MN", "descriptor": "Minnesota"},
                {"id": "MS", "descriptor": "Mississippi"},
                {"id": "MO", "descriptor": "Missouri"},
                {"id": "MT", "descriptor": "Montana"},
                {"id": "NE", "descriptor": "Nebraska"},
                {"id": "NV", "descriptor": "Nevada"},
                {"id": "NH", "descriptor": "New Hampshire"},
                {"id": "NJ", "descriptor": "New Jersey"},
                {"id": "NM", "descriptor": "New Mexico"},
                {"id": "NY", "descriptor": "New York"},
                {"id": "NC", "descriptor": "North Carolina"},
                {"id": "ND", "descriptor": "North Dakota"},
                {"id": "OH", "descriptor": "Ohio"},
                {"id": "OK", "descriptor": "Oklahoma"},
                {"id": "OR", "descriptor": "Oregon"},
                {"id": "PA", "descriptor": "Pennsylvania"},
                {"id": "RI", "descriptor": "Rhode Island"},
                {"id": "SC", "descriptor": "South Carolina"},
                {"id": "SD", "descriptor": "South Dakota"},
                {"id": "TN", "descriptor": "Tennessee"},
                {"id": "TX", "descriptor": "Texas"},
                {"id": "UT", "descriptor": "Utah"},
                {"id": "VT", "descriptor": "Vermont"},
                {"id": "VA", "descriptor": "Virginia"},
                {"id": "WA", "descriptor": "Washington"},
                {"id": "WV", "descriptor": "West Virginia"},
                {"id": "WI", "descriptor": "Wisconsin"},
                {"id": "WY", "descriptor": "Wyoming"}
              ]
            }
          ]
        }
      ]
    },
    "outboundEndPoints": [
      {
        "name": "toReview",
        "onSend": "<% self.data = { make: carMake.value, model: carModel.value, year: carYear.value, licensePlate: licensePlate.value, plateState: plateState.value.id, distanceMiles: eligibilityCheck.distanceMiles, isEligible: eligibilityCheck.isEligible, workerId: currentUser.id }; %>"
      }
    ]
  }
}
```

- [ ] **Step 2: Create `localdisk_nkzjqw/presentation/register-step2.pmd`**

```json
{
  "id": "register-step2",
  "endPoints": [
    {
      "name": "submitRegistration",
      "baseUrlType": "orchestrate",
      "url": "submitCarRegistration/launch",
      "httpMethod": "post",
      "authType": "sso",
      "deferred": true,
      "onSend": "<% self.data = { workerId: taskParams.workerId, make: taskParams.make, model: taskParams.model, year: taskParams.year, licensePlate: taskParams.licensePlate, plateState: taskParams.plateState, distanceMiles: taskParams.distanceMiles, isEligible: taskParams.isEligible }; %>"
    }
  ],
  "presentation": {
    "pageType": "edit",
    "title": {
      "type": "title",
      "label": "Register My Car — Step 2 of 3: Review"
    },
    "body": {
      "type": "section",
      "horizontal": false,
      "children": [
        {
          "type": "fieldSet",
          "id": "reviewSection",
          "title": "Review Your Details",
          "children": [
            {
              "type": "text",
              "id": "reviewMake",
              "label": "Make",
              "enabled": false,
              "value": "<% taskParams.make %>"
            },
            {
              "type": "text",
              "id": "reviewModel",
              "label": "Model",
              "enabled": false,
              "value": "<% taskParams.model %>"
            },
            {
              "type": "text",
              "id": "reviewYear",
              "label": "Year",
              "enabled": false,
              "value": "<% taskParams.year %>"
            },
            {
              "type": "text",
              "id": "reviewPlate",
              "label": "License Plate",
              "enabled": false,
              "value": "<% taskParams.licensePlate + ' (' + taskParams.plateState + ')' %>"
            },
            {
              "type": "text",
              "id": "reviewDistance",
              "label": "Distance to Nearest Office",
              "enabled": false,
              "value": "<% taskParams.distanceMiles > 0 ? Math.round(taskParams.distanceMiles) + ' miles' : 'Unable to calculate' %>"
            },
            {
              "type": "text",
              "id": "reviewEligibility",
              "label": "Commuter Benefit Eligibility",
              "enabled": false,
              "value": "<% taskParams.isEligible ? 'Eligible — annual $100 OTP' : 'Not eligible (< 20 miles)' %>"
            }
          ]
        },
        {
          "type": "checkboxGroup",
          "id": "confirmCheck",
          "label": "Confirmation",
          "required": true,
          "options": [
            { "id": "confirm", "descriptor": "I confirm the vehicle details above are correct" }
          ]
        },
        {
          "type": "button",
          "id": "submitButton",
          "label": "Submit for Approval",
          "buttonStyle": "primary",
          "enabled": "<% confirmCheck.value && confirmCheck.value.length > 0 %>",
          "onClick": "<% submitRegistration.invoke(); %>"
        }
      ]
    }
  }
}
```

- [ ] **Step 3: Validate both JSON files**

```bash
node -e "
  JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/presentation/register-step1.pmd','utf8'));
  JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/presentation/register-step2.pmd','utf8'));
  console.log('both valid');
"
```

- [ ] **Step 4: App Preview smoke test**

Open App Preview → navigate to `/register`. Confirm:
- Step 1 shows eligibility banner on load
- All form fields present
- Proceeding to step 2 shows read-only summary with values from step 1
- Submit button disabled until checkbox ticked

- [ ] **Step 5: Commit**

```bash
git add localdisk_nkzjqw/presentation/register-step1.pmd localdisk_nkzjqw/presentation/register-step2.pmd
git commit -m "feat: add register car wizard step 1 (details) and step 2 (review)"
```

---

## Task 13: Register Confirmation PMD

**Files:**
- Create: `localdisk_nkzjqw/presentation/register-step3.pmd`

- [ ] **Step 1: Create `localdisk_nkzjqw/presentation/register-step3.pmd`**

```json
{
  "id": "register-step3",
  "endPoints": [],
  "presentation": {
    "pageType": "confirm",
    "title": {
      "type": "title",
      "label": "Registration Submitted"
    },
    "body": {
      "type": "section",
      "horizontal": false,
      "children": [
        {
          "type": "richText",
          "id": "confirmationMsg",
          "value": "Your car registration has been submitted and is pending manager approval. You will be notified once your manager reviews your request."
        },
        {
          "type": "fieldSet",
          "id": "confirmationDetails",
          "title": "Your Registration",
          "children": [
            {
              "type": "text",
              "id": "confirmMake",
              "label": "Make",
              "enabled": false,
              "value": "<% taskParams.make %>"
            },
            {
              "type": "text",
              "id": "confirmModel",
              "label": "Model",
              "enabled": false,
              "value": "<% taskParams.model %>"
            },
            {
              "type": "text",
              "id": "confirmYear",
              "label": "Year",
              "enabled": false,
              "value": "<% taskParams.year %>"
            },
            {
              "type": "text",
              "id": "confirmPlate",
              "label": "License Plate",
              "enabled": false,
              "value": "<% taskParams.licensePlate + ' (' + taskParams.plateState + ')' %>"
            }
          ]
        },
        {
          "type": "button",
          "id": "returnHomeButton",
          "label": "Return to Home",
          "buttonStyle": "secondary",
          "taskId": "home"
        }
      ]
    },
    "footer": {
      "type": "footer",
      "children": [
        {
          "type": "richText",
          "enabled": "false",
          "value": "Powered By Workday Extend"
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/presentation/register-step3.pmd','utf8')); console.log('valid')"
```

- [ ] **Step 3: Full end-to-end App Preview test**

1. Open App Preview → home → "Register My Car"
2. Fill in step 1 details → Next
3. Review details on step 2, tick confirmation checkbox → "Submit for Approval"
4. Confirm step 3 shows submission message and car summary
5. "Return to Home" → home page shows "pending" status badge

- [ ] **Step 4: Commit**

```bash
git add localdisk_nkzjqw/presentation/register-step3.pmd
git commit -m "feat: add register car wizard confirmation page (step 3)"
```

---

## Task 14: manage-commuters.pmd

**Files:**
- Create: `localdisk_nkzjqw/presentation/manage-commuters.pmd`

- [ ] **Step 1: Create `localdisk_nkzjqw/presentation/manage-commuters.pmd`**

```json
{
  "id": "manage-commuters",
  "endPoints": [
    {
      "name": "currentUser",
      "baseUrlType": "workday-staffing",
      "url": "/workers/me",
      "authType": "sso"
    },
    {
      "name": "teamRegistrations",
      "baseUrlType": "orchestrate",
      "url": "getTeamRegistrations/launch",
      "httpMethod": "post",
      "authType": "sso",
      "deferred": false,
      "onSend": "<% self.data = { managerId: currentUser.id }; %>"
    },
    {
      "name": "issueAdHocOtp",
      "baseUrlType": "orchestrate",
      "url": "issueOtp/launch",
      "httpMethod": "post",
      "authType": "sso",
      "deferred": true
    },
    {
      "name": "approveRegistration",
      "baseUrlType": "orchestrate",
      "url": "updateRegistrationStatus/launch",
      "httpMethod": "post",
      "authType": "sso",
      "deferred": true
    },
    {
      "name": "denyRegistration",
      "baseUrlType": "orchestrate",
      "url": "updateRegistrationStatus/launch",
      "httpMethod": "post",
      "authType": "sso",
      "deferred": true
    }
  ],
  "presentation": {
    "title": {
      "type": "title",
      "label": "Manage Team Commuters"
    },
    "body": {
      "type": "section",
      "horizontal": false,
      "children": [
        {
          "type": "richText",
          "id": "accessDeniedMsg",
          "visible": "<% !currentUser.managementLevel || currentUser.managementLevel === 'Individual Contributor' %>",
          "value": "Access denied. This page is only available to managers."
        },
        {
          "type": "section",
          "id": "managerContent",
          "visible": "<% currentUser.managementLevel && currentUser.managementLevel !== 'Individual Contributor' %>",
          "horizontal": false,
          "children": [
            {
              "type": "richText",
              "id": "noTeamMsg",
              "visible": "<% teamRegistrations.teamRegistrations.length === 0 %>",
              "value": "No car registrations found for your direct reports."
            },
            {
              "type": "grid",
              "id": "commutersGrid",
              "visible": "<% teamRegistrations.teamRegistrations.length > 0 %>",
              "on": "<% teamRegistrations.teamRegistrations %>",
              "as": "reg",
              "columns": [
                {
                  "id": "workerNameCol",
                  "label": "Worker",
                  "template": {
                    "type": "text",
                    "value": "<% reg.workerName %>"
                  }
                },
                {
                  "id": "carCol",
                  "label": "Vehicle",
                  "template": {
                    "type": "text",
                    "value": "<% reg.year + ' ' + reg.make + ' ' + reg.model %>"
                  }
                },
                {
                  "id": "plateCol",
                  "label": "Plate",
                  "template": {
                    "type": "text",
                    "value": "<% reg.licensePlate + ' (' + reg.plateState + ')' %>"
                  }
                },
                {
                  "id": "distanceCol",
                  "label": "Distance",
                  "template": {
                    "type": "text",
                    "value": "<% reg.distanceMiles > 0 ? Math.round(reg.distanceMiles) + ' mi' : 'N/A' %>"
                  }
                },
                {
                  "id": "eligibilityCol",
                  "label": "Eligible",
                  "template": {
                    "type": "text",
                    "value": "<% reg.isEligible ? 'Yes' : 'No' %>"
                  }
                },
                {
                  "id": "statusCol",
                  "label": "Status",
                  "template": {
                    "type": "text",
                    "value": "<% reg.status %>"
                  }
                },
                {
                  "id": "lastOtpCol",
                  "label": "Last OTP",
                  "template": {
                    "type": "text",
                    "value": "<% reg.lastOtpDate || 'None' %>"
                  }
                },
                {
                  "id": "otpCountCol",
                  "label": "OTP Count",
                  "template": {
                    "type": "text",
                    "value": "<% reg.otpCount || 0 %>"
                  }
                },
                {
                  "id": "actionsCol",
                  "label": "Actions",
                  "template": {
                    "type": "section",
                    "horizontal": true,
                    "children": [
                      {
                        "type": "button",
                        "id": "approveBtn",
                        "label": "Approve",
                        "buttonStyle": "primary",
                        "visible": "<% reg.status === 'pending' %>",
                        "onClick": "<% approveRegistration.invoke({ data: { workerId: reg.workerId, status: 'approved' } }); %>"
                      },
                      {
                        "type": "button",
                        "id": "denyBtn",
                        "label": "Deny",
                        "buttonStyle": "destructive",
                        "visible": "<% reg.status === 'pending' %>",
                        "onClick": "<% denyRegistration.invoke({ data: { workerId: reg.workerId, status: 'denied', denialReason: 'Denied by manager' } }); %>"
                      },
                      {
                        "type": "button",
                        "id": "otpBtn",
                        "label": "Issue OTP",
                        "buttonStyle": "secondary",
                        "visible": "<% reg.status === 'approved' %>",
                        "onClick": "<% issueAdHocOtp.invoke({ data: { workerId: reg.workerId } }); %>"
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    },
    "footer": {
      "type": "footer",
      "children": [
        {
          "type": "richText",
          "enabled": "false",
          "value": "Powered By Workday Extend"
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('localdisk_nkzjqw/presentation/manage-commuters.pmd','utf8')); console.log('manage-commuters.pmd valid')"
```

- [ ] **Step 3: App Preview smoke test (as a manager)**

1. Open App Preview as a manager → home → "Manage My Team's Commuters"
2. Confirm grid shows direct reports with registrations
3. Click "Approve" on a pending row → row status updates to "approved"
4. Click "Issue OTP" on an approved row → OTP count increments
5. As a non-manager worker, navigate to `/manage` → access denied message shown

- [ ] **Step 4: Final commit**

```bash
git add localdisk_nkzjqw/presentation/manage-commuters.pmd
git commit -m "feat: add manage-commuters page with approval and ad-hoc OTP actions"
```

---

## Implementation Notes

### Flow Data Passing (register-step2 and register-step3)
This plan uses `taskParams` to reference data passed from the previous flow step. Workday Extend may use a different variable name depending on your Studio version — common alternatives are `inboundParameters` or `flowVariables`. Verify in App Preview: in the Page Inspector, check what variable holds the data from the previous step and update the `<% taskParams.* %>` expressions accordingly in `register-step2.pmd` and `register-step3.pmd`.

### Grid Row-Level Endpoint Invocation (manage-commuters)
The `onClick` buttons in the `commutersGrid` template use `reg.workerId` (the current row's loop variable). The deferred endpoint `onSend` expressions also need access to `reg`. In Workday Extend, loop variables may or may not be in scope for endpoint `onSend`. If the approve/deny/OTP buttons fail to pass the correct worker ID:

**Alternative approach:** Add a hidden `text` field per row that captures `reg.workerId`, and reference that field's value in the endpoint `onSend` instead. Example for `issueAdHocOtp`:
```json
{
  "name": "issueAdHocOtp",
  "deferred": true,
  "onSend": "<% self.data = { workerId: selectedWorkerIdField.value }; %>"
}
```
And set `selectedWorkerIdField.value = reg.workerId` via a script on button click before invoking.

### Custom Objects API Base URL
The orchestrations use `baseUrlType: "workday-customObjects"` with URLs like `customObjectDefinitions/CarRegistration/instances`. Verify the exact base URL by checking your tenant's custom objects API endpoint in Workday Studio → API reference. The AMD `dataProviders` entry for `workday-customObjects` may need adjusting.

---

## Post-Implementation Checklist

- [ ] All 6 orchestrations published in Workday Studio
- [ ] `anniversaryOtpScheduler` scheduled nightly at 00:00 UTC via Integration System scheduling
- [ ] `CarRegistration` CBO created in Studio with all 14 fields
- [ ] Both BPs (`CarRegistrationApproval`, `CommuterOtp`) created in Studio
- [ ] Both script modules (`distanceCalculator.script`, `zipCodeCoordinates.script`) added to the app in Studio
- [ ] App Preview end-to-end test: register → pending → manager approves → approved status on home
- [ ] App Preview OTP test: manager issues ad-hoc OTP → count increments
- [ ] Replace zip code dev dataset with full US dataset before production deployment
