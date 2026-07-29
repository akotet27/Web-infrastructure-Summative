/* ============================================================
   NeuroRef — UI rendering
   Pure DOM-building functions; no fetching, no event wiring.
   Markup mirrors the render-target comments in index.html.
   ============================================================ */

const SECTION_META = [
  { key: 'indications',  title: 'What it treats' },
  { key: 'adverse',      title: 'Side effects' },
  { key: 'interactions', title: 'Drug interactions', flag: true },
  { key: 'dosage',       title: 'Dosage' },
  { key: 'warnings',     title: 'Warnings' },
];

/** Truncate FDA label prose to a readable excerpt. */
function excerpt(text, maxChars = 900) {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent) node.textContent = textContent;
  return node;
}

function buildSection({ title, flag }, text, expandable) {
  const wrap = el('div', 'drug-section');
  wrap.appendChild(el('h4', flag ? 'section-title section-title-flag' : 'section-title', title));

  const body = el('p', 'section-body', excerpt(text));
  wrap.appendChild(body);

  if (expandable && text.length > 900) {
    const toggle = el('button', 'chip', 'Read full section');
    toggle.style.marginTop = '10px';
    toggle.addEventListener('click', () => {
      const expanded = toggle.textContent === 'Show less';
      body.textContent = expanded ? excerpt(text) : text;
      toggle.textContent = expanded ? 'Read full section' : 'Show less';
    });
    wrap.appendChild(toggle);
  }
  return wrap;
}

/** One full drug card for the explorer view. */
export function renderDrugCard(label, sectionFilter = 'all') {
  const card = el('article', 'drug-card');

  const head = el('header', 'drug-card-head');
  head.appendChild(el('h3', 'drug-name', label.genericName));
  const meta = [
    label.brandName && `Brand: ${label.brandName}`,
    label.manufacturer,
    label.route && label.route.toLowerCase(),
  ].filter(Boolean).join(' · ');
  if (meta) head.appendChild(el('span', 'drug-brand', meta));
  card.appendChild(head);

  let shown = 0;
  for (const sectionMeta of SECTION_META) {
    if (sectionFilter !== 'all' && sectionFilter !== sectionMeta.key) continue;
    const text = label.sections[sectionMeta.key];
    if (!text) continue;
    card.appendChild(buildSection(sectionMeta, text, true));
    shown++;
  }

  if (shown === 0) {
    const empty = el('div', 'drug-section');
    empty.appendChild(el('p', 'section-body',
      'This label does not include the selected section. Try “All sections”.'));
    card.appendChild(empty);
  }
  return card;
}

/** One column of the interactions comparison view. */
export function renderCompareColumn(label) {
  const col = el('article', 'compare-col');
  col.appendChild(el('h3', 'drug-name', label.genericName));

  const text = label.sections.interactions;
  col.appendChild(buildSection(
    { title: 'Interactions (from its label)', flag: true },
    text || 'This drug’s FDA label does not include a drug-interactions section.',
    Boolean(text)
  ));
  return col;
}

/* ── state toggling ──
   Each view has loading / error / empty / results elements;
   show exactly one state at a time. */
export function setState(ids, state, errorMessage) {
  const { loading, error, errorMsg, empty, results } = ids;
  loading.hidden = state !== 'loading';
  error.hidden = state !== 'error';
  empty.hidden = state !== 'empty';
  results.hidden = state !== 'results';
  if (state === 'error' && errorMessage) errorMsg.textContent = errorMessage;
  if (state !== 'results') results.replaceChildren();
}
