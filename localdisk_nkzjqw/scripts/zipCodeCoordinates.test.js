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
