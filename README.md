# US Medical Practice & Clinic Leads by Specialty

Find US healthcare organizations by specialty, in any state or around any ZIP code: dental practices, urgent care centers, physical therapy clinics, pharmacies, home health agencies, labs, imaging centers, surgery centers and 40 more categories. Get one clean, deduplicated list of practice locations with phone, fax, address, specialties, NPI number and how long they have been registered. No login, no API key.

The data comes from the official **CMS NPI Registry (NPPES)**, the national list every US healthcare organization that bills insurance must be in, so coverage is far wider than Google Maps or review sites. Only **organizations** are returned, never individual practitioners.

## Who uses it

- **Dental and medical sales reps** (supplies, equipment, devices, software) building a territory list: every dental practice in Ohio, or every orthopedic group within 50 miles of your office.
- **Medical billing, RCM, IT and marketing agencies** looking for practices to pitch, including **brand-new practices** that are still choosing vendors.
- **Healthcare staffing and recruiting firms** mapping clinics, home health agencies and nursing facilities.
- **Labs, pharmacies and DME suppliers** finding referral sources nearby.
- **Analysts** sizing a market: how many urgent care centers or dialysis centers are in each state, and who the multi-location groups are.

## What you get

| practice_name | primary_specialty | phone | fax | city | state | npi | registered_on | same_name_locations |
|---|---|---|---|---|---|---|---|---|
| High Street Smiles | Dentist, General Practice | (614) 555-0100 | (614) 555-0101 | Columbus | OH | 1700000001 | 2011-10-31 | 1 |
| Example Urgent Care LLC | Clinic/Center, Urgent Care | (216) 555-0142 | (216) 555-0143 | Cleveland | OH | 1700000002 | 2025-06-02 | 4 |

*(Illustrative rows.)* Each row also has: legal name and other business names (DBA), every specialty the organization lists, single- or multi-specialty group, street address, ZIP, map coordinates, distance from your ZIP, **all NPIs at that location**, years registered, last update date, **how many locations share the same name** (to tell chains and DSOs from independents), whether it is a department of a larger organization and its parent name, health IT endpoints (FHIR / Direct messaging hosts, which often reveal the EHR vendor), and a link to the official registry page. Where the location is on OpenStreetMap, you also get its **website**, a role email (info@, office@), opening hours and the exact building position.

Typical results: dental practices in Ohio about 2,200 locations in under a minute; behavioral health clinics in Texas about 11,500; urgent care and primary care within 25 miles of Cleveland about 500; surgery centers and dialysis centers in the whole US about 21,800. Almost every row has a phone number and about two thirds have a fax number.

## Categories

Dental practices, orthodontists, oral surgeons, primary care, pediatrics, urgent care, multi-specialty groups, community health centers (FQHC) and rural health clinics, dermatology, cardiology, orthopedics, OB/GYN, gastroenterology, oncology, ENT, urology, neurology, pain management, plastic surgery, allergy, ophthalmology, optometry, podiatry, chiropractic, physical therapy, occupational therapy, speech therapy, audiology and hearing aids, mental and behavioral health, addiction treatment, ABA and autism services, radiology and imaging, ambulatory surgery centers, dialysis, sleep centers, clinical labs, pharmacies, medical equipment (DME) suppliers, orthotics and prosthetics, home health, hospice, skilled nursing, assisted living, hospitals, ambulance and medical transport, acupuncture and massage, dietitians.

## How it works

1. It searches the NPI Registry for organizations in the categories and area you picked. The registry only returns 1,200 rows per search, so big searches are split by ZIP code area until every piece fits. **Nothing is silently cut off**, which is the most common problem with simpler NPI scrapers.
2. It checks each organization's official taxonomy codes, so a "dental practice" really is one (by default its main specialty must match; you can also include organizations that list it as a secondary specialty).
3. Big organizations often hold many NPIs at the same address (departments, billing entities). It merges them into **one row per practice location**, keeping every NPI.
4. It looks the locations up on OpenStreetMap to add websites, opening hours and exact positions where available.

## Input

- **Practice categories**: one or more from the list above.
- **States** (or ALL for the whole US), or a **ZIP code and radius** in miles.
- Optional filters: **only newly registered** organizations (NPI issued in the last N days), **only certain cities**, only with a phone, only with a website.
- **Maximum results**.

## Pricing

You pay per practice location returned, plus a small fee per run. Set a maximum results number or a spending limit and the run stops there.

## Data and privacy

Only organization records from a public government registry, plus public OpenStreetMap data. Individual practitioners (type 1 NPIs) are never requested, and the registry's "authorized official" contact person is never copied. Emails are limited to role mailboxes such as info@ or office@. Nothing behind a login.

## Tips

- Run it monthly with **Only newly registered (days)** set to 31 to get a fresh list of new practices every month.
- For the fullest list in a category, turn off **Primary specialty must match**.
- Websites come from OpenStreetMap and cover a minority of practices, so **Only with a website** shrinks the list a lot.
