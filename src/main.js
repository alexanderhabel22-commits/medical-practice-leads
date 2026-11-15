// US Medical Practice & Clinic Leads: Apify Actor entry point.
//
// 1. Read the input (categories, location, filters).
// 2. Search the NPI Registry for organizations (never individuals) in the
//    picked categories, splitting big searches by ZIP code so nothing is cut off.
// 3. Merge NPIs that are the same practice location, add websites and map
//    points from OpenStreetMap, and push one row per location, charging the
//    "organization" pay-per-event event.

import { pathToFileURL } from 'node:url';
import { Actor, log } from 'apify';
import { CATEGORIES, CATEGORY_IDS, codeMatches } from './categories.js';
import { US_STATES, looksLikePersonName, nameKey } from './normalize.js';
import { zipCentroid, isKnownZip, distanceMiles, zipsInState, zipsWithin } from './geo.js';
import { Deduper } from './dedupe.js';
import { mapPool } from './http.js';
import { searchTiled, mapNpiResult, NPPES_SOURCE } from './sources/nppes.js';
import { searchOsm, mapOsmElement, OsmIndex, OSM_SOURCE } from './sources/osm.js';

export const CHARGE_EVENT = 'organization';
const DAY_MS = 86_400_000;

/** When Apify will stop the run, minus a margin for saving. Null locally. */
export function runDeadline(env = process.env, marginMs = 60_000) {
    const at = Date.parse(env.ACTOR_TIMEOUT_AT ?? env.APIFY_TIMEOUT_AT ?? '');
    return Number.isFinite(at) ? at - marginMs : null;
}

const clampInt = (v, def, lo, hi) => {
    const n = Number(v ?? def);
    return Number.isFinite(n) ? Math.max(lo, Math.min(Math.round(n), hi)) : def;
};

/** Validates and fills defaults. Throws a plain-language message on bad input. */
export function parseInput(raw = {}) {
    const categories = [...new Set((raw.categories ?? ['dental_practices']).filter(Boolean))];
    if (!categories.length) throw new Error('Pick at least one practice category.');
    const bad = categories.filter((c) => !CATEGORIES[c]);
    if (bad.length) throw new Error(`Unknown category: ${bad.join(', ')}. Use one of ${CATEGORY_IDS.join(', ')}.`);

    let states = [...new Set((raw.states ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
    if (states.includes('ALL')) states = Object.keys(US_STATES);
    const badStates = states.filter((s) => !US_STATES[s]);
    if (badStates.length) throw new Error(`Unknown state code: ${badStates.join(', ')}. Use two-letter codes such as OH, or ALL.`);

    const zipCode = raw.zipCode ? String(raw.zipCode).trim().slice(0, 5) : null;
    if (zipCode && !isKnownZip(zipCode)) throw new Error(`ZIP code ${zipCode} was not found. Use a 5-digit US ZIP code.`);
    const radiusMiles = Number(raw.radiusMiles ?? 25);
    if (zipCode && !(radiusMiles > 0 && radiusMiles <= 300)) throw new Error('Radius must be between 1 and 300 miles.');
    if (!zipCode && !states.length) throw new Error('Pick at least one state, or a ZIP code and radius.');

    const cities = [...new Set((raw.cities ?? []).map((c) => String(c).trim().toLowerCase()).filter(Boolean))];

    return {
        categories,
        states: zipCode ? [] : states,
        zipCode,
        radiusMiles,
        cities,
        primarySpecialtyOnly: raw.primarySpecialtyOnly !== false,
        registeredWithinDays: clampInt(raw.registeredWithinDays, 0, 0, 36_500),
        requirePhone: raw.requirePhone === true,
        requireWebsite: raw.requireWebsite === true,
        findWebsites: raw.findWebsites !== false,
        maxResults: clampInt(raw.maxResults, 1000, 1, 200_000),
    };
}

/** Category ids a record belongs to, and whether its primary specialty is one of them. */
export function categorize(rec, categories) {
    const matched = categories.filter((c) => rec.taxonomy_codes.some((code) => codeMatches(c, code)));
    const primary = matched.some((c) => codeMatches(c, rec._primaryCode) || codeMatches(c, rec._primaryGroup));
    return { matched, primary };
}

/** Location and date filters for an input: rec => boolean (sets rec._distance for ZIP searches). */
export function locationFilter(input, now = Date.now()) {
    const centre = input.zipCode ? zipCentroid(input.zipCode) : null;
    const states = new Set(input.states);
    const cities = new Set(input.cities);
    const since = input.registeredWithinDays ? new Date(now - input.registeredWithinDays * DAY_MS).toISOString().slice(0, 10) : null;
    return {
        centre,
        test: (rec) => {
            if (since && !(rec.registered_on && rec.registered_on >= since)) return false;
            if (cities.size && !cities.has(String(rec.city ?? '').toLowerCase())) return false;
            if (centre) {
                const p = zipCentroid(rec.zip);
                if (!p) return false;
                rec._distance = distanceMiles(centre, p);
                return rec._distance <= input.radiusMiles;
            }
            return states.has(rec.state);
        },
    };
}

const yearsSince = (date, now) => (date ? Math.floor((now - Date.parse(date)) / (365.25 * DAY_MS)) : null);

/** Final output row with a fixed field order and no internal fields. */
export function toOutputRow(rec, input, now = Date.now()) {
    const point = rec._osmPoint ?? zipCentroid(rec.zip);
    return {
        practice_name: rec.practice_name,
        legal_name: rec.legal_name,
        other_names: rec.other_names.filter((n) => n !== rec.practice_name && n !== rec.legal_name),
        matched_categories: rec.matched_categories,
        primary_specialty: rec.primary_specialty,
        specialties: rec.specialties,
        organization_kind: rec.organization_kind,
        phone: rec.phone,
        fax: rec.fax,
        website: rec.website ?? null,
        email: rec.email ?? null,
        street: rec.street,
        city: rec.city,
        state: rec.state,
        zip: rec.zip,
        latitude: point ? Math.round(point[0] * 1e5) / 1e5 : null,
        longitude: point ? Math.round(point[1] * 1e5) / 1e5 : null,
        location_precision: rec._osmPoint ? 'building' : (point ? 'zip_code_center' : null),
        distance_miles: input.zipCode && rec._distance != null ? Math.round(rec._distance * 10) / 10 : null,
        npi: rec.npi,
        all_npis: rec._npis,
        npi_count: rec._npis.length,
        registered_on: rec.registered_on,
        years_registered: yearsSince(rec.registered_on, now),
        npi_last_updated: rec.npi_last_updated,
        same_name_locations: rec._sameName ?? 1,
        other_location_count: rec.other_location_count,
        is_subpart: rec.is_subpart,
        parent_organization: rec.parent_organization,
        opening_hours: rec.opening_hours ?? null,
        ehr_endpoints: rec.ehr_endpoints,
        npi_registry_url: `https://npiregistry.cms.hhs.gov/provider-view/${rec.npi}`,
        sources: rec.sources,
        scraped_at: rec.scraped_at,
    };
}

/** Best leads first: a phone and website, primary-specialty match, then nearest, then name. */
export function rank(rows) {
    const score = (r) => (r._primaryMatch ? 10 : 0) + (r.phone ? 4 : 0) + (r.website ? 3 : 0) + (r.is_subpart ? -2 : 0);
    return rows.sort((a, b) => score(b) - score(a)
        || (a._distance ?? 0) - (b._distance ?? 0)
        || String(a.practice_name).localeCompare(String(b.practice_name)));
}

/** Counts rows per organization name, so buyers can tell chains from independents. */
export function countSameName(rows) {
    const counts = new Map();
    const key = (r) => nameKey(r.legal_name || r.practice_name);
    for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
    for (const r of rows) r._sameName = counts.get(key(r));
}

export async function collect(input, { log: logger = log, deadline = runDeadline(), now = Date.now(), nppesFetcher, osmFetcher, osmWaitMs = null } = {}) {
    const outOfTime = () => deadline != null && Date.now() > deadline;
    let warnedTime = false;
    const shouldStop = () => {
        if (!outOfTime()) return false;
        if (!warnedTime) logger.warning('Running out of time: skipping the rest of the searches. Raise the run timeout to get everything.');
        warnedTime = true;
        return true;
    };
    const scrapedAt = new Date(now).toISOString();
    const where = locationFilter(input, now);
    const deduper = new Deduper();
    const stats = {
        [NPPES_SOURCE]: { searches: 0, requests: 0, records_seen: 0, kept: 0, truncated_searches: 0, errors: 0, last_error: null },
        [OSM_SOURCE]: { searches: 0, places: 0, matched: 0, errors: 0, last_error: null },
        dropped: { other_specialty: 0, outside_area_or_date: 0, person_name: 0 },
    };

    // Search areas: each picked state, or the ZIP codes inside the radius.
    const areas = input.zipCode
        ? [{ state: null, zips: zipsWithin(where.centre, input.radiusMiles + 5), label: `${input.radiusMiles} mi of ${input.zipCode}` }]
        : input.states.map((s) => ({ state: s, zips: zipsInState(s), label: s }));
    const queries = [...new Set(input.categories.flatMap((c) => CATEGORIES[c].queries))];
    const jobs = queries.flatMap((query) => areas.map((area) => ({ query, area })));

    const runNppes = async () => {
        logger.info(`NPI Registry: ${jobs.length} searches (${queries.length} specialty terms x ${areas.length} area(s))`);
        await mapPool(jobs, 6, async ({ query, area }) => {
            if (shouldStop()) return;
            const st = stats[NPPES_SOURCE];
            try {
                const { results, requests, truncated } = await searchTiled(query, { state: area.state, zips: area.zips, log: logger, fetcher: nppesFetcher, shouldStop });
                st.searches++;
                st.requests += requests;
                st.truncated_searches += truncated;
                st.records_seen += results.length;
                for (const r of results) {
                    const rec = mapNpiResult(r, scrapedAt);
                    if (!rec) continue;
                    const { matched, primary } = categorize(rec, input.categories);
                    if (!matched.length || (input.primarySpecialtyOnly && !primary)) { stats.dropped.other_specialty++; continue; }
                    if (looksLikePersonName(rec.legal_name) && looksLikePersonName(rec.practice_name)) { stats.dropped.person_name++; continue; }
                    if (!where.test(rec)) { stats.dropped.outside_area_or_date++; continue; }
                    rec.matched_categories = matched;
                    rec._primaryMatch = primary;
                    deduper.add(rec);
                    st.kept++;
                }
            } catch (err) {
                st.errors++;
                st.last_error = err.message;
                logger.warning(`NPI Registry search "${query}" in ${area.label} failed: ${err.message}`);
            }
        });
    };

    // OpenStreetMap: websites and building locations, matched afterwards.
    const osm = new OsmIndex();
    const runOsm = async () => {
        if (!input.findWebsites) return;
        const tags = [...new Set(input.categories.flatMap((c) => CATEGORIES[c].osm))];
        const osmAreas = input.zipCode
            ? [{ lat: where.centre[0], lon: where.centre[1], radiusMiles: input.radiusMiles + 2 }]
            : input.states.map((s) => ({ state: s }));
        // Public Overpass servers allow about one query at a time per IP, so
        // each area is one query (all tags at once) and areas run in turn.
        const osmJobs = osmAreas.map((area) => ({ area, tags }));
        logger.info(`OpenStreetMap: ${osmJobs.length} website lookups`);
        await mapPool(osmJobs, 1, async ({ area, tags: tagList }) => {
            if (shouldStop()) return;
            const st = stats[OSM_SOURCE];
            try {
                const els = await searchOsm(tagList, area, { log: logger, fetcher: osmFetcher });
                st.searches++;
                for (const el of els) {
                    const place = mapOsmElement(el);
                    if (place) { osm.add(place); st.places++; }
                }
            } catch (err) {
                st.errors++;
                st.last_error = err.message;
                logger.warning(`OpenStreetMap lookup in ${area.state ?? 'the radius'} failed (websites will be missing there): ${err.message}`);
            }
        });
    };

    // Website lookups are a bonus: never let a slow map server hold up the run.
    const osmDone = runOsm();
    await runNppes();
    let timer;
    const budget = new Promise((resolve) => { timer = setTimeout(() => resolve('late'), osmWaitMs ?? Math.min(240_000, 30_000 + 20_000 * areas.length)); });
    if (await Promise.race([osmDone.then(() => 'ok'), budget]) === 'late') {
        stats[OSM_SOURCE].timed_out = true;
        logger.warning('OpenStreetMap is slow right now, so some websites may be missing from this run.');
    }
    clearTimeout(timer);

    for (const rec of deduper.rows) {
        const place = osm.match(rec);
        if (!place) continue;
        stats[OSM_SOURCE].matched++;
        if (!rec.website && place.website) rec.website = place.website;
        if (!rec.email && place.email) rec.email = place.email;
        if (!rec.phone && place.phone) rec.phone = place.phone;
        if (place.opening_hours) rec.opening_hours = place.opening_hours;
        // Only trust the OSM point when it is plausibly the same building area.
        const zc = zipCentroid(rec.zip);
        if (place.point && (!zc || distanceMiles(zc, place.point) < 15)) rec._osmPoint = place.point;
        rec.sources.push({ source: OSM_SOURCE, url: place.url });
    }

    let rows = deduper.rows;
    if (input.requirePhone) rows = rows.filter((r) => r.phone);
    if (input.requireWebsite) rows = rows.filter((r) => r.website);
    countSameName(rows);
    return { rows: rank(rows).map((r) => toOutputRow(r, input, now)), stats };
}

async function run() {
    await Actor.init();
    const input = parseInput((await Actor.getInput()) ?? {});
    log.info('Input', input);

    const { rows, stats } = await collect(input);
    const n = stats[NPPES_SOURCE];
    if (rows.length === 0 && n.errors > 0 && n.kept === 0) {
        throw new Error('The NPI Registry could not be reached. See the log for details, and try again in a few minutes.');
    }

    // Respect both maxResults and the spending limit the user set for the run.
    const charging = Actor.getChargingManager();
    const affordable = charging.calculateMaxEventChargeCountWithinLimit(CHARGE_EVENT);
    const limit = Math.min(input.maxResults, Number.isFinite(affordable) ? affordable : Infinity);
    const out = rows.slice(0, limit);
    for (let i = 0; i < out.length; i += 100) {
        const res = await Actor.pushData(out.slice(i, i + 100), CHARGE_EVENT);
        if (res?.eventChargeLimitReached) {
            log.info('Reached the spending limit for this run.');
            break;
        }
    }

    const summary = {
        found: rows.length,
        returned: out.length,
        with_phone: out.filter((r) => r.phone).length,
        with_fax: out.filter((r) => r.fax).length,
        with_website: out.filter((r) => r.website).length,
        sources: stats,
    };
    await Actor.setValue('RUN_SUMMARY', summary);
    log.info('Done', summary);
    await Actor.setStatusMessage(`Found ${rows.length} matching practice locations, returned ${out.length}.`, { isStatusMessageTerminal: true });
    await Actor.exit();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().catch(async (err) => {
        log.error(err.message);
        await Actor.fail(err.message);
    });
}
