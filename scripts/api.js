/* ============================================================
   NeuroRef — API layer
   Talks to openFDA's drug label endpoint and caches responses
   in localStorage so repeat searches don't burn rate limit.
   Docs: https://open.fda.gov/apis/drug/label/
   ============================================================ */

const BASE_URL = 'https://api.fda.gov/drug/label.json';

// openFDA works without a key (240 req/min shared per IP).
// An optional key raises the limit; it is injected at deploy time
// via config.js (git-ignored) rather than committed to the repo.
const API_KEY = window.NEUROREF_CONFIG?.apiKey || '';

const CACHE_PREFIX = 'neuroref:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // labels change rarely; cache for a day

/** Errors we raise deliberately, with messages safe to show the user. */
export class ApiError extends Error {
  constructor(message, { notFound = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.notFound = notFound;
  }
}

/* ── cache helpers ── */

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { savedAt, data } = JSON.parse(raw);
    if (Date.now() - savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return data;
  } catch {
    return null; // corrupted entry or storage unavailable — just refetch
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // storage full or blocked — caching is best-effort, ignore
  }
}

/* ── fetching ── */

/**
 * Search FDA labels for a drug by generic or brand name.
 * Returns an array of simplified label objects (possibly several
 * manufacturers' labels for the same drug).
 * Throws ApiError with a user-readable message on any failure.
 */
export async function fetchDrugLabels(query) {
  const term = query.trim().toLowerCase();
  if (!term) throw new ApiError('Please enter a medication name.');

  const cached = cacheGet(term);
  if (cached) return cached;

  // Match either the generic name or a brand name, exact-phrase quoted.
  const search = `(openfda.generic_name:"${term}" OR openfda.brand_name:"${term}")`;
  const params = new URLSearchParams({ search, limit: '6' });
  if (API_KEY) params.set('api_key', API_KEY);

  let response;
  try {
    response = await fetch(`${BASE_URL}?${params}`);
  } catch {
    throw new ApiError('Could not reach the FDA database. Check your internet connection and try again.');
  }

  if (response.status === 404) {
    throw new ApiError(
      `No FDA label found for “${query.trim()}”. Check the spelling, or try the generic name (e.g. “levetiracetam” instead of “Keppra”).`,
      { notFound: true }
    );
  }
  if (response.status === 429) {
    throw new ApiError('The FDA API rate limit was reached. Please wait a minute and try again.');
  }
  if (!response.ok) {
    throw new ApiError(`The FDA API returned an unexpected error (HTTP ${response.status}). Please try again later.`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('The FDA API returned an unreadable response. Please try again later.');
  }

  const results = (body.results || []).map(simplifyLabel).filter(Boolean);
  if (results.length === 0) {
    throw new ApiError(`No usable label data found for “${query.trim()}”.`, { notFound: true });
  }

  cacheSet(term, results);
  return results;
}

/**
 * Reduce a raw openFDA label (hundreds of fields) to the five
 * sections the UI presents. Section fields arrive as arrays of
 * long strings; join and trim them here so the UI stays simple.
 */
function simplifyLabel(raw) {
  const ofda = raw.openfda || {};
  const genericName = (ofda.generic_name || [])[0];
  const brandName = (ofda.brand_name || [])[0];
  if (!genericName && !brandName) return null;

  const section = (field) => {
    const text = (raw[field] || []).join('\n\n').trim();
    return text || null;
  };

  return {
    id: raw.id,
    genericName: (genericName || brandName).toLowerCase(),
    brandName: brandName || null,
    manufacturer: (ofda.manufacturer_name || [])[0] || null,
    route: (ofda.route || [])[0] || null,
    sections: {
      indications: section('indications_and_usage'),
      adverse: section('adverse_reactions'),
      interactions: section('drug_interactions'),
      dosage: section('dosage_and_administration'),
      warnings: section('warnings') || section('warnings_and_cautions'),
    },
  };
}
