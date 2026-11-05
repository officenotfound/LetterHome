'use strict';
// Per-destination print and price rules. Zones come from PostGrid's letter design guidelines
// (postgrid.readme.io/docs/design-and-templates), in inches from the page's top-left corner.

const PAGE_SIZES = {
  us_letter: { w: 612, h: 792 },        // 8.5 x 11 in
  a4:        { w: 595.28, h: 841.89 },  // 8.27 x 11.69 in (PostGrid quotes 8.3 x 11.7)
};

// layout: how PostGrid stamps the addresses, used to draw the customer preview.
const DESTINATIONS = {
  CA: {
    name: 'Canada', size: 'us_letter',
    priceKey: 'price_domestic_cents', defaultPrice: 600,
    layout: 'ca_two_windows',
    zones: { from: [0.375, 0.75, 4, 0.9375], to: [0.875, 2.25, 4, 1] },
    services: { registered: { mailingClass: 'registered', priceKey: 'svc_ca_registered_cents', defaultPrice: 6200 },
                express:    { mailingClass: 'express',    priceKey: 'svc_ca_express_cents',    defaultPrice: 8600 } },
  },
  US: {
    name: 'United States', size: 'us_letter',
    priceKey: 'price_usa_cents', defaultPrice: 600,
    layout: 'us_stacked',                                  // sender upper half, recipient lower half
    zones: { block: [0.5, 0.2, 3.25, 2.6] },
    bottomLeftReserved: [0.6, 0.6],                        // 2D barcode + serial number added at print time
    services: { certified: { mailingClass: 'certified', priceKey: 'svc_us_certified_cents', defaultPrice: 1700 },
                express:   { mailingClass: 'express',   priceKey: 'svc_us_express_cents',   defaultPrice: 4700 } },
  },
  GB: {
    name: 'United Kingdom', size: 'a4',
    priceKey: 'price_uk_cents', defaultPrice: 900,
    layout: 'uk_return_below',                             // recipient at top of zone, "RETURN TO:" at bottom
    zones: { block: [0.787, 1.535, 3.543, 1.772] },
    services: {},
  },
  AU: {
    name: 'Australia', size: 'a4',
    priceKey: 'price_au_cents', defaultPrice: 900,
    layout: 'au_recipient_only',                           // return address is printed on the envelope
    zones: { to: [0.945, 1.969, 3.78, 1.417] },
    services: {},
  },
};

// Fixed prices for the US, UK and Australia pages, in that currency's cents. Each keeps at least 38% profit after
// PostGrid's USD cost and Stripe's fees, and ends in .00 or .50. XX is everywhere else. Canada's prices stay in CAD above.
const LOCAL_PRICES = {
  USD: { symbol: '$', code: 'USD', CA: 500, US: 250, GB: 600, AU: 550, XX: 1350, colour: 50,  page: 50,  pageColour: 100 },
  GBP: { symbol: '£', code: 'GBP', CA: 350, US: 200, GB: 450, AU: 400, XX: 1000, colour: 50,  page: 50,  pageColour: 50  },
  AUD: { symbol: '$', code: 'AUD', CA: 650, US: 350, GB: 800, AU: 750, XX: 1950, colour: 100, page: 100, pageColour: 100 },
};

const INTERNATIONAL = { priceKey: 'price_international_cents', defaultPrice: 1500 };
const SERVICE_NAMES = { registered: 'Registered mail', certified: 'Certified mail', express: 'Express delivery' };
// Content on page 1 starts below every country's address zone (lowest zone ends at 3.39 in) and the first fold.
const ADDRESS_CLEARANCE_IN = 4;
const MARGIN_IN = 0.25;

function makeDestinations(getSetting) {
  const int = (key, fallback) => parseInt(getSetting(key, String(fallback))) || fallback;
  // Countries whose PostGrid network is enabled on our account (letters printed and mailed locally).
  const liveCountries = () => (getSetting('postgrid_countries', 'CA') || 'CA')
    .split(',').map(s => s.trim().toUpperCase()).filter(c => DESTINATIONS[c]);
  const enabledServices = () => { try { return JSON.parse(getSetting('services_enabled', '[]') || '[]'); } catch { return []; } };

  // A destination is "local" when its network is live; otherwise the letter goes out as international mail.
  function priceFor(country) {
    const cc = String(country || '').toUpperCase();
    const d = DESTINATIONS[cc];
    if (cc === 'CA' || cc === 'US') return int(d.priceKey, d.defaultPrice);      // always sold (mailed from Canada if the US network is off)
    if (d && liveCountries().includes(cc)) return int(d.priceKey, d.defaultPrice);
    return int(INTERNATIONAL.priceKey, INTERNATIONAL.defaultPrice);
  }

  // The fixed base price in a local currency: the destination's price when its network is live, else everywhere-else.
  function localPriceFor(currency, country) {
    const t = LOCAL_PRICES[currency], cc = String(country || '').toUpperCase();
    if (!t) return null;
    return cc === 'CA' || (t[cc] && liveCountries().includes(cc)) ? t[cc] : t.XX;
  }

  // Services a customer can buy for this destination right now.
  function servicesFor(country) {
    const cc = String(country || '').toUpperCase();
    const d = DESTINATIONS[cc];
    if (!d || !liveCountries().includes(cc)) return {};
    const on = enabledServices();
    const out = {};
    for (const [key, svc] of Object.entries(d.services)) {
      if (on.includes(`${cc}:${key}`)) out[key] = { name: SERVICE_NAMES[key], cents: int(svc.priceKey, svc.defaultPrice), mailingClass: svc.mailingClass };
    }
    return out;
  }

  // Everything the checkout page needs, in one object.
  function publicConfig() {
    const dest = {};
    for (const cc of Object.keys(DESTINATIONS)) {
      dest[cc] = { name: DESTINATIONS[cc].name, price_cents: priceFor(cc), local: liveCountries().includes(cc), services: servicesFor(cc) };
    }
    const local_prices = {};
    for (const cur of Object.keys(LOCAL_PRICES)) {
      const t = LOCAL_PRICES[cur];
      local_prices[cur] = { symbol: t.symbol, code: t.code, colour: t.colour, page: t.page, pageColour: t.pageColour, other: t.XX,
        dest: Object.fromEntries(Object.keys(DESTINATIONS).map(cc => [cc, localPriceFor(cur, cc)])) };
    }
    return { destinations: dest, international_cents: int(INTERNATIONAL.priceKey, INTERNATIONAL.defaultPrice), local_prices };
  }

  return { priceFor, localPriceFor, servicesFor, publicConfig, liveCountries, enabledServices };
}

function destinationOf(country) { return DESTINATIONS[String(country || '').toUpperCase()] || null; }
function pageSizeOf(country) { return PAGE_SIZES[(destinationOf(country) || DESTINATIONS.CA).size]; }

module.exports = { LOCAL_PRICES, DESTINATIONS, PAGE_SIZES, INTERNATIONAL, SERVICE_NAMES, ADDRESS_CLEARANCE_IN, MARGIN_IN, makeDestinations, destinationOf, pageSizeOf };
