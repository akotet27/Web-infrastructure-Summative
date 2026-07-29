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
};
const compareIds = {
  loading: $('compareLoading'),
  error: $('compareError'),
  errorMsg: $('compareErrorMsg'),
  empty: $('compareEmpty'),
  results: $('compareResults'),
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
  $('explorerControls').hidden = true;
  setState(explorerIds, 'loading');
  try {
    currentLabels = await fetchDrugLabels(query);
    $('explorerControls').hidden = false;
    renderExplorer();
  } catch (err) {
    currentLabels = [];
    const message = err instanceof ApiError
      ? err.message
      : 'An unexpected error occurred. Please try again.';
    setState(explorerIds, 'error', message);
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

  setState(compareIds, 'loading');
  try {
    // Fetch both labels in parallel; either failure aborts with its message.
    const [labelsA, labelsB] = await Promise.all([
      fetchDrugLabels(nameA),
      fetchDrugLabels(nameB),
    ]);
    setState(compareIds, 'results');
    compareIds.results.appendChild(renderCompareColumn(labelsA[0]));
    compareIds.results.appendChild(renderCompareColumn(labelsB[0]));
  } catch (err) {
    const message = err instanceof ApiError
      ? err.message
      : 'An unexpected error occurred. Please try again.';
    setState(compareIds, 'error', message);
  }
}

$('compareBtn').addEventListener('click', runCompare);
[$('drugA'), $('drugB')].forEach((input) =>
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runCompare(); })
);
