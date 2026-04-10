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
