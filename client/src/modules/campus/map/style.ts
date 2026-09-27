import type { MapLocation } from '../types';

/**
 * Visual language for the campus map: every place belongs to one category, and each category owns a colour and a drawn
 * icon (24×24 stroke paths adapted from Lucide, ISC). Gates carry their real number instead of an icon.
 */
export type Category = 'academic' | 'services' | 'food' | 'sports' | 'prayer' | 'housing' | 'parking' | 'gates';

export const CATEGORIES: Category[] = ['academic', 'services', 'food', 'sports', 'prayer', 'housing', 'parking', 'gates'];

export const CATEGORY_COLOR: Record<Category, string> = {
  academic: '#e0661e',
  services: '#2f6fdb',
  food: '#b7791f',
  sports: '#1f8a5b',
  prayer: '#0f766e',
  housing: '#7c5cd6',
  parking: '#55616f',
  gates: '#1e1b18'
};

const ICON: Record<string, string> = {
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4',
  library: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  hall: 'M2 3h20 M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3 M7 21l5-5 5 5',
  lab: 'M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2 M8.5 2h7 M7 16h10',
  room: 'M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14 M2 20h20 M14 12v.01',
  security: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  service: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M12 16v-4 M12 8h.01',
  entrance: 'M13 4h3a2 2 0 0 1 2 2v14 M2 20h3 M13 20h9 M10 12v.01 M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z',
  cafe: 'M10 2v2 M14 2v2 M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1 M6 2v2',
  mosque: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  sports: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M12 2a14.5 14.5 0 0 0 0 20 M2 12h20',
  housing: 'M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9',
  closed: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M4.9 4.9l14.2 14.2'
};

export function categoryOf(loc: Pick<MapLocation, 'kind' | 'tags' | 'id'>): Category {
  const tags = loc.tags ?? [];
  if (loc.kind === 'gate') return 'gates';
  if (loc.kind === 'parking') return 'parking';
  if (loc.kind === 'mosque') return 'prayer';
  if (loc.kind === 'cafe') return 'food';
  if (loc.kind === 'outdoor' || tags.includes('sports')) return 'sports';
  if (tags.includes('residence')) return 'housing';
  if (loc.kind === 'security' || loc.kind === 'service' || loc.kind === 'entrance') return 'services';
  return 'academic';
}

function iconKey(loc: Pick<MapLocation, 'kind' | 'tags' | 'id'>): string {
  const tags = loc.tags ?? [];
  if (tags.includes('closed')) return 'closed';
  if (tags.includes('residence')) return 'housing';
  if (loc.kind === 'outdoor' || tags.includes('sports')) return 'sports';
  return ICON[loc.kind] ? loc.kind : 'building';
}

/** Number printed on a gate pin ("Gate 3" -> "3"). */
export function gateNumber(loc: Pick<MapLocation, 'name_en'>): string {
  return loc.name_en.match(/Gate\s*(\d+)/i)?.[1] ?? '';
}

/** Display form of a place name: the data uses " — " between parts; the UI shows a middle dot. */
export function placeName(name: string): string {
  return name.replace(/ — /g, ' · ');
}

/** Short on-map label: text before the first separator or " (" so long names stay legible at street zoom. */
export function shortLabel(name: string): string {
  return name.split(/ — | · /)[0].split(' (')[0].trim();
}

/** Places that deserve a permanent label, and the zoom at which it appears. */
export function labelTier(loc: Pick<MapLocation, 'kind' | 'tags' | 'building_id' | 'id'>): 0 | 1 | 2 {
  if (loc.building_id) return 0;
  if (loc.kind === 'junction' || loc.kind === 'entrance') return 0;
  if (loc.kind === 'gate') return 0; // the pin already carries the gate number
  if (['building', 'library', 'hall', 'mosque'].includes(loc.kind) && !(loc.tags ?? []).includes('residence') && !(loc.tags ?? []).includes('closed')) return 1;
  return 2;
}

/** HTML for a map pin. `size` in px; `active` adds a halo ring. */
export function pinHtml(loc: Pick<MapLocation, 'kind' | 'tags' | 'id' | 'name_en'>, active: boolean, size = active ? 34 : 26): string {
  const cat = categoryOf(loc);
  const color = CATEGORY_COLOR[cat];
  const ring = active ? `box-shadow:0 0 0 4px ${color}40,0 6px 16px -4px rgba(20,18,15,.55);` : 'box-shadow:0 3px 10px -3px rgba(20,18,15,.5);';
  if (cat === 'gates') {
    const n = gateNumber(loc);
    return `<div class="uj-pin uj-pin--gate" style="--c:${color};width:${size}px;height:${size}px;${ring}">${n || '·'}</div>`;
  }
  if (cat === 'parking') {
    return `<div class="uj-pin uj-pin--parking" style="--c:${color};width:${size}px;height:${size}px;${ring}">P</div>`;
  }
  const d = ICON[iconKey(loc)];
  const icon = Math.round(size * 0.52);
  return `<div class="uj-pin" style="--c:${color};width:${size}px;height:${size}px;${ring}"><svg width="${icon}" height="${icon}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg></div>`;
}

/** Same pin as a standalone SVG data URL (for Google Maps markers). */
export function pinDataUrl(loc: Pick<MapLocation, 'kind' | 'tags' | 'id' | 'name_en'>, active: boolean): { url: string; size: number } {
  const size = active ? 34 : 26;
  const cat = categoryOf(loc);
  const color = CATEGORY_COLOR[cat];
  const r = size / 2 - 1.5;
  let inner = '';
  if (cat === 'gates' || cat === 'parking') {
    const txt = cat === 'gates' ? gateNumber(loc) || '·' : 'P';
    inner = `<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="${size * 0.46}" font-weight="700" fill="#fff">${txt}</text>`;
  } else {
    const s = size * 0.52 / 24;
    inner = `<g transform="translate(${size / 2 - 12 * s},${size / 2 - 12 * s}) scale(${s})" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[iconKey(loc)]}"/></g>`;
  }
  const shape = cat === 'gates' ? `<rect x="1.5" y="1.5" width="${size - 3}" height="${size - 3}" rx="${size * 0.28}" fill="${color}" stroke="#fff" stroke-width="2"/>` : `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}" stroke="#fff" stroke-width="2"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${shape}${inner}</svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, size };
}

export type Basemap = 'map' | 'satellite';

const CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const TILES = {
  light: { url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: CARTO_ATTR, subdomains: '', maxNativeZoom: 20 },
  dark: { url: 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png', attribution: CARTO_ATTR, subdomains: '', maxNativeZoom: 20 },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', subdomains: '', maxNativeZoom: 19 }
} as const;

/** CARTO basemaps need an API key on every tile request; it comes from the server config, never from source. */
export function tileUrl(t: (typeof TILES)[keyof typeof TILES], cartoKey: string | null): string {
  return cartoKey && t.url.includes('basemaps.cartocdn.com') ? `${t.url}?key=${encodeURIComponent(cartoKey)}` : t.url;
}

/** Parking availability colours (always paired with a word and a count; never colour alone). */
export const PARKING_LEVEL_COLOR = { available: '#2e9e6b', limited: '#c8860b', full: '#c2410c', no_data: '#8f857b' } as const;
