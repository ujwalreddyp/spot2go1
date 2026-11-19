# spot2go

Pick or paste a destination, see its latitude/longitude, then open Uber with the drop-off already filled in. For Rapido, the coordinates are copied so you can paste them.

## How to run (no installation needed)
1. Keep `index.html`, `style.css` and `app.js` together in one folder.
2. Double-click `index.html` to open it in Chrome or Edge. You need internet (for map tiles and search).
3. "Use my current location" may be blocked when opened by double-click. If so, run a tiny local server:
   - Install Python, open a terminal in the folder, run `python -m http.server 8000`
   - Visit http://localhost:8000

## What works
- Map, search with suggestions, tap-to-set destination or pickup
- Reads coordinates from full Google Maps links (`@lat,lng`, `!3d..!4d..`, `?q=lat,lng`) and plain "lat, lng"
- Route line, distance and time between pickup and destination
- Uber deep link with pickup and drop-off
- Rapido: copies coordinates and opens rapido.bike (it has no public destination link)

## Known limits
- Short links (`maps.app.goo.gl/...`) cannot be resolved by a browser. This needs a small server, planned for Phase 2.
- Search and routing use free public OpenStreetMap services. They are fine for learning, not for many users.
- Links with only a place name (no coordinates) are not looked up yet.

## Next steps
1. Short-link resolver (tiny server function)
2. Make it an installable PWA with a share target, so WhatsApp can share into RideBridge
3. Android app (Kotlin + Jetpack Compose) with share intents
