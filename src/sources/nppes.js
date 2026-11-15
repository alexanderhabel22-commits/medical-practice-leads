// Source 1: the CMS NPI Registry (NPPES), through its public JSON API.
//
// Every US healthcare organization that bills insurance has an NPI. Type 2
// NPIs are organizations (clinics, practices, labs, pharmacies, suppliers);
// type 1 are individual practitioners, which this Actor never requests.
// The API returns at most 200 rows per page and 1,200 rows per search, so
// big searches are split by ZIP code prefix until each piece fits.
// API docs: https://npiregistry.cms.hhs.gov/api-page

import { fetchJson, mapPool } from '../http.js';
import { formatPhone, phoneDigits, prettyName, zip5 } from '../normalize.js';

export const NPPES_SOURCE = 'npi_registry';
export const NPPES_API = 'https://npiregistry.cms.hhs.gov/api/';
export const PAGE_SIZE = 200;
export const MAX_PER_SEARCH = 1200; // API limit: skip may not exceed 1,000

export function searchUrl({ query, state, postalPrefix, skip = 0 }) {
    const u = new URL(NPPES_API);
    u.searchParams.set('version', '2.1');
    u.searchParams.set('enumeration_type', 'NPI-2');
    u.searchParams.set('taxonomy_description', query);
    if (state) u.searchParams.set('state', state);
    if (postalPrefix) u.searchParams.set('postal_code', postalPrefix.length < 5 ? `${postalPrefix}*` : postalPrefix);
    u.searchParams.set('limit', String(PAGE_SIZE));
    u.searchParams.set('skip', String(skip));
    return u.href;
}

/** All pages of one search (up to the 1,200 API cap). Returns { results, capped, requests }. */
export async function searchAll(params, { log, fetcher = fetchJson } = {}) {
    const get = async (skip) => {
        const data = await fetcher(searchUrl({ ...params, skip }), { log, timeoutMs: 45_000 });
        if (data?.Errors?.length) {
            const msg = data.Errors.map((e) => e.description).join('; ');
            // "No taxonomy codes found" just means nothing matched.
            if (/no taxonomy codes found/i.test(msg)) return [];
            throw new Error(`NPI Registry error: ${msg}`);
        }
        return data?.results ?? [];
    };
    const first = await get(0);
    if (first.length < PAGE_SIZE) return { results: first, capped: false, requests: 1 };
    // A full first page: fetch the other five pages at once.
    const skips = [];
    for (let s = PAGE_SIZE; s < MAX_PER_SEARCH; s += PAGE_SIZE) skips.push(s);
    const rest = await Promise.all(skips.map(get));
    const results = [first, ...rest].flat();
    return { results, capped: results.length >= MAX_PER_SEARCH, requests: 1 + skips.length };
}

/**
 * Searches one query over an area, splitting by ZIP prefix whenever the API
 * cap is hit. `zips` is the list of ZIP codes the area covers; it decides
 * which prefixes are worth searching. `state` (optional) is passed to the API.
 * Up to `parallel` pieces run at once.
 */
export async function searchTiled(query, { state = null, zips, log, fetcher, shouldStop = () => false, parallel = 4 } = {}) {
    const all = [];
    let requests = 0;
    let truncated = 0;
    const children = (prefix) => {
        const len = prefix.length === 0 ? 3 : prefix.length + 1;
        return [...new Set(zips.filter((z) => z.startsWith(prefix)).map((z) => z.slice(0, len)))].sort();
    };
    const runTile = async (prefix) => {
        if (shouldStop()) return;
        const { results, capped, requests: n } = await searchAll({ query, state, postalPrefix: prefix || null }, { log, fetcher });
        requests += n;
        if (capped && prefix.length < 5) {
            const next = children(prefix);
            if (next.length) {
                await mapPool(next, parallel, runTile);
                return;
            }
        }
        if (capped) truncated++;
        all.push(...results);
    };
    // With a state, try the whole state first; without one, start at 3-digit prefixes.
    if (state) await runTile('');
    else await mapPool(children(''), parallel, runTile);
    return { results: all, requests, truncated };
}

const STREET_WORDS = {
    STREET: 'ST', AVENUE: 'AVE', ROAD: 'RD', DRIVE: 'DR', BOULEVARD: 'BLVD', LANE: 'LN', COURT: 'CT',
    PLACE: 'PL', PARKWAY: 'PKWY', HIGHWAY: 'HWY', CIRCLE: 'CIR', TERRACE: 'TER', SQUARE: 'SQ', TRAIL: 'TRL',
    NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
};

/** "1151 South High Street, Suite 200" -> "1151 S HIGH ST" (for matching only). */
export function streetKey(street) {
    if (!street) return '';
    return String(street)
        .toUpperCase()
        .replace(/[.,#]/g, ' ')
        .replace(/\b(SUITE|STE|UNIT|APT|BLDG|BUILDING|FLOOR|FL|RM|ROOM)\b.*$/, '')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => STREET_WORDS[w] ?? w)
        .join(' ')
        .trim();
}

/** "1151 S HIGH ST" -> "1151 S High St". */
export function prettyStreet(value) {
    if (!value) return null;
    const v = String(value).trim().replace(/\s+/g, ' ');
    if (v !== v.toUpperCase()) return v;
    return v.toLowerCase().replace(/\b([a-z])([a-z]*)/g, (m, a, b) => {
        const w = (a + b).toUpperCase();
        if (/^(N|S|E|W|NE|NW|SE|SW|PO|US|SR|CR|FM)$/.test(w)) return w;
        return a.toUpperCase() + b;
    }).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, n, s) => n + s.toLowerCase());
}

export function prettyCity(value) {
    if (!value) return null;
    const v = String(value).trim();
    return v === v.toUpperCase() ? v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : v;
}

/** "2011-10-31" stays; other date shapes become ISO dates or null. */
function isoDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function endpointHost(url) {
    if (!url) return null;
    try {
        return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    } catch {
        const at = String(url).split('@')[1];
        return at ? at.toLowerCase() : null;
    }
}

const ENDPOINT_TYPES = { DIRECT: 'direct_messaging', FHIR: 'fhir', CONNECT: 'connect', SOAP: 'soap', REST: 'rest', WEB: 'web', OTHERS: 'other' };

/**
 * Turns one NPI Registry result into our internal record, or null when it is
 * not an active organization. Authorized-official names and phone numbers
 * (a person's details) are never copied.
 */
export function mapNpiResult(r, scrapedAt = new Date().toISOString()) {
    if (!r || r.enumeration_type !== 'NPI-2') return null;
    const b = r.basic ?? {};
    if (b.status && b.status !== 'A') return null;
    const loc = (r.addresses ?? []).find((a) => a.address_purpose === 'LOCATION') ?? r.addresses?.[0];
    if (!loc || (loc.country_code && loc.country_code !== 'US')) return null;

    const legal = prettyName(b.organization_name);
    const others = r.other_names ?? [];
    const dba = others.filter((o) => String(o.code) === '3' && o.organization_name).map((o) => prettyName(o.organization_name));
    const otherNames = others.filter((o) => o.organization_name).map((o) => prettyName(o.organization_name));

    const taxonomies = (r.taxonomies ?? []).filter((t) => t.code);
    const primary = taxonomies.find((t) => t.primary) ?? taxonomies[0] ?? null;
    const groupCodes = taxonomies.map((t) => String(t.taxonomy_group ?? '').match(/^\s*(\w{10})/)?.[1]).filter(Boolean);
    const groupLabel = String(primary?.taxonomy_group ?? '').replace(/^\s*\w{10}\s*-\s*/, '').trim() || null;

    const endpoints = (r.endpoints ?? [])
        .map((e) => ({ type: ENDPOINT_TYPES[String(e.endpointType ?? '').toUpperCase()] ?? (String(e.endpointTypeDescription ?? e.endpointType ?? '').toLowerCase() || 'other'), host: endpointHost(e.endpoint) }))
        .filter((e) => e.host);

    const street = [loc.address_1, loc.address_2].filter(Boolean).join(', ');
    return {
        npi: String(r.number),
        practice_name: dba[0] ?? legal,
        legal_name: legal,
        other_names: [...new Set(otherNames.filter((n) => n !== (dba[0] ?? legal)))],
        primary_specialty: primary?.desc ?? null,
        primary_taxonomy_code: primary?.code ?? null,
        taxonomy_codes: [...new Set([...taxonomies.map((t) => t.code), ...groupCodes])],
        specialties: [...new Set(taxonomies.map((t) => t.desc).filter(Boolean))],
        organization_kind: groupLabel,
        phone: formatPhone(loc.telephone_number),
        fax: formatPhone(loc.fax_number),
        street: prettyStreet(street),
        city: prettyCity(loc.city),
        state: loc.state ?? null,
        zip: zip5(loc.postal_code),
        registered_on: isoDate(b.enumeration_date),
        npi_last_updated: isoDate(b.last_updated),
        is_subpart: b.organizational_subpart === 'YES',
        parent_organization: prettyName(b.parent_organization_legal_business_name) ?? null,
        other_location_count: (r.practiceLocations ?? []).length,
        ehr_endpoints: endpoints,
        sources: [{ source: NPPES_SOURCE, url: `https://npiregistry.cms.hhs.gov/provider-view/${r.number}` }],
        scraped_at: scrapedAt,
        _npis: [String(r.number)],
        _phoneDigits: phoneDigits(loc.telephone_number),
        _streetKey: streetKey(loc.address_1),
        _primaryCode: primary?.code ?? null,
        _primaryGroup: String(primary?.taxonomy_group ?? '').match(/^\s*(\w{10})/)?.[1] ?? null,
    };
}
