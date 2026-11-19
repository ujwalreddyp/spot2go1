// RideBridge - app.js
// Flow: get a location (search / map tap / pasted link) -> show lat,lng -> open Uber or Rapido.

// ---------- 1. Map setup ----------
const map = L.map("map", { zoomControl: false }).setView([17.385, 78.4867], 12); // starts on Hyderabad
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "Tiles &copy; Esri",
}).addTo(map);

// ---------- 2. State (what the app currently remembers) ----------
let pickup = null;      // { lat, lng, label }
let drop = null;        // { lat, lng, label }
let mode = "drop";      // what a map tap sets: "drop" or "pickup"
let pickupMarker = null, dropMarker = null, routeLine = null;

const $ = (id) => document.getElementById(id);

// Small coloured circle markers (no image files needed)
const dotIcon = (color) =>
  L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

// ---------- 3. Helpers ----------
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 3500);
}

const fmt = (n) => Number(n).toFixed(6);
const validLatLng = (lat, lng) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Turns lat,lng into a readable address using OpenStreetMap's free Nominatim service
async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const d = await r.json();
    return d.display_name || `${fmt(lat)}, ${fmt(lng)}`;
  } catch {
    return `${fmt(lat)}, ${fmt(lng)}`;
  }
}

// ---------- 4. Reading coordinates out of text / Google Maps links ----------
function parseLocation(text) {
  text = decodeURIComponent(text.trim());

  // Plain coordinates, like "17.385, 78.4867"
  let m = text.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return { lat: +m[1], lng: +m[2] };

  // Google Maps links put the exact pin after "!3d" and "!4d"
  m = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2] };

  // ...or "?q=lat,lng", "?ll=lat,lng", "?query=lat,lng", "destination=lat,lng"
  m = text.match(/[?&](?:q|ll|query|destination|daddr|center)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2] };

  // ...or "@lat,lng,zoom" (this is the map centre, usually very close to the pin)
  m = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2] };

  return null;
}

const isShortLink = (t) => /(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(t);

// ---------- 5. Setting pickup / destination ----------
async function setPoint(kind, lat, lng, label, fly = true) {
  if (!validLatLng(lat, lng)) return toast("Those coordinates are not valid.");
  const point = { lat, lng, label: label || `${fmt(lat)}, ${fmt(lng)}` };
  const color = kind === "drop" ? "#e5484d" : "#2f6fed";

  if (kind === "drop") {
    drop = point;
    if (dropMarker) map.removeLayer(dropMarker);
    dropMarker = L.marker([lat, lng], { icon: dotIcon(color) }).addTo(map);
  } else {
    pickup = point;
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.marker([lat, lng], { icon: dotIcon(color) }).addTo(map);
  }
  if (fly) map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
  refreshUI();

  // Fill in a friendly address if we only have numbers
  if (!label) {
    point.label = await reverseGeocode(lat, lng);
    refreshUI();
  }
  drawRoute();
}

function refreshUI() {
  $("pickupText").textContent = pickup ? pickup.label : "Not set (Uber will use your current location)";
  $("dropText").textContent = drop ? drop.label : "Tap the map, search, or paste a link";

  const has = !!drop;
  $("coords").hidden = !has;
  $("rides").hidden = !has;
  if (has) {
    $("coordsText").textContent = `${fmt(drop.lat)}, ${fmt(drop.lng)}`;
    $("uberBtn").href = uberLink();
  }
}

// ---------- 6. Route line (OSRM public demo server) ----------
async function drawRoute() {
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  $("routeInfo").hidden = true;
  if (!pickup || !drop) return;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}?overview=full&geometries=geojson`;
    const d = await (await fetch(url)).json();
    const route = d.routes && d.routes[0];
    if (!route) throw new Error("no route");
    routeLine = L.geoJSON(route.geometry, { style: { color: "#0e7c66", weight: 6, opacity: 0.85 } }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });
    $("routeInfo").textContent = `${(route.distance / 1000).toFixed(1)} km · about ${Math.round(route.duration / 60)} min by road`;
    $("routeInfo").hidden = false;
  } catch {
    toast("Couldn't draw the route right now.");
  }
}

// ---------- 7. Ride apps ----------
// Uber's documented deep link: https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction
 function uberLink() {
  const place = (p) =>
    JSON.stringify({
      addressLine1: p.label.split(",")[0],
      addressLine2: p.label,
      latitude: p.lat,
      longitude: p.lng,
    });

  const params = new URLSearchParams();
  if (pickup) {
    params.set("pickup", place(pickup));
  } else {
    params.set("pickup", "my_location");
  }
  params.set("drop[0]", place(drop));
  return "https://m.uber.com/go/product-selection?" + params.toString();
}
 

// Rapido: no public destination deep link exists, so we copy the coordinates and open Rapido.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
$("rapidoBtn").addEventListener("click", async () => {
  const ok = await copyText(`${fmt(drop.lat)}, ${fmt(drop.lng)}`);
  toast(ok ? "Coordinates copied. Paste them into Rapido's destination box." : "Couldn't copy. Use the Copy button above.");
  window.open("https://www.rapido.bike/", "_blank", "noopener");
});
$("copyCoords").addEventListener("click", async () => {
  const ok = await copyText($("coordsText").textContent);
  toast(ok ? "Copied!" : "Couldn't copy on this browser.");
});

// ---------- 8. Search box ----------
const box = $("search"), list = $("suggestions");
let searchTimer;

async function handleInput(text, goNow) {
  // Is it a link or coordinates?
  if (/^https?:\/\//i.test(text) || /^-?\d/.test(text)) {
        if (isShortLink(text)) {
      toast("Reading short link...");
      try {
        const r = await fetch("/resolve?url=" + encodeURIComponent(text));
        const d = await r.json();
        const loc = d.finalUrl && parseLocation(d.finalUrl);
        if (loc) { list.hidden = true; return setPoint("drop", loc.lat, loc.lng); }

        // No coordinates in the link? Fall back to searching the place name.
        const name = d.finalUrl && d.finalUrl.match(/\/place\/([^/@?]+)/);
        if (name) {
          const placeName = decodeURIComponent(name[1].replace(/\+/g, " "));
          box.value = placeName;
          return handleInput(placeName, true);
        }
        toast("Couldn't find a location in that link.");
      } catch {
        toast("Short links need server.py running. Start it with: python server.py");
      }
      return;
    }
    const loc = parseLocation(text);
    if (loc) { list.hidden = true; return setPoint("drop", loc.lat, loc.lng); }
    if (goNow) toast("Couldn't find coordinates in that link.");
    if (/^https?:\/\//i.test(text)) return;
  }
  // Otherwise search by name
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(text)}`);
    const results = await r.json();
    if (goNow && results[0]) return pickResult(results[0]);
    list.innerHTML = "";
    results.forEach((res) => {
      const li = document.createElement("li");
      li.textContent = res.display_name;
      li.addEventListener("click", () => pickResult(res));
      list.appendChild(li);
    });
    list.hidden = results.length === 0;
    if (goNow && !results.length) toast("No places found. Try different words.");
  } catch {
    toast("Search isn't working right now. Check your internet connection.");
  }
}

function pickResult(res) {
  list.hidden = true;
  box.value = res.display_name;
  setPoint("drop", +res.lat, +res.lon, res.display_name);
}

box.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const text = box.value.trim();
  if (text.length < 3) { list.hidden = true; return; }
  searchTimer = setTimeout(() => handleInput(text, false), 400); // wait for typing to pause
});
box.addEventListener("keydown", (e) => { if (e.key === "Enter") handleInput(box.value.trim(), true); });
$("searchBtn").addEventListener("click", () => handleInput(box.value.trim(), true));
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) list.hidden = true; });

// ---------- 9. Map taps, mode switch, current location ----------
map.on("click", (e) => setPoint(mode, e.latlng.lat, e.latlng.lng, null, false));

function setMode(m) {
  mode = m;
  $("modeDrop").classList.toggle("active", m === "drop");
  $("modePickup").classList.toggle("active", m === "pickup");
}
$("modeDrop").addEventListener("click", () => setMode("drop"));
$("modePickup").addEventListener("click", () => setMode("pickup"));

$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) return toast("This browser can't detect location.");
  toast("Finding you...");
  navigator.geolocation.getCurrentPosition(
    (pos) => setPoint("pickup", pos.coords.latitude, pos.coords.longitude),
    () => toast("Location blocked. Allow it in the browser, or tap the map to set pickup."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ---------- 10. Receive a shared location (used later by the Android/PWA share step) ----------
// Example: index.html?text=https://www.google.com/maps/@17.38,78.48,15z   or   ?lat=17.38&lng=78.48
(function readSharedLocation() {
  const q = new URLSearchParams(location.search);
  const lat = parseFloat(q.get("lat")), lng = parseFloat(q.get("lng"));
  if (!isNaN(lat) && !isNaN(lng)) return setPoint("drop", lat, lng);
  const shared = q.get("url") || q.get("text");
  if (shared) {
    box.value = shared;
    handleInput(shared, true);
  }
})();
