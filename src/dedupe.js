// Merges NPI records that describe the same practice location.
//
// Big organizations often hold many NPIs (one per department, subpart or
// billing entity) at the same address. Two records are the same location when
// they share street + ZIP + phone, or the same cleaned-up name at the same
// street + ZIP, or the same name and phone. Phone alone is not enough: a
// health system's central scheduling number covers many locations.

import { nameKey } from './normalize.js';

function keysFor(rec) {
    const keys = [];
    const s = rec._streetKey;
    const z = rec.zip;
    const p = rec._phoneDigits;
    const names = [...new Set([rec.practice_name, rec.legal_name].map(nameKey).filter(Boolean))];
    if (s && z && p) keys.push(`a:${s}|${z}|${p}`);
    for (const n of names) {
        if (s && z) keys.push(`n:${n}|${s}|${z}`);
        if (p) keys.push(`p:${n}|${p}`);
    }
    return keys;
}

const UNION_FIELDS = ['other_names', 'taxonomy_codes', 'specialties', 'matched_categories', '_npis'];
const union = (a = [], b = []) => [...new Set([...a, ...b])];

function merge(into, from) {
    // Prefer the record whose name is a practice name over a department or
    // billing subpart, and keep the other names.
    if (into.is_subpart && !from.is_subpart) {
        for (const k of ['practice_name', 'legal_name', 'primary_specialty', 'primary_taxonomy_code', 'organization_kind', 'npi', '_primaryCode', '_primaryGroup', '_primaryMatch']) {
            if (from[k] != null) [into[k], from[k]] = [from[k], into[k]];
        }
        into.is_subpart = false;
    }
    for (const n of [from.practice_name, from.legal_name]) {
        if (n && n !== into.practice_name && n !== into.legal_name) into.other_names = union(into.other_names, [n]);
    }
    for (const [k, v] of Object.entries(from)) {
        if (into[k] == null || into[k] === '' || (Array.isArray(into[k]) && !into[k].length)) into[k] = v;
    }
    for (const f of UNION_FIELDS) into[f] = union(into[f], from[f]);
    into._primaryMatch = into._primaryMatch || from._primaryMatch;
    // Oldest registration date tells how long the practice has existed.
    if (from.registered_on && (!into.registered_on || from.registered_on < into.registered_on)) into.registered_on = from.registered_on;
    if (from.npi_last_updated && (!into.npi_last_updated || from.npi_last_updated > into.npi_last_updated)) into.npi_last_updated = from.npi_last_updated;
    into.other_location_count = Math.max(into.other_location_count ?? 0, from.other_location_count ?? 0);
    const hosts = new Set(into.ehr_endpoints.map((e) => `${e.type}|${e.host}`));
    for (const e of from.ehr_endpoints ?? []) if (!hosts.has(`${e.type}|${e.host}`)) into.ehr_endpoints.push(e);
    const seen = new Set(into.sources.map((s) => s.url));
    for (const s of from.sources) if (!seen.has(s.url)) into.sources.push(s);
}

export class Deduper {
    constructor() {
        this.rows = [];
        this.index = new Map();
        this.byNpi = new Set();
    }

    /** Adds a record; returns true when it was new. The same NPI twice is ignored. */
    add(rec) {
        if (rec._npis.every((n) => this.byNpi.has(n)) && rec._npis.length === 1) {
            // Seen from another search (a second category or tile): just add categories.
            const i = this.index.get(`npi:${rec._npis[0]}`);
            if (i !== undefined) {
                this.rows[i].matched_categories = union(this.rows[i].matched_categories, rec.matched_categories);
                this.rows[i]._primaryMatch = this.rows[i]._primaryMatch || rec._primaryMatch;
            }
            return false;
        }
        const keys = keysFor(rec);
        const hit = keys.map((k) => this.index.get(k)).find((i) => i !== undefined);
        let at;
        if (hit === undefined) {
            const copy = { ...rec, sources: [...rec.sources], ehr_endpoints: [...(rec.ehr_endpoints ?? [])] };
            for (const f of UNION_FIELDS) copy[f] = [...(rec[f] ?? [])];
            this.rows.push(copy);
            at = this.rows.length - 1;
        } else {
            merge(this.rows[hit], rec);
            at = hit;
        }
        for (const k of keysFor(this.rows[at])) if (!this.index.has(k)) this.index.set(k, at);
        for (const n of rec._npis) {
            this.byNpi.add(n);
            this.index.set(`npi:${n}`, at);
        }
        return hit === undefined;
    }

    get size() {
        return this.rows.length;
    }
}
