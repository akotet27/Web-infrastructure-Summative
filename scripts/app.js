/* ============================================================
   NeuroRef — app controller
   Wires events to the API layer (api.js) and renderers (ui.js):
   tabs, search, quick-pick chips, section filter, sorting, and
   the two-drug interaction comparison.
   ============================================================ */

import { fetchDrugLabels, ApiError } from './api.js';
import { renderDrugCard, renderCompareColumn, setState } from './ui.js';

/* ── element lookups ── */
const $ = (id) => document.getElementById(id);

const explorerIds = {
  loading: $('explorerLoading'),
  error: $('explorerError'),
  errorMsg: $('explorerErrorMsg'),
  empty: $('explorerEmpty'),
  results: $('explorerResults'),
  suggestions: $('explorerSuggestions'),
};
const compareIds = {
  loading: $('compareLoading'),
  error: $('compareError'),
  errorMsg: $('compareErrorMsg'),
  empty: $('compareEmpty'),
  results: $('compareResults'),
  suggestions: $('compareSuggestions'),
};

/* ── tab switching ── */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      const active = t === tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.view').forEach((view) => {
      const active = view.id === `view-${tab.dataset.view}`;
      view.classList.toggle('active', active);
      view.hidden = !active;
    });
  });
});

/* ── explorer: search + filter + sort ── */
let currentLabels = []; // last successful search, re-rendered on filter/sort change

const MAX_QUERY_LENGTH = 100; // no real drug name is anywhere near this long

function sortedLabels() {
  const mode = $('resultSort').value;
  if (mode === 'relevance') return currentLabels;
  const sorted = [...currentLabels].sort((a, b) => a.genericName.localeCompare(b.genericName));
  return mode === 'za' ? sorted.reverse() : sorted;
}

function renderExplorer() {
  const filter = $('sectionFilter').value;
  setState(explorerIds, 'results');
  for (const label of sortedLabels()) {
    explorerIds.results.appendChild(renderDrugCard(label, filter));
  }
}

async function runSearch(query) {
  const cleaned = query.trim();
  if (!cleaned) {
    setState(explorerIds, 'error', 'Please enter a medication name.');
    return;
  }
  if (cleaned.length > MAX_QUERY_LENGTH) {
    setState(explorerIds, 'error', `That name is too long (max ${MAX_QUERY_LENGTH} characters). Please check the spelling and try again.`);
    return;
  }

  $('explorerControls').hidden = true;
  setState(explorerIds, 'loading');
  try {
    currentLabels = await fetchDrugLabels(cleaned);
    $('explorerControls').hidden = false;
    renderExplorer();
  } catch (err) {
    currentLabels = [];
    const message = err instanceof ApiError
      ? err.message
      : 'An unexpected error occurred. Please try again.';
    const actions = err instanceof ApiError && err.suggestion
      ? [{
          label: `Search “${err.suggestion}” instead`,
          onClick: () => {
            $('drugSearch').value = err.suggestion;
            runSearch(err.suggestion);
          },
        }]
      : [];
    setState(explorerIds, 'error', message, actions);
  }
}

$('searchBtn').addEventListener('click', () => runSearch($('drugSearch').value));
$('drugSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearch($('drugSearch').value);
});
document.querySelectorAll('.chips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $('drugSearch').value = chip.dataset.drug;
    runSearch(chip.dataset.drug);
  });
});
$('sectionFilter').addEventListener('change', () => currentLabels.length && renderExplorer());
$('resultSort').addEventListener('change', () => currentLabels.length && renderExplorer());

/* ── interactions comparison ── */
async function runCompare() {
  const nameA = $('drugA').value.trim();
  const nameB = $('drugB').value.trim();
  if (!nameA || !nameB) {
    setState(compareIds, 'error', 'Please enter both medication names.');
    return;
  }
  if (nameA.toLowerCase() === nameB.toLowerCase()) {
    setState(compareIds, 'error', 'Please enter two different medications.');
    return;
  }
  if (nameA.length > MAX_QUERY_LENGTH || nameB.length > MAX_QUERY_LENGTH) {
    setState(compareIds, 'error', `Medication names must be under ${MAX_QUERY_LENGTH} characters.`);
    return;
  }

  setState(compareIds, 'loading');
  // Fetch both labels in parallel with allSettled (not all) so a failure on
  // one side can still be attributed to its own field, with its own suggestion.
  const [resultA, resultB] = await Promise.allSettled([
    fetchDrugLabels(nameA),
    fetchDrugLabels(nameB),
  ]);

  if (resultA.status === 'rejected' || resultB.status === 'rejected') {
    const messages = [];
    const actions = [];
    const describeFailure = (result, field, position) => {
      const err = result.reason;
      messages.push(err instanceof ApiError
        ? err.message
        : `An unexpected error occurred for the ${position} medication.`);
      if (err instanceof ApiError && err.suggestion) {
        actions.push({
          label: `Use “${err.suggestion}” for the ${position} medication`,
          onClick: () => {
            $(field).value = err.suggestion;
            runCompare();
          },
        });
      }
    };
    if (resultA.status === 'rejected') describeFailure(resultA, 'drugA', 'first');
    if (resultB.status === 'rejected') describeFailure(resultB, 'drugB', 'second');
    setState(compareIds, 'error', messages.join(' '), actions);
    return;
  }

  setState(compareIds, 'results');
  compareIds.results.appendChild(renderCompareColumn(resultA.value[0]));
  compareIds.results.appendChild(renderCompareColumn(resultB.value[0]));
}

$('compareBtn').addEventListener('click', runCompare);
[$('drugA'), $('drugB')].forEach((input) =>
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runCompare(); })
);
