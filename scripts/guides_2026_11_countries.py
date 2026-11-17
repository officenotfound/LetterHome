# -*- coding: utf-8 -*-
"""Canada-to-India/Philippines/Pakistan/Nigeria guides. Each page has its own address detail on purpose.
Postal facts checked 2026-11-17 (Wikipedia, vendor address guides). Nigeria and the Philippines are changing code systems, so those pages say to use whatever code the recipient gives."""

REL_BETWEEN = ("/send-letters-between-countries", "Send Letters Between Countries", "Mail from one country to another without a post office trip")
REL_PROOF = ("/proof-of-mailing", "Proof You Sent a Letter", "What our dated confirmation emails show")
REL_GUIDES = ("/guides", "All Guides", "Every Letterhome guide in one place")
REL_REG = ("/registered-mail-vs-xpresspost", "Registered vs Xpresspost", "When you need a signature on delivery")
REL_SCHED = ("/schedule-a-letter-for-later", "Schedule a Letter for Later", "Pick the date it is mailed")
REL_GRAND = ("/what-to-write-in-a-letter-to-a-grandparent", "Writing to a Grandparent", "What to say when you do not know where to start")
REL_KEEP = ("/keep-in-touch-with-family-abroad-by-mail", "Keep in Touch With Family Abroad", "Letters that last longer than a call")

COUNTRIES = [
 dict(slug="send-a-letter-from-canada-to-india",
  title="Send a Letter From Canada to India: Address, PIN Code, Timing | Letterhome",
  meta_desc="Writing to family in India from Canada: how a PIN code works, how to write village and city addresses, what to expect on timing, and how to order a printed letter online.",
  service_name="International letter mailing", breadcrumb="Send a Letter From Canada to India", eyebrow="Canada to India",
  h1_main="Send a letter from Canada", h1_em="to India.",
  hero_sub="Type it here. We print it, put it in an envelope with postage, and mail it from Canada.",
  cta_label="Send a Letter →",
  answer_box="Write your letter online, enter the full Indian address with its 6-digit PIN code, and pay. We print and mail it from Canada. It is not tracked and no delivery date is promised, so allow several weeks and tell the family to watch for it.",
  steps=[
   ("Get the address exactly as the family writes it", "Ask for it by message and copy it letter for letter. Indian addresses often carry a flat or floor number, a building or society name, and a locality, and each part helps the local post office."),
   ("Check the PIN code", "Six digits, written after the city. A wrong digit can send a letter to the wrong post office, so confirm it rather than guessing."),
   ("Type the letter and order", "The price for India is on the send page before you pay. You get a dated email when the letter is mailed."),
  ],
  warn=None,
  sections=[
   ("What the PIN code tells you", [
    "A PIN (Postal Index Number) has six digits. The first digit is the postal zone, of which India has nine, including one reserved for the army. The next digits narrow it to a sorting district, and the last three point to the delivery post office. Two neighbouring localities can have different PINs, and more than one post office can share a PIN, so do not work one out from a nearby address. Ask the family, or look the locality up on the India Post website.",
   ]),
   ("City addresses and village addresses", [
    "A city address usually runs: name, flat or house number, building or society, street, locality, city and PIN, then the state.",
    "Rural addresses follow a different pattern: name, village, post office (often written \"P.O.\"), tehsil or taluk, district, state, PIN. If your family lives in a village, the post office line matters more than the village name, because the letter is sorted by post office. A landmark and a phone number written under the address help the postman when two houses look alike.",
   ]),
   ("Letters that suit paper", [
    "Printed letters work well for relatives who do not check messages every day, for a rakhi note ahead of Raksha Bandhan, or for a Diwali letter with photos folded in. For anything with a deadline, such as a form, leave a large margin. We cannot promise when it arrives, and a letter that needs a signature on delivery should go by registered post from a Canada Post office, since we do not offer it.",
   ]),
   ("Timing", [
    "Letters from Canada to India go through international mail, which is slower than domestic mail and varies by route and season. There is no tracking. Send early in October for Diwali and in November for Christmas, then phone the family to say it is on the way. We email you the date we mail it, which at least tells you the clock has started.",
   ]),
  ],
  faq=[
   ("Does the letter have to be in English?", "You can write it in the language you like. Check how it looks on screen before you pay, especially for non-Latin scripts. The address should be in English letters, the way the family writes it on their own forms."),
   ("What if the family has no PIN code?", "Everyone has one, even in villages. Ask them to read it from a bank statement, a delivery slip or an Aadhaar card, or look the post office up on the India Post site."),
   ("Is there tracking?", "No. We email you when the letter is mailed, and that is all the record there is."),
   ("Can I include photos?", "Yes. Add them as pages in the letter. Colour printing costs extra and the price is shown before you pay."),
  ],
  related=[REL_KEEP, ("/from-india", "Sending From India to Canada", "The other direction"), REL_REG, REL_GUIDES],
  cta_h2="Write to family in India", cta_p="Type your letter and pay online. We print and mail it from Canada.", cta_final="Send a Letter →"),

 dict(slug="send-a-letter-from-canada-to-the-philippines",
  title="Send a Letter From Canada to the Philippines: Address and Timing | Letterhome",
  meta_desc="Mailing a letter to the Philippines from Canada: where the barangay and ZIP code go, how Metro Manila addresses differ, and what to expect during the Christmas rush.",
  service_name="International letter mailing", breadcrumb="Send a Letter From Canada to the Philippines", eyebrow="Canada to the Philippines",
  h1_main="Send a letter from Canada", h1_em="to the Philippines.",
  hero_sub="Type your letter here. We print it, add the envelope and postage, and mail it from Canada.",
  cta_label="Send a Letter →",
  answer_box="Enter the Philippine address with the barangay, the city or municipality, and the ZIP code placed before the province, then pay online. We print and mail it from Canada. Letters are not tracked and arrival time varies, so send early for Christmas.",
  steps=[
   ("Copy the address from the family", "Ask for the full line, including subdivision or village name and barangay. These are the parts the local carrier actually uses."),
   ("Put the ZIP code before the province", "PHLPost's own sample shows it that way, as in 2000 PAMPANGA. For Manila the province line reads METRO MANILA, as in 1207 METRO MANILA."),
   ("Type the letter and order", "The Philippines price shows on the send page before you pay."),
  ],
  warn=("A change may be coming:", "PHLPost has said it plans an alphanumeric ZIP code. We could not confirm a start date, so use whatever code the family gives you."),
  sections=[
   ("How the address is built", [
    "Name<br>House number, street, subdivision or village<br>Barangay, city or municipality<br>ZIP code and province (or METRO MANILA)<br>PHILIPPINES",
    "The barangay is the smallest local government unit, roughly a neighbourhood, and carriers know their barangay better than the street names. If the family does not have a house number, a purok or sitio name and a landmark fill the gap. Put a phone number underneath as well.",
   ]),
   ("Metro Manila versus the provinces", [
    "In Metro Manila the city is the main identifier, so the last line carries the ZIP and METRO MANILA. Outside it, the province takes that place. A letter to San Fernando, Pampanga and one to San Fernando, La Union needs the province to land in the right one, since there are several San Fernandos.",
   ]),
   ("Christmas starts early", [
    "Filipino families tend to start the holiday season in September, and the mail follows. International mail slows down from November on, and we cannot promise arrival by the 25th. If the letter has to arrive before Christmas, order in the first week of November and tell the family to expect it. Anything later may land in January.",
   ]),
   ("What to put in it", [
    "A letter from abroad often gets read aloud to a whole household. Open with the names of the people it is for, and keep the news in short paragraphs so it is easy to read out loud. Photos can go in as pages. Do not send cash in a letter.",
   ]),
  ],
  faq=[
   ("Do I need the barangay?", "Yes, when the family has one, which is nearly always. It helps the carrier more than the street name does."),
   ("What if the ZIP code is unknown?", "Ask the family or look the city up on the PHLPost site. Four digits is the current format, but check for a newer one."),
   ("Is it tracked?", "No. We email you the date we mailed it."),
   ("Can the letter be in Tagalog?", "Yes. Write in the language you like. The address should be in English letters."),
  ],
  related=[("/from-philippines", "Sending From the Philippines to Canada", "The other direction"), REL_GRAND, REL_SCHED, REL_GUIDES],
  cta_h2="Write to family in the Philippines", cta_p="Type your letter and pay online. We print and mail it from Canada.", cta_final="Send a Letter →"),

 dict(slug="send-a-letter-from-canada-to-pakistan",
  title="Send a Letter From Canada to Pakistan: Address and Postal Code | Letterhome",
  meta_desc="How to address a letter from Canada to Pakistan: sectors, blocks and phases in big-city addresses, the 5-digit postal code, and what to expect for timing and tracking.",
  service_name="International letter mailing", breadcrumb="Send a Letter From Canada to Pakistan", eyebrow="Canada to Pakistan",
  h1_main="Send a letter from Canada", h1_em="to Pakistan.",
  hero_sub="Type your letter here. We print it, add the envelope and postage, and mail it from Canada.",
  cta_label="Send a Letter →",
  answer_box="Enter the full Pakistani address, including the block, sector or phase, with the 5-digit postal code on the city line, and pay online. We print and mail it from Canada. It is not tracked and takes several weeks.",
  steps=[
   ("Ask for the address in the family's own words", "Pakistani addresses depend heavily on the sector, block or phase, and the order matters. Copy what they use on forms."),
   ("Check the postal code", "Five digits, after the city name. Lahore uses 54000 as a general code and Karachi and Islamabad have their own, but neighbourhoods can differ."),
   ("Type the letter and order", "The price for Pakistan is on the send page before you pay."),
  ],
  warn=None,
  sections=[
   ("Writing a big-city address", [
    "Large cities are laid out in blocks, sectors, phases and societies, and the address reads from small to large: house or plot number, street, then block or sector, then the society or area, then the city and postal code.",
    "Name<br>House 12, Street 4<br>Block C, Model Town<br>Lahore 54700<br>PAKISTAN",
    "In Islamabad a typical line is a sector code such as F-7 or G-11, followed by the street and house number. In Karachi, addresses often include a phase, as in DHA Phase 6. The sector or phase is the part a carrier looks for first.",
   ]),
   ("Smaller towns", [
    "Outside the big cities, addresses are looser: house, mohalla (neighbourhood), town or tehsil, district, province. Add a landmark such as a mosque, a school or a market, and the family's phone number. If a letter has no phone number and the street is hard to find, it may sit at the post office.",
   ]),
   ("Eid and other peaks", [
    "Mail volume rises around Eid, and delivery slows with it. A card or a letter for Eid should leave Canada at least a month beforehand, which is still no guarantee. Eid dates move earlier each year on the Gregorian calendar, so check this year's date before you decide when to write.",
   ]),
   ("When you need proof of delivery", [
    "For legal papers, an application or anything where the signature matters, use registered or courier service from a Canada Post office instead. We print and mail letters; we do not offer signed delivery or tracking.",
   ]),
  ],
  faq=[
   ("Is the postal code always five digits?", "Yes, that is the format Pakistan Post uses. Check it with the family because areas inside one city can differ."),
   ("What if the address has no house number?", "Use the name of the lane or building, the mohalla and a landmark, and add the family's phone number."),
   ("Can I send more than one page?", "Yes. Add pages and the price is shown before you pay."),
   ("How do I know it was mailed?", "We email you the date we mailed it. After that it travels as ordinary international mail."),
  ],
  related=[("/from-pakistan", "Sending From Pakistan to Canada", "The other direction"), REL_REG, REL_PROOF, REL_GUIDES],
  cta_h2="Write to family in Pakistan", cta_p="Type your letter and pay online. We print and mail it from Canada.", cta_final="Send a Letter →"),

 dict(slug="send-a-letter-from-canada-to-nigeria",
  title="Send a Letter From Canada to Nigeria: Address and New Postcodes | Letterhome",
  meta_desc="Writing to Nigeria from Canada: how to write the address, why the postcode system changed in October 2026, and what to ask the family before you order.",
  service_name="International letter mailing", breadcrumb="Send a Letter From Canada to Nigeria", eyebrow="Canada to Nigeria",
  h1_main="Send a letter from Canada", h1_em="to Nigeria.",
  hero_sub="Type your letter here. We print it, add the envelope and postage, and mail it from Canada.",
  cta_label="Send a Letter →",
  answer_box="Enter the Nigerian address the way the family writes it, with house, street, area, local government area and state, plus whichever postcode they use. We print and mail it from Canada. It is not tracked and takes several weeks.",
  steps=[
   ("Ask how the family receives mail", "Some households get letters at the door, others collect from a post office or a P.O. box. The right address depends on which."),
   ("Get the postcode they use now", "Nigeria began moving to a new postcode system in October 2026. Ask for the code printed on their latest bill or delivery slip."),
   ("Type the letter and order", "The price for Nigeria shows on the send page before you pay."),
  ],
  warn=("New postcodes:", "according to Wikipedia, NIPOST replaced the six-digit codes with an 11-character alphanumeric system on 1 October 2026. We could not confirm whether the old codes still work, so write whichever code the family gives you."),
  sections=[
   ("The old and the new code", [
    "For years Nigerian postcodes had six digits: the first for one of nine regions, the next two for a dispatch district, the last three for the delivery location. The National Digital Alphanumeric Postcode System, or NDAPS, gives each building an 11-character code that works down to state, local government area, district, area and building. One example given is FC 02 A09 DB 09.",
    "A new system takes time to reach everyone. Your family may know only the old code, or may not know one at all. In either case, a full street address does the main work, and the code goes on as an extra.",
   ]),
   ("Writing the address", [
    "Name<br>House number, street<br>Estate or area, town<br>Local government area, State, postcode<br>NIGERIA",
    "Estate names and area names are used as much as street names, especially in big cities. Where there is no street number, add a plain description such as \"opposite the filling station\", and a phone number the carrier can call.",
   ]),
   ("Christmas and the diaspora season", [
    "December is a heavy month in Nigeria for travel and family visits, and international mail takes longer at the same time. If the letter is a Christmas letter, order in early November and mention it on a call so someone looks for it. A letter that lands in January is still welcome, but do not count on the 25th.",
   ]),
  ],
  faq=[
   ("Will an old six-digit postcode still work?", "We cannot confirm either way. Include the street address in full and add the code the family uses."),
   ("What if the family collects mail from a post office?", "Ask which post office and what name to use. Write that on the address instead of the house."),
   ("Is there tracking?", "No. We email you the date we mailed it."),
   ("Where did you find the October 2026 change?", "From the Wikipedia article on postal codes in Nigeria. Check with NIPOST or the family before relying on the details."),
  ],
  related=[("/from-nigeria", "Sending From Nigeria to Canada", "The other direction"), REL_BETWEEN, REL_PROOF, REL_GUIDES],
  cta_h2="Write to family in Nigeria", cta_p="Type your letter and pay online. We print and mail it from Canada.", cta_final="Send a Letter →"),
]
