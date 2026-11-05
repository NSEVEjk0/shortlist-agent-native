const $ = id => document.getElementById(id);
const labels = { quantity: 'Quantity', unitMinor: 'Unit price', shippingMinor: 'Shipping', taxMinor: 'Tax', currency: 'Currency', deliveryDate: 'Delivery' };
const money = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);
const date = value => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
const shortDate = value => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
let tour, stepIndex = 0, selectedQuote = 'harbor', selectedField = 'shippingMinor', selectedExclusion = false;

function evidence(quote) {
  if (selectedExclusion) return quote.exclusions[0]?.evidence ?? null;
  return quote.fields[selectedField]?.evidence ?? null;
}

function showSource(quote) {
  $('source-title').textContent = quote.supplier;
  $('source-hash').textContent = quote.sourceHash;
  $('source-text').replaceChildren();
  const citation = evidence(quote);
  if (citation && quote.source.slice(citation.start, citation.end) === citation.text) {
    $('source-text').append(document.createTextNode(quote.source.slice(0, citation.start)), node('mark', citation.text), document.createTextNode(quote.source.slice(citation.end)));
    $('source-status').textContent = 'Exact cited excerpt highlighted.';
  } else {
    $('source-text').textContent = quote.source;
    $('source-status').textContent = 'Your manual correction is separate from the original quote.';
  }
  const field = quote.fields[selectedField];
  $('correction-note').textContent = !selectedExclusion && field?.origin === 'manual' ? `${field.locked ? 'Locked correction. ' : 'Manual correction. '}${field.note} Original supplier text stays available above.` : 'The excerpt exists in the original quote. Review the supplier’s meaning and terms before purchasing.';
}

function showFacts(quote) {
  $('facts-title').textContent = quote.supplier + ' · quoted facts';
  $('facts').replaceChildren();
  for (const [key, field] of Object.entries(quote.fields)) {
    const row = node('div', undefined, 'fact-row');
    const value = field.value === null ? 'Not confirmed' : key.endsWith('Minor') ? money(field.value) : key === 'deliveryDate' ? shortDate(field.value) : String(field.value);
    const button = node('button', undefined, 'fact-value'); button.type = 'button';
    button.append(node('span', value));
    if (field.locked) button.append(node('span', 'Locked', 'lock'));
    button.setAttribute('aria-label', `Inspect ${quote.supplier} ${labels[key]}: ${value}${field.locked ? ', locked correction' : ''}`);
    button.onclick = () => { selectedField = key; selectedExclusion = false; showSource(quote); };
    row.append(node('span', labels[key]), button, node('span', field.origin === 'manual' ? 'Your correction' : 'Original quote', 'fact-origin'));
    $('facts').append(row);
  }
  $('exclusions').replaceChildren(node('strong', 'EXCLUSIONS · REVIEWED IN THIS EXAMPLE'));
  for (const exclusion of quote.exclusions) {
    const button = node('button', exclusion.text); button.type = 'button';
    button.onclick = () => { selectedExclusion = true; showSource(quote); };
    $('exclusions').append(button);
  }
  showSource(quote);
}

function render() {
  const step = tour.steps[stepIndex];
  const { state, recommendation } = step;
  $('steps').replaceChildren();
  tour.steps.forEach((item, index) => {
    const button = node('button', undefined, 'step-button'); button.type = 'button';
    button.setAttribute('aria-pressed', String(index === stepIndex));
    button.setAttribute('aria-label', `Step ${index + 1}: ${item.short}`);
    button.append(node('span', String(index + 1).padStart(2, '0'), 'number'), node('span', item.short));
    button.onclick = () => selectStep(index);
    $('steps').append(button);
  });
  $('budget').textContent = money(state.requirements.budgetMinor);
  $('deadline').textContent = date(state.requirements.deliveryBy);
  $('winner').textContent = recommendation.winner?.supplier ?? 'No offer meets every requirement';
  $('winner-detail').textContent = recommendation.winner ? `${money(recommendation.winner.totalMinor)} total · arrives ${shortDate(recommendation.winner.deliveryDate)} · fits your stated requirements` : 'Review the budget or deadline. The rejection reasons are visible for every supplier.';
  $('recommendation').classList.toggle('unresolved', !recommendation.winner);
  $('rec-icon').textContent = recommendation.winner ? '✓' : '!';
  $('snapshot').textContent = `TOUR STATE ${String(stepIndex + 1).padStart(2, '0')}`;
  $('change').textContent = step.change;
  $('undo').disabled = stepIndex === 0;
  $('step-counter').textContent = `STEP ${String(stepIndex + 1).padStart(2, '0')} OF ${String(tour.steps.length).padStart(2, '0')}`;
  $('step-title').textContent = step.title;
  $('step-detail').textContent = step.detail;
  $('next').replaceChildren(document.createTextNode(stepIndex === tour.steps.length - 1 ? 'Restart the tour ' : 'Next step '), node('span', stepIndex === tour.steps.length - 1 ? '↶' : '→'));
  $('rows').replaceChildren();
  for (const quote of state.quotes) {
    const assessment = recommendation.assessments.find(item => item.id === quote.id);
    const row = node('tr', undefined, selectedQuote === quote.id ? 'selected' : '');
    const button = node('button', undefined, 'supplier-button'); button.type = 'button';
    button.append(node('span', quote.supplier));
    if (recommendation.winner?.id === quote.id) button.append(node('small', 'Recommended'));
    button.setAttribute('aria-label', `Inspect ${quote.supplier} quote`);
    button.onclick = () => { selectedQuote = quote.id; selectedField = 'unitMinor'; selectedExclusion = false; render(); };
    const supplier = node('td'); supplier.append(button); row.append(supplier);
    row.append(node('td', money(quote.fields.unitMinor.value)), node('td', money(quote.fields.shippingMinor.value)), node('td', money(assessment.totalMinor)), node('td', shortDate(assessment.deliveryDate)));
    const fit = node('td'); fit.append(node('span', assessment.eligible ? 'Meets requirements' : assessment.reasons.join(' · '), assessment.eligible ? 'fit' : 'unfit')); row.append(fit);
    $('rows').append(row);
  }
  showFacts(state.quotes.find(quote => quote.id === selectedQuote) ?? state.quotes[0]);
}

function selectStep(index) {
  stepIndex = index;
  selectedQuote = tour.steps[index].quote; selectedField = tour.steps[index].field; selectedExclusion = false;
  render();
}

$('undo').onclick = () => { if (stepIndex > 0) selectStep(stepIndex - 1); };
$('next').onclick = () => selectStep((stepIndex + 1) % tour.steps.length);
$('export').onclick = () => {
  const document = { schema: 'shortlist-example-export-v1', mode: tour.mode, engine: tour.engine, snapshot: tour.steps[stepIndex], note: 'Fictional guided example. No live workspace, supplier interaction or model call occurred.' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = `shortlist-example-${tour.steps[stepIndex].id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
};

try {
  const response = await fetch('/examples/tour.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('The example evidence could not be loaded.');
  tour = await response.json();
  if (tour.schema !== 'shortlist-tour-v1' || tour.mode !== 'guided-fictional-domain-snapshots-no-agent' || tour.steps.length !== 5) throw new Error('Unexpected tour evidence format.');
  // Validate source spans before rendering. The browser displays committed
  // engine outputs; it does not recalculate or persist a substitute workspace.
  for (const step of tour.steps) for (const quote of step.state.quotes) for (const field of Object.values(quote.fields)) {
    if (field.evidence && quote.source.slice(field.evidence.start, field.evidence.end) !== field.evidence.text) throw new Error('An example citation does not match its original quote.');
  }
  $('loading').hidden = true; $('tour').hidden = false; selectStep(0);
} catch (error) {
  $('loading').textContent = error.message + ' Reload the page to retry.';
}
