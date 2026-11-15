// Plain-language practice categories, mapped to NUCC healthcare provider
// taxonomy codes (the codes every US provider picks when it registers an NPI).
//
// `queries` are the taxonomy descriptions sent to the NPI Registry search
// (it matches any taxonomy on the record). `codes` are code prefixes that a
// record must carry for it to count, which removes loose text matches.
// `osm` lists OpenStreetMap tags used to look up websites for the category.

export const CATEGORIES = {
    dental_practices: { label: 'Dental practices (general and specialty)', queries: ['Dentist'], codes: ['1223'], osm: ['amenity=dentist', 'healthcare=dentist'] },
    orthodontists: { label: 'Orthodontists', queries: ['Orthodontics'], codes: ['1223X0400X'], osm: ['amenity=dentist', 'healthcare=dentist'] },
    oral_surgeons: { label: 'Oral & maxillofacial surgeons', queries: ['Oral and Maxillofacial Surgery'], codes: ['1223S0112X', '204E00000X'], osm: ['amenity=dentist', 'healthcare=dentist'] },
    primary_care: { label: 'Primary care / family medicine practices', queries: ['Family Medicine', 'Internal Medicine', 'Primary Care'], codes: ['207Q', '207R00000X', '208D00000X', '261QP2300X'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    pediatrics: { label: 'Pediatric practices', queries: ['Pediatrics'], codes: ['2080'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    urgent_care: { label: 'Urgent care centers', queries: ['Urgent Care'], codes: ['261QU0200X'], osm: ['amenity=clinic', 'healthcare=clinic'] },
    multi_specialty_groups: { label: 'Multi-specialty medical groups', queries: ['Multi-Specialty'], codes: ['193200000X', '261QM1300X'], osm: ['amenity=doctors', 'amenity=clinic'] },
    community_health_centers: { label: 'Community health centers (FQHC) & rural health clinics', queries: ['Federally Qualified Health Center', 'Rural Health'], codes: ['261QF0400X', '261QR1300X'], osm: ['amenity=clinic', 'healthcare=clinic'] },
    dermatology: { label: 'Dermatology practices', queries: ['Dermatology'], codes: ['207N'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    cardiology: { label: 'Cardiology practices', queries: ['Cardiovascular Disease'], codes: ['207RC0000X', '207RI0011X', '207RC0001X'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    orthopedics: { label: 'Orthopedic practices', queries: ['Orthopaedic Surgery'], codes: ['207X'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    obgyn: { label: "OB/GYN & women's health practices", queries: ['Obstetrics & Gynecology'], codes: ['207V'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    gastroenterology: { label: 'Gastroenterology practices', queries: ['Gastroenterology'], codes: ['207RG0100X'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    oncology: { label: 'Oncology & cancer centers', queries: ['Medical Oncology', 'Hematology & Oncology', 'Radiation Oncology'], codes: ['207RX0202X', '207RH0003X', '2085R0001X', '261QX0200X', '261QX0203X'], osm: ['amenity=doctors', 'amenity=clinic'] },
    ent: { label: 'ENT (otolaryngology) practices', queries: ['Otolaryngology'], codes: ['207Y'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    urology: { label: 'Urology practices', queries: ['Urology'], codes: ['2088'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    neurology: { label: 'Neurology practices', queries: ['Neurology'], codes: ['2084N0400X', '2084N0402X'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    pain_management: { label: 'Pain management clinics', queries: ['Pain Medicine'], codes: ['208VP', '207LP2900X', '261QP3300X'], osm: ['amenity=doctors', 'amenity=clinic'] },
    plastic_surgery: { label: 'Plastic & cosmetic surgery practices', queries: ['Plastic Surgery'], codes: ['2082', '207YS0123X'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    allergy: { label: 'Allergy & immunology practices', queries: ['Allergy & Immunology'], codes: ['207K'], osm: ['amenity=doctors', 'healthcare=doctor'] },
    ophthalmology: { label: 'Ophthalmology practices', queries: ['Ophthalmology'], codes: ['207W'], osm: ['healthcare=optometrist', 'amenity=doctors'] },
    optometry: { label: 'Optometry & eye care practices', queries: ['Optometrist'], codes: ['152W'], osm: ['healthcare=optometrist', 'shop=optician'] },
    podiatry: { label: 'Podiatry practices', queries: ['Podiatrist'], codes: ['213E'], osm: ['healthcare=podiatrist', 'amenity=doctors'] },
    chiropractic: { label: 'Chiropractic clinics', queries: ['Chiropractor'], codes: ['111N'], osm: ['healthcare=chiropractor'] },
    physical_therapy: { label: 'Physical therapy clinics', queries: ['Physical Therapist', 'Physical Therapy'], codes: ['2251', '261QP2000X'], osm: ['healthcare=physiotherapist'] },
    occupational_therapy: { label: 'Occupational therapy practices', queries: ['Occupational Therapist'], codes: ['225X'], osm: ['healthcare=occupational_therapist'] },
    speech_therapy: { label: 'Speech therapy practices', queries: ['Speech-Language Pathologist'], codes: ['235Z'], osm: ['healthcare=speech_therapist'] },
    audiology_hearing: { label: 'Audiology & hearing aid centers', queries: ['Audiologist', 'Hearing Instrument Specialist'], codes: ['231H', '237600000X', '237700000X', '332S00000X', '261QH0700X'], osm: ['healthcare=audiologist', 'shop=hearing_aids'] },
    behavioral_health: { label: 'Mental & behavioral health clinics', queries: ['Mental Health', 'Psychiatry', 'Psychologist', 'Counselor', 'Social Worker'], codes: ['261QM0801X', '261QM0850X', '261QM0855X', '251S00000X', '2084P0800X', '103T', '101Y', '1041', '106H00000X', '283Q00000X', '320800000X'], osm: ['healthcare=psychotherapist', 'healthcare=counselling'] },
    addiction_treatment: { label: 'Addiction & substance use treatment centers', queries: ['Substance Abuse Rehabilitation', 'Addiction'], codes: ['261QR0405X', '324500000X', '2084A0401X', '207QA0401X', '207RA0401X', '101YA0400X', '261QM2800X', '3245S0500X', '276400000X'], osm: ['healthcare=rehabilitation', 'healthcare=counselling'] },
    aba_autism: { label: 'ABA therapy & autism services', queries: ['Behavior Analyst'], codes: ['103K'], osm: ['healthcare=psychotherapist'] },
    radiology_imaging: { label: 'Radiology & imaging centers', queries: ['Radiology', 'Magnetic Resonance Imaging'], codes: ['2085', '261QR0200X', '261QR0206X', '261QR0207X', '261QR0208X', '261QM1200X'], osm: ['healthcare=clinic', 'amenity=clinic'] },
    ambulatory_surgery_centers: { label: 'Ambulatory surgery centers', queries: ['Ambulatory Surgical'], codes: ['261QA1903X'], osm: ['amenity=clinic', 'healthcare=clinic'] },
    dialysis_centers: { label: 'Dialysis centers', queries: ['End-Stage Renal Disease'], codes: ['261QE0700X'], osm: ['healthcare=dialysis', 'amenity=clinic'] },
    sleep_centers: { label: 'Sleep centers', queries: ['Sleep Disorder Diagnostic', 'Sleep Medicine'], codes: ['261QS1200X', '207RS0012X', '2084S0012X', '207QS1201X'], osm: ['amenity=clinic', 'amenity=doctors'] },
    clinical_labs: { label: 'Clinical & medical laboratories', queries: ['Clinical Medical Laboratory'], codes: ['291U'], osm: ['healthcare=laboratory'] },
    pharmacies: { label: 'Pharmacies', queries: ['Pharmacy'], codes: ['3336'], osm: ['amenity=pharmacy', 'healthcare=pharmacy'] },
    dme_suppliers: { label: 'Medical equipment & supply companies (DME)', queries: ['Durable Medical Equipment'], codes: ['332B'], osm: ['shop=medical_supply'] },
    orthotics_prosthetics: { label: 'Orthotics & prosthetics suppliers', queries: ['Prosthetic/Orthotic Supplier', 'Orthotist', 'Prosthetist'], codes: ['335E00000X', '222Z', '224P00000X'], osm: ['shop=medical_supply'] },
    home_health: { label: 'Home health agencies', queries: ['Home Health'], codes: ['251E00000X'], osm: ['healthcare=nurse'] },
    hospice: { label: 'Hospice providers', queries: ['Hospice'], codes: ['251G00000X', '315D00000X'], osm: ['healthcare=hospice'] },
    skilled_nursing: { label: 'Skilled nursing facilities & nursing homes', queries: ['Skilled Nursing Facility', 'Nursing Facility/Intermediate Care Facility'], codes: ['314000000X', '3140N1450X', '313M00000X'], osm: ['amenity=nursing_home', 'social_facility=nursing_home'] },
    assisted_living: { label: 'Assisted living facilities', queries: ['Assisted Living'], codes: ['3104'], osm: ['amenity=social_facility', 'social_facility=assisted_living'] },
    hospitals: { label: 'Hospitals', queries: ['General Acute Care Hospital', 'Psychiatric Hospital', 'Rehabilitation Hospital', 'Long Term Care Hospital', 'Critical Access'], codes: ['282N', '283Q', '283X', '282E', '284300000X', '286500000X'], osm: ['amenity=hospital', 'healthcare=hospital'] },
    ambulance: { label: 'Ambulance & medical transport companies', queries: ['Ambulance', 'Non-emergency Medical Transport'], codes: ['3416', '343900000X', '343800000X'], osm: ['emergency=ambulance_station'] },
    acupuncture_massage: { label: 'Acupuncture & massage therapy clinics', queries: ['Acupuncturist', 'Massage Therapist'], codes: ['171100000X', '225700000X'], osm: ['healthcare=alternative', 'shop=massage'] },
    nutrition_dietitians: { label: 'Dietitian & nutrition practices', queries: ['Dietitian', 'Nutritionist'], codes: ['133V', '133N'], osm: ['healthcare=nutrition_counselling'] },
};

export const CATEGORY_IDS = Object.keys(CATEGORIES);

/** True when a taxonomy code (or group code such as 193200000X) belongs to the category. */
export function codeMatches(categoryId, code) {
    const c = CATEGORIES[categoryId];
    return !!code && c.codes.some((p) => code.startsWith(p));
}
