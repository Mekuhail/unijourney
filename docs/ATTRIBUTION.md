# Third-party attribution

Attribution records sources; it is not a license grant for original project code or permission to redistribute
team-supplied assets. See `OPEN_SOURCE_RELEASE.md` before publishing this repository.

* **React Bits** (https://reactbits.dev, © David Haz) — MIT + Commons Clause License Condition v1.0. Components vendored in
  `client/src/components/reactbits/` and used as part of this application (not redistributed standalone).
* **OpenStreetMap** — © OpenStreetMap contributors, ODbL. Riyadh campus boundary (way 221634202), building footprints
  and paths bundled in `server/seed/data/riyadh-osm.json` / `riyadh-boundary.json`. Khobar district node used only as an
  approximate centre.
* **Map tiles**: CARTO basemaps (Voyager / Dark Matter, © CARTO, data © OpenStreetMap contributors) and Esri World Imagery (© Esri, Maxar, Earthstar Geographics) — attribution shown on the map.
* **Campus map (Riyadh)**: building names, gates, parking and room numbers from the annotated YU campus map supplied by the team (`server/seed/data/riyadh-campus-annotated.jpg`), georeferenced to OpenStreetMap.
* **Map icons**: stroke paths adapted from Lucide (ISC).
* **Leaflet** (BSD-2-Clause), **motion** (MIT), **GSAP** (Standard "no charge" license, all plugins), **lucide-react** (ISC),
  **Tailwind CSS** (MIT), **React / React DOM** (MIT), **react-router** (MIT), **Express** (MIT), **Zod** (MIT), **ogl** (MIT),
  **qrcode.react** (ISC), **multer** (MIT), **@googlemaps/js-api-loader** (Apache-2.0).
* **Al Yamamah University** public documents: BSE study plan V9.8 (Aug 2026) and BCNE study plan V.2 (Aug 2026) transcribed
  into `server/seed/data/yu-curriculum.md` for the demo curriculum; program pages linked in the admission explorer. The
  prototype is not an official university system.
* Reference projects supplied with the brief were inspected for workflow ideas only:
  study-planner (AGPL-3.0-or-later — not copied; planner logic implemented independently), all-clubs-community (no
  license found — membership-state idea only), Smart-Campus-Navigation-System (README claims MIT, no license file —
  routing written independently), JobRADAR (no license — discovery/alert ideas only), AI Job Tracker (MIT — status
  taxonomy and no-downgrade rule reused as a pattern, credited in code comments), YU Claimed video (workflow reference;
  no personal data reused).
