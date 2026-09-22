import assert from "node:assert/strict";
import test from "node:test";
import { mapTilerSearchUrl, parseMapTilerSuggestions } from "./geocoding.ts";

test("address search URL enables autocomplete and limits results to Estonia", () => {
  const url = new URL(mapTilerSearchUrl("Pärnu mnt 10", "test-key"));
  assert.equal(url.pathname, "/geocoding/P%C3%A4rnu%20mnt%2010.json");
  assert.equal(url.searchParams.get("autocomplete"), "true");
  assert.equal(url.searchParams.get("country"), "ee");
  assert.equal(url.searchParams.get("limit"), "6");
});

test("geocoder response keeps only usable address suggestions", () => {
  const result = parseMapTilerSuggestions({ features: [
    { id: "address.1", place_name: "Pärnu maantee 10, Tallinn", center: [24.744, 59.425] },
    { id: "broken", place_name: "Broken", center: [999, 999] },
    { text: "Tartu", center: [26.72, 58.37] },
  ] });
  assert.deepEqual(result, [
    { id: "address.1", label: "Pärnu maantee 10, Tallinn", lng: 24.744, lat: 59.425 },
    { id: "26.72:58.37:2", label: "Tartu", lng: 26.72, lat: 58.37 },
  ]);
});
