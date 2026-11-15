import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, CATEGORY_IDS, codeMatches } from '../src/categories.js';
import { mapNpiResult, searchUrl, searchAll, searchTiled, streetKey, prettyStreet } from '../src/sources/nppes.js';
import { mapOsmElement, OsmIndex, buildOverpassQuery } from '../src/sources/osm.js';
import { Deduper } from '../src/dedupe.js';
import { parseInput, categorize, locationFilter, toOutputRow, collect, rank } from '../src/main.js';
import { npiResult, osmElement } from './fixtures.js';

const quiet = { info() {}, warning() {}, debug() {} };

test('every category has a label, search terms, codes and map tags', () => {
    assert.ok(CATEGORY_IDS.length >= 40);
    for (const id of CATEGORY_IDS) {
        const c = CATEGORIES[id];
        assert.ok(c.label, id);
        assert.ok(c.queries.length, id);
        assert.ok(c.codes.length, id);
        assert.ok(c.osm.every((t) => /^[a-z_:]+=[a-z_]+$/.test(t)), id);
    }
    assert.ok(codeMatches('dental_practices', '1223G0001X'));
    assert.ok(!codeMatches('dental_practices', '207Q00000X'));
});

test('input validation gives plain-language errors and sensible defaults', () => {
    const d = parseInput({ states: ['oh'] });
    assert.deepEqual(d.categories, ['dental_practices']);
    assert.deepEqual(d.states, ['OH']);
    assert.equal(d.primarySpecialtyOnly, true);
    assert.equal(d.findWebsites, true);
    assert.equal(d.maxResults, 1000);
    assert.equal(parseInput({ states: ['ALL'] }).states.length, 52);
    assert.throws(() => parseInput({ categories: ['spaceships'], states: ['OH'] }), /Unknown category/);
    assert.throws(() => parseInput({ states: ['XX'] }), /Unknown state/);
    assert.throws(() => parseInput({}), /at least one state/);
    assert.throws(() => parseInput({ zipCode: '00000' }), /not found/);
    const z = parseInput({ zipCode: '44114', radiusMiles: 10, states: ['OH'] });
    assert.deepEqual(z.states, [], 'a ZIP search ignores states');
});

test('NPI search URLs ask for organizations only', () => {
    const u = new URL(searchUrl({ query: 'Dentist', state: 'OH', postalPrefix: '432', skip: 200 }));
    assert.equal(u.searchParams.get('enumeration_type'), 'NPI-2');
    assert.equal(u.searchParams.get('postal_code'), '432*');
    assert.equal(u.searchParams.get('skip'), '200');
    assert.equal(new URL(searchUrl({ query: 'Dentist', postalPrefix: '43215' })).searchParams.get('postal_code'), '43215');
});

test('NPI record maps to a clean row with no personal details', () => {
    const rec = mapNpiResult(npiResult());
    assert.equal(rec.practice_name, 'High Street Smiles', 'doing-business-as name wins');
    assert.equal(rec.legal_name, 'Example Dental Group LLC');
    assert.equal(rec.phone, '(614) 555-0100');
    assert.equal(rec.fax, '(614) 555-0101');
    assert.equal(rec.street, '100 South High Street, Suite 200');
    assert.equal(rec.city, 'Columbus');
    assert.equal(rec.zip, '43215');
    assert.equal(rec.registered_on, '2011-10-31');
    assert.equal(rec.primary_specialty, 'Dentist, General Practice');
    assert.ok(rec.taxonomy_codes.includes('193400000X'), 'group code kept for matching');
    assert.deepEqual(rec.ehr_endpoints, [{ type: 'direct_messaging', host: 'direct.example-ehr.com' }]);
    const text = JSON.stringify(rec).toLowerCase();
    assert.ok(!text.includes('jane') && !text.includes('5550199') && !text.includes('frontdesk'), 'no authorized official or mailbox');
    assert.equal(mapNpiResult(npiResult({ enumeration_type: 'NPI-1' })), null);
    assert.equal(mapNpiResult(npiResult({ basic: { status: 'D' } })), null);
    assert.equal(mapNpiResult(npiResult({ addresses: [{ address_purpose: 'LOCATION', country_code: 'CA', city: 'TORONTO' }] })), null);
});

test('street keys ignore suites and spelling', () => {
    assert.equal(streetKey('100 South High Street, Suite 200'), '100 S HIGH ST');
    assert.equal(streetKey('100 S. HIGH ST STE 5'), '100 S HIGH ST');
    assert.equal(prettyStreet('1151 S HIGH ST'), '1151 S High St');
    assert.equal(prettyStreet('200 W 3RD AVE'), '200 W 3rd Ave');
});

test('categories: primary vs secondary specialty, and group codes', () => {
    const dentist = mapNpiResult(npiResult());
    assert.deepEqual(categorize(dentist, ['dental_practices']), { matched: ['dental_practices'], primary: true });
    const multi = mapNpiResult(npiResult({
        taxonomies: [
            { code: '207Q00000X', desc: 'Family Medicine', primary: true, taxonomy_group: '193200000X - Multi-Specialty Group' },
            { code: '207RC0000X', desc: 'Cardiovascular Disease', primary: false, taxonomy_group: '193200000X - Multi-Specialty Group' },
        ],
    }));
    assert.deepEqual(categorize(multi, ['cardiology']), { matched: ['cardiology'], primary: false });
    assert.equal(categorize(multi, ['multi_specialty_groups']).primary, true);
});

test('dedupe merges NPIs at one location but not branches sharing a call centre', () => {
    const d = new Deduper();
    const a = mapNpiResult(npiResult());
    a.matched_categories = ['dental_practices'];
    const b = mapNpiResult(npiResult({ number: '1700000002', basic: { organization_name: 'EXAMPLE DENTAL BILLING LLC', organizational_subpart: 'YES', enumeration_date: '2005-01-01' }, other_names: [] }));
    b.matched_categories = ['orthodontists'];
    d.add(a);
    d.add(b);
    assert.equal(d.size, 1, 'same street, ZIP and phone');
    const row = d.rows[0];
    assert.deepEqual(row._npis.sort(), ['1700000001', '1700000002']);
    assert.equal(row.registered_on, '2005-01-01', 'oldest registration kept');
    assert.deepEqual(row.matched_categories.sort(), ['dental_practices', 'orthodontists']);
    assert.equal(row.practice_name, 'High Street Smiles', 'subpart does not replace the practice name');

    const branch = mapNpiResult(npiResult({ number: '1700000003', addresses: [{ address_1: '9 MAIN ST', address_purpose: 'LOCATION', city: 'DUBLIN', country_code: 'US', postal_code: '43017', state: 'OH', telephone_number: '614-555-0100' }], other_names: [], basic: { organization_name: 'OTHER DENTAL INC' } }));
    branch.matched_categories = ['dental_practices'];
    d.add(branch);
    assert.equal(d.size, 2);

    const again = mapNpiResult(npiResult());
    again.matched_categories = ['oral_surgeons'];
    assert.equal(d.add(again), false);
    assert.ok(d.rows[0].matched_categories.includes('oral_surgeons'), 'same NPI from a second search adds its category');
    assert.equal(d.size, 2);
});

test('search pages stop early and empty searches are not errors', async () => {
    let calls = 0;
    const fetcher = async (url) => {
        calls++;
        const skip = Number(new URL(url).searchParams.get('skip'));
        return { result_count: 0, results: skip === 0 ? Array.from({ length: 200 }, (_, i) => ({ number: String(i) })) : skip === 200 ? [{ number: 'x' }] : [] };
    };
    const r = await searchAll({ query: 'Dentist', state: 'OH' }, { fetcher });
    assert.equal(r.results.length, 201);
    assert.equal(r.capped, false);
    const none = await searchAll({ query: 'Dentist' }, { fetcher: async () => ({ Errors: [{ description: 'No taxonomy codes found with entered description' }] }) });
    assert.deepEqual(none.results, []);
    await assert.rejects(searchAll({ query: 'x' }, { fetcher: async () => ({ Errors: [{ description: 'Field state is invalid' }] }) }), /NPI Registry error/);
    assert.ok(calls >= 2);
});

test('a capped search splits into ZIP prefixes', async () => {
    const seen = [];
    const fetcher = async (url) => {
        const u = new URL(url);
        const prefix = u.searchParams.get('postal_code');
        seen.push(prefix);
        // The whole state is "too big"; each 3-digit prefix holds 3 rows.
        if (!prefix) return { results: Array.from({ length: 200 }, (_, i) => ({ number: `s${u.searchParams.get('skip')}-${i}` })) };
        if (u.searchParams.get('skip') !== '0') return { results: [] };
        return { results: [1, 2, 3].map((i) => ({ number: `${prefix}-${i}` })) };
    };
    const r = await searchTiled('Dentist', { state: 'OH', zips: ['43215', '43216', '44114', '45202'], fetcher });
    assert.equal(r.results.length, 9, 'whole-state rows are replaced by the prefix rows');
    assert.deepEqual([...new Set(seen.filter(Boolean))].sort(), ['432*', '441*', '452*']);
});

test('OpenStreetMap places match by phone or by name and ZIP; personal emails dropped', () => {
    const idx = new OsmIndex();
    idx.add(mapOsmElement(osmElement()));
    idx.add(mapOsmElement(osmElement({ id: 2, tags: { name: 'Example Dental Group', 'addr:postcode': '43017', website: 'example-dental.example', email: 'jane.doe@example.com' } })));
    const rec = mapNpiResult(npiResult());
    assert.equal(idx.match(rec).website, 'https://highstreetsmiles.example/');
    const byName = mapNpiResult(npiResult({ addresses: [{ address_1: '9 MAIN ST', address_purpose: 'LOCATION', city: 'DUBLIN', country_code: 'US', postal_code: '43017', state: 'OH', telephone_number: '614-555-0900' }], other_names: [] }));
    const m = idx.match(byName);
    assert.equal(m.website, 'http://example-dental.example/');
    assert.equal(m.email, null, 'personal mailbox dropped');
    assert.equal(mapOsmElement({ type: 'node', id: 1, tags: { amenity: 'dentist' } }), null);
    assert.match(buildOverpassQuery(['amenity=dentist'], { state: 'OH' }), /US-OH/);
    assert.match(buildOverpassQuery(['amenity=dentist'], { lat: 41.5, lon: -81.7, radiusMiles: 10 }), /\(41\.355\d,-81\.89\d+,41\.64\d+,-81\.50\d+\)/);
});

test('date, city and radius filters', () => {
    const now = Date.parse('2026-11-15T00:00:00Z');
    const rec = mapNpiResult(npiResult({ basic: { enumeration_date: '2026-10-01' } }));
    assert.equal(locationFilter(parseInput({ states: ['OH'], registeredWithinDays: 60 }), now).test(rec), true);
    assert.equal(locationFilter(parseInput({ states: ['OH'], registeredWithinDays: 30 }), now).test(rec), false);
    assert.equal(locationFilter(parseInput({ states: ['OH'], cities: ['Dayton'] }), now).test(rec), false);
    assert.equal(locationFilter(parseInput({ states: ['OH'], cities: ['columbus'] }), now).test(rec), true);
    assert.equal(locationFilter(parseInput({ states: ['IN'] }), now).test(rec), false);
    const near = locationFilter(parseInput({ zipCode: '43215', radiusMiles: 5 }), now);
    assert.equal(near.test(rec), true);
    assert.ok(rec._distance < 1);
    assert.equal(locationFilter(parseInput({ zipCode: '44114', radiusMiles: 20 }), now).test(rec), false);
});

test('output rows have a fixed shape and no internal fields', () => {
    const rec = mapNpiResult(npiResult());
    rec.matched_categories = ['dental_practices'];
    const row = toOutputRow(rec, parseInput({ states: ['OH'] }), Date.parse('2026-11-15'));
    assert.equal(row.years_registered, 15);
    assert.equal(row.npi_count, 1);
    assert.equal(row.location_precision, 'zip_code_center');
    assert.ok(!Object.keys(row).some((k) => k.startsWith('_')));
    assert.ok(!JSON.stringify(row).includes('authorized'));
});

test('rank puts primary matches with contact details first', () => {
    const rows = rank([
        { practice_name: 'B', _primaryMatch: false, phone: 'x', website: 'y' },
        { practice_name: 'A', _primaryMatch: true, phone: 'x' },
        { practice_name: 'C', _primaryMatch: true, phone: 'x', website: 'y' },
    ]);
    assert.deepEqual(rows.map((r) => r.practice_name), ['C', 'A', 'B']);
});

test('collect: end to end with fake registry and map servers', async () => {
    const results = [
        npiResult(),
        npiResult({ number: '1700000002', basic: { organization_name: 'EXAMPLE DENTAL BILLING LLC', organizational_subpart: 'YES' }, other_names: [] }),
        npiResult({ number: '1700000003', basic: { organization_name: 'JOHN SMITH' }, other_names: [] }),
        npiResult({ number: '1700000004', taxonomies: [{ code: '207Q00000X', desc: 'Family Medicine', primary: true }, { code: '1223G0001X', desc: 'Dentist', primary: false }], other_names: [], basic: { organization_name: 'FAMILY CARE INC' }, addresses: [{ address_1: '5 ELM ST', address_purpose: 'LOCATION', city: 'COLUMBUS', country_code: 'US', postal_code: '43215', state: 'OH', telephone_number: '614-555-0300' }] }),
        npiResult({ number: '1700000005', other_names: [], basic: { organization_name: 'HOOSIER DENTAL PC' }, addresses: [{ address_1: '1 MAIN ST', address_purpose: 'LOCATION', city: 'INDIANAPOLIS', country_code: 'US', postal_code: '46204', state: 'IN', telephone_number: '317-555-0100' }] }),
    ];
    const nppesFetcher = async (url) => ({ results: new URL(url).searchParams.get('skip') === '0' ? results : [] });
    const osmFetcher = async () => ({ elements: [osmElement()] });
    const { rows, stats } = await collect(parseInput({ states: ['OH'] }), { log: quiet, deadline: null, nppesFetcher, osmFetcher });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].practice_name, 'High Street Smiles');
    assert.equal(rows[0].npi_count, 2);
    assert.equal(rows[0].website, 'https://highstreetsmiles.example/');
    assert.equal(rows[0].email, 'info@highstreetsmiles.example');
    assert.equal(rows[0].location_precision, 'building');
    assert.equal(stats.dropped.person_name, 1);
    assert.equal(stats.dropped.other_specialty, 1, 'dentistry only as a secondary specialty');
    assert.equal(stats.dropped.outside_area_or_date, 1);

    const loose = await collect(parseInput({ states: ['OH'], primarySpecialtyOnly: false, findWebsites: false }), { log: quiet, deadline: null, nppesFetcher });
    assert.equal(loose.rows.length, 2);
    assert.equal(loose.rows[0].practice_name, 'High Street Smiles', 'primary match ranks first');
});

test('collect: slow map server does not hold up the run', async () => {
    const nppesFetcher = async (url) => ({ results: new URL(url).searchParams.get('skip') === '0' ? [npiResult()] : [] });
    const osmFetcher = () => new Promise(() => {}); // never answers
    const t0 = Date.now();
    const { rows, stats } = await collect(parseInput({ states: ['OH'] }), { log: quiet, deadline: null, nppesFetcher, osmFetcher, osmWaitMs: 50 });
    assert.equal(rows.length, 1);
    assert.equal(stats.openstreetmap.timed_out, true);
    assert.ok(Date.now() - t0 < 2000);
});
