require('dotenv').config();
const axios = require('axios');

const PLACES_BASE = 'https://places.googleapis.com/v1/places';

const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress',
  'places.location', 'places.rating', 'places.userRatingCount',
  'places.priceLevel', 'places.types', 'places.currentOpeningHours',
  'places.nationalPhoneNumber', 'places.websiteUri',
].join(',');

const DETAIL_MASK = [
  'id', 'displayName', 'formattedAddress', 'location',
  'rating', 'userRatingCount', 'priceLevel', 'types',
  'currentOpeningHours', 'regularOpeningHours',
  'nationalPhoneNumber', 'websiteUri',
  'editorialSummary', 'photos',
].join(',');

const GENERIC_TYPES = new Set([
  'point_of_interest', 'establishment', 'food', 'restaurant',
  'store', 'premise', 'locality', 'political',
]);

const PRICE_LABELS = {
  PRICE_LEVEL_FREE: '',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

function extractCuisine(types = []) {
  const specific = types.find(t => !GENERIC_TYPES.has(t));
  if (!specific) return '';
  return specific.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function geocodeAddress(address) {
  const res = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: address, format: 'json', limit: 1 },
    headers: { 'User-Agent': 'MenuApp/1.0' },
    timeout: 5000,
  });
  const r = res.data[0];
  if (!r) throw new Error(`Location not found: "${address}"`);
  return { lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
}

function normalizePlace(place, userLat, userLng) {
  const lat = place.location?.latitude ?? null;
  const lng = place.location?.longitude ?? null;
  const dist = (lat && lng && userLat && userLng)
    ? Math.round(haversine(userLat, userLng, lat, lng) * 10) / 10
    : null;
  return {
    id:           place.id ?? '',
    name:         place.displayName?.text ?? '',
    address:      place.formattedAddress ?? '',
    phone:        place.nationalPhoneNumber ?? '',
    website:      place.websiteUri ?? '',
    cuisine:      extractCuisine(place.types ?? []),
    rating:       place.rating ?? null,
    rating_count: place.userRatingCount ?? null,
    price:        PRICE_LABELS[place.priceLevel] ?? '',
    open_now:     place.currentOpeningHours?.openNow ?? null,
    lat, lng,
    distance:     dist,
    maps_url:     place.id ? `https://www.google.com/maps/place/?q=place_id:${place.id}` : '',
  };
}

function extractRoute(event) {
  const raw = event.path || '/';
  return raw.replace(/^\/.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: '' };
  }

  const route  = extractRoute(event);
  const params = event.queryStringParameters || {};
  const key    = process.env.GOOGLE_PLACES_API_KEY;

  try {
    // ── GET /menus/search ─────────────────────────────
    if (route === '/menus/search') {
      const { location, lat: latQ, lng: lngQ } = params;
      const radiusMiles  = Math.min(parseFloat(params.radius) || 15, 31);
      const radiusMeters = Math.round(radiusMiles * 1609.34);
      const query        = (params.query || '').trim();

      if (!location && (!latQ || !lngQ)) {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Provide a location string or lat and lng.' }) };
      }

      let userLat, userLng;
      if (latQ && lngQ) {
        userLat = parseFloat(latQ);
        userLng = parseFloat(lngQ);
      } else {
        const geo = await geocodeAddress(location);
        userLat = geo.lat;
        userLng = geo.lng;
      }

      const circle  = { center: { latitude: userLat, longitude: userLng }, radius: radiusMeters };
      const apiHdrs = { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK, 'Content-Type': 'application/json' };
      let places = [];

      if (query) {
        const r = await axios.post(`${PLACES_BASE}:searchText`,
          { textQuery: `${query} restaurant`, locationBias: { circle }, maxResultCount: 20 },
          { headers: apiHdrs, timeout: 8000 });
        places = r.data.places ?? [];
      } else {
        const r = await axios.post(`${PLACES_BASE}:searchNearby`,
          { locationRestriction: { circle }, includedTypes: ['restaurant'], maxResultCount: 20 },
          { headers: apiHdrs, timeout: 8000 });
        places = r.data.places ?? [];
      }

      const results = places
        .map(p => normalizePlace(p, userLat, userLng))
        .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));

      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(results) };
    }

    // ── GET /menus/place/:id ──────────────────────────
    if (route.startsWith('/menus/place/')) {
      const id = decodeURIComponent(route.slice('/menus/place/'.length));
      const r  = await axios.get(`${PLACES_BASE}/${id}`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': DETAIL_MASK },
        timeout: 8000,
      });
      const p = r.data;
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          id:           p.id ?? '',
          name:         p.displayName?.text ?? '',
          address:      p.formattedAddress ?? '',
          phone:        p.nationalPhoneNumber ?? '',
          website:      p.websiteUri ?? '',
          cuisine:      extractCuisine(p.types ?? []),
          rating:       p.rating ?? null,
          rating_count: p.userRatingCount ?? null,
          price:        PRICE_LABELS[p.priceLevel] ?? '',
          open_now:     p.currentOpeningHours?.openNow ?? null,
          hours:        p.regularOpeningHours?.weekdayDescriptions
                     ?? p.currentOpeningHours?.weekdayDescriptions
                     ?? [],
          summary:      p.editorialSummary?.text ?? '',
          photos:       (p.photos ?? []).slice(0, 6).map(ph => ph.name),
          maps_url:     p.id ? `https://www.google.com/maps/place/?q=place_id:${p.id}` : '',
        }),
      };
    }

    // ── GET /menus/photo ──────────────────────────────
    if (route === '/menus/photo') {
      const { ref, maxWidth = 800 } = params;
      if (!ref) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'ref required' }) };
      const r = await axios.get(`https://places.googleapis.com/v1/${ref}/media`, {
        params: { maxWidthPx: maxWidth, key },
        responseType: 'arraybuffer',
        timeout: 12000,
      });
      return {
        statusCode: 200,
        headers: { 'Content-Type': r.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
        body: Buffer.from(r.data).toString('base64'),
        isBase64Encoded: true,
      };
    }

    return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Not found' }) };

  } catch (err) {
    const status = err.response?.status ?? 500;
    const detail = err.response?.data?.error?.message ?? err.message;
    return { statusCode: status, headers: JSON_HEADERS, body: JSON.stringify({ error: detail }) };
  }
};
