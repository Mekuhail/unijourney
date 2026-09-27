# Parking occupancy on the campus map

September 2026. The campus map has a **Parking** view (`/campus/map?view=parking`). It shows how many spaces are free in each lot and, zoomed in, the state of each bay, as if the bays had sensors. The sensors are simulated in this prototype.

## Prior art

| Source | What we took |
|---|---|
| [SmartPark](https://github.com/gillmreet01/SmartPark) (MIT) | One simulated sensor per bay, shown in a colour-coded grid. Sensors can fail. |
| [ParkAPI](https://github.com/offenesdresden/ParkAPI) / [ParkAPI2](https://github.com/ParkenDD/ParkAPI2) (MIT) | Lot status includes an explicit "no data" state. We keep when a reading was measured separate from when it was fetched. |
| [FIWARE Smart Data Models: Parking](https://github.com/smart-data-models/dataModel.Parking) | Bay status is `free`, `occupied`, `closed` or `unknown`. Lots carry total and available spot counts. `occupancyDetectionType` is either one sensor per bay or entry/exit counting ("balancing"). |
| [DATEX II](https://docs.datex2.eu/v3.2/general/index.html), [APDS](https://allianceforparkingdatastandards.org/specifications/) | Fixed lot data is kept separate from live status. The hierarchy runs from site to zone to space. |
| [OpenStreetMap](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dparking) | `amenity=parking`, `capacity`, `capacity:disabled`, and `parking_space=disabled` for individual bays. OSM has no tag for live occupancy. |
| [Melbourne bay-sensor open data](https://data.melbourne.vic.gov.au/explore/dataset/on-street-parking-bay-sensors/) | Sensor readings can arrive late, so each lot shows "updated N min ago". |
| [Clemson Tigers Commute](https://news.clemson.edu/real-time-parking-availability-now-live-in-tigerscommute-app-website/) | A free count per lot, and a per-bay view where colour is not the only cue. |
| [Smart-campus study](https://arxiv.org/pdf/2111.04085) | Arrivals rise steeply from 6 am, peak from 8 to 10 am, then taper. Lots near teaching buildings fill first. |

## What is built

**Lots**

- Five Riyadh lots use the outlines already traced from the annotated campus map.
- Bays are 2.5 × 5 m at 90°, in back-to-back rows with 6 m aisles, generated with the same pixel-to-map transform, so they follow the map's rotation. That gives 573 spaces across Riyadh: 72 + 42 + 137 + 62 + 200 bays, plus 60 at Najd.
- Najd Parking has a point but no outline, so it uses a gate counter instead of bay sensors.
- Khobar has a synthetic 60 × 42 m lot (the Khobar map itself is approximate).

**Bay types**

- Accessible bays are next to the entrance and drawn with a blue outline.
- There are 2 EV bays in Main Parking 1.
- Some bays are for visitors or staff, depending on the lot. Each lot shows its audience: Students, Staff, Visitors, or Visitors & staff.

**Simulation**

- The state is a deterministic function of the bay, the date and the time, so the same inputs always give the same answer.
  - Each audience has its own arrival peak and a log-normal length of stay.
  - Bays near the entrance fill first, and cars turn over in the afternoon.
  - The lot by the mosque briefly fills for the midday (Dhuhr) prayer.
- About 1.5% of sensors miss a heartbeat in each half hour; those bays show "no signal" rather than a guess.
- Friday and Saturday are quiet.

**Lot status**

- **Available:** more than 20% of spaces free.
- **Limited:** 20% or fewer free.
- **Full:** at most 5% free, or 2 bays.
- **No data:** more than 25% of sensors silent.
- A trend is taken from the last 15 minutes: filling, emptying or steady.
- "Likely full by HH:MM" is labelled as an estimate.

**Walking time**

The walk from each lot to your next class, or to any building you pick, uses the campus router.

**Replay**

A slider and a "Play the day" button step through 06:00 to 21:00 in 15-minute ticks, so you can watch the lots fill and empty. "Back to live" returns to the demo clock.

**Accessibility**

- Every status is a word plus a count (for example "21 free" or "Full"), with colour as a secondary cue.
- The list panel is the accessible equivalent of the map.
- The legend covers bay states and accessible bays.
- Bays have tooltips, and the lot pills are reachable with the keyboard.

**Campus security** can close a bay (for example for maintenance or an event delivery) and reopen it. This is enforced in the API.

## Data safety

- Two new tables: `parking_lots` and `parking_bays`.
- They are filled on the Fly volume by the one-time `parking-v1` migration (`INSERT OR IGNORE`, fixed ids).
- `SEED_VERSION` is unchanged, so no reseed.

## Replacing the simulation with real sensors

The API shape stays the same (`GET /api/campus/map/parking`). Only the source of each bay's status changes:

- Store readings in a `parking_readings` table: bay, status, `observed_at`, and a heartbeat timestamp.
- Take the latest reading per bay.
- Report `unknown` when a heartbeat is overdue, for example after 15 minutes.
