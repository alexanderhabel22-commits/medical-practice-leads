// Source 2: OpenStreetMap, through the public Overpass API, used to add
// websites, role-based emails and map coordinates to NPI Registry rows.
// Matching is by phone number, or by name in the same ZIP code.
// Data (c) OpenStreetMap contributors, ODbL licence.

import { fetchJson } from '../http.js';
import { cleanWebsite, companyEmail, formatPhone, phoneDigits, zip5, nameKey, websiteDomain } from '../normalize.js';

export const OSM_SOURCE = 'openstreetmap';

// Public Overpass servers, tried in order. overpass-api.de is often
// unreachable from cloud hosts, so the mail.ru mirror goes first.
export const OVERPASS_ENDPOINTS = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
];

/** Overpass query for tags like ['amenity=dentist'] in { state } or { lat, lon, radiusMiles }. */
export function buildOverpassQuery(tags, area) {
    let prefix = '';
    let filter;
    if (area.state) {
        prefix = `area["ISO3166-2"="US-${area.state}"][admin_level=4]->.a;`;
        filter = '(area.a)';
    } else {
        // A bounding box is much faster on Overpass than around:; rows are
        // matched to NPI records afterwards, so the extra corners do no harm.
        const dLat = area.radiusMiles / 69;
        const dLon = area.radiusMiles / (69 * Math.max(0.2, Math.cos((area.lat * Math.PI) / 180)));
        const f = (n) => n.toFixed(4);
        filter = `(${f(area.lat - dLat)},${f(area.lon - dLon)},${f(area.lat + dLat)},${f(area.lon + dLon)})`;
    }
    const parts = tags.map((t) => {
        const [k, v] = t.split('=');
        return `nwr["${k}"="${v}"]${filter};`;
    });
    return `[out:json][timeout:90];${prefix}(${parts.join('')});out tags center;`;
}

export async function searchOsm(tags, area, { log, fetcher = fetchJson } = {}) {
    const body = new URLSearchParams({ data: buildOverpassQuery(tags, area) }).toString();
    let lastError;
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const data = await fetcher(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                timeoutMs: 120_000,
                retries: 0,
                log,
            });
            return data?.elements ?? [];
        } catch (err) {
            lastError = err;
            log?.debug?.(`OpenStreetMap server ${new URL(endpoint).host} failed: ${err.message}`);
        }
    }
    throw lastError;
}

/** The parts of an OSM element that can enrich a row, or null when it has nothing useful. */
export function mapOsmElement(el) {
    const t = el.tags ?? {};
    const name = t.name || t.brand || null;
    const website = cleanWebsite(t.website || t['contact:website'] || t.url);
    const email = companyEmail(t.email || t['contact:email']);
    const phone = t.phone || t['contact:phone'];
    if (!name && !phoneDigits(phone)) return null;
    if (!website && !email && !el.center && el.lat == null) return null;
    return {
        name,
        nameKey: nameKey(name),
        phoneDigits: phoneDigits(phone),
        phone: formatPhone(phone),
        zip: zip5(t['addr:postcode']),
        website: websiteDomain(website) ? website : null,
        email,
        opening_hours: t.opening_hours || null,
        point: el.center ? [el.center.lat, el.center.lon] : (el.lat != null ? [el.lat, el.lon] : null),
        url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    };
}

/** Index of OSM places by phone and by name+ZIP. */
export class OsmIndex {
    constructor() {
        this.byPhone = new Map();
        this.byNameZip = new Map();
        this.size = 0;
    }

    add(place) {
        if (!place) return;
        this.size++;
        if (place.phoneDigits && !this.byPhone.has(place.phoneDigits)) this.byPhone.set(place.phoneDigits, place);
        if (place.nameKey && place.zip) {
            const k = `${place.nameKey}|${place.zip}`;
            if (!this.byNameZip.has(k)) this.byNameZip.set(k, place);
        }
    }

    /** Best OSM match for a row, or null. */
    match(rec) {
        if (rec._phoneDigits && this.byPhone.has(rec._phoneDigits)) return this.byPhone.get(rec._phoneDigits);
        if (!rec.zip) return null;
        for (const n of [rec.practice_name, rec.legal_name, ...(rec.other_names ?? [])]) {
            const k = `${nameKey(n)}|${rec.zip}`;
            if (nameKey(n) && this.byNameZip.has(k)) return this.byNameZip.get(k);
        }
        return null;
    }
}
