// Shapes copied from real NPI Registry API v2.1 and Overpass responses,
// with made-up names, numbers and addresses.

export function npiResult(over = {}) {
    const base = {
        number: '1700000001',
        enumeration_type: 'NPI-2',
        basic: {
            authorized_official_first_name: 'JANE',
            authorized_official_last_name: 'EXAMPLE',
            authorized_official_telephone_number: '6145550199',
            authorized_official_title_or_position: 'Owner',
            enumeration_date: '2011-10-31',
            last_updated: '2020-01-02',
            organization_name: 'EXAMPLE DENTAL GROUP LLC',
            organizational_subpart: 'NO',
            status: 'A',
        },
        addresses: [
            { address_1: '100 SOUTH HIGH STREET', address_2: 'SUITE 200', address_purpose: 'LOCATION', city: 'COLUMBUS', country_code: 'US', postal_code: '432150001', state: 'OH', telephone_number: '614-555-0100', fax_number: '614-555-0101' },
            { address_1: 'PO BOX 1', address_purpose: 'MAILING', city: 'COLUMBUS', country_code: 'US', postal_code: '43216', state: 'OH', telephone_number: '614-555-0100' },
        ],
        other_names: [{ code: '3', organization_name: 'HIGH STREET SMILES', type: 'Doing Business As' }],
        taxonomies: [{ code: '1223G0001X', desc: 'Dentist, General Practice', primary: true, state: 'OH', license: '123', taxonomy_group: '193400000X - Single Specialty Group' }],
        endpoints: [{ endpointType: 'DIRECT', endpointTypeDescription: 'Direct Messaging Address', endpoint: 'frontdesk@direct.example-ehr.com' }],
        practiceLocations: [],
    };
    return {
        ...base,
        ...over,
        basic: { ...base.basic, ...(over.basic ?? {}) },
    };
}

export function osmElement(over = {}) {
    return {
        type: 'node',
        id: 123,
        lat: 39.96,
        lon: -83.0,
        tags: { amenity: 'dentist', name: 'High Street Smiles', phone: '+1 614 555 0100', website: 'https://highstreetsmiles.example', email: 'info@highstreetsmiles.example', 'addr:postcode': '43215', opening_hours: 'Mo-Fr 08:00-17:00' },
        ...over,
    };
}
