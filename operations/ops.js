const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

// Populated by prefillPassportFromIntake()/prefillManifestFromIntake() when the
// page was reached via an intake_id URL param, then read back into the insert
// payload on submit so the lineage persists without the operator retyping it.
let passportIntakeProvenance = null;
let manifestIntakeProvenance = null;

async function logIntakeEvent(intakeId, eventType) {
  if (!intakeId) return;
  const { data: sessionData } = await sb.auth.getSession();
  const actorId = sessionData && sessionData.session && sessionData.session.user ? sessionData.session.user.id : null;
  const { error } = await sb.from('intake_events').insert({ intake_id: intakeId, event_type: eventType, actor: actorId });
  if (error) console.error('EVENT LOG WARNING:', error.message);
}

function setStatus(id, message, tone = 'neutral') {
  const el = document.getElementById(id);
  if (!el) return;
  const colorMap = {
    neutral: 'text-slate-400',
    success: 'text-emerald-400',
    error: 'text-rose-400',
    warn: 'text-amber-400',
  };
  el.className = `text-sm ${colorMap[tone] || colorMap.neutral}`;
  el.textContent = message;
}

function parseRiskFlags(raw) {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function createManifest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    source: document.getElementById('source').value.trim(),
    description: document.getElementById('description').value.trim(),
    estimated_units: document.getElementById('estimated_units').value ? Number(document.getElementById('estimated_units').value) : null,
    estimated_weight: document.getElementById('estimated_weight').value ? Number(document.getElementById('estimated_weight').value) : null,
    estimated_recovery_value: document.getElementById('estimated_recovery_value').value ? Number(document.getElementById('estimated_recovery_value').value) : null,
    pickup_cost: document.getElementById('pickup_cost').value ? Number(document.getElementById('pickup_cost').value) : null,
    labor_cost: document.getElementById('labor_cost').value ? Number(document.getElementById('labor_cost').value) : null,
    ai_confidence: document.getElementById('ai_confidence').value ? Number(document.getElementById('ai_confidence').value) : null,
    opportunity_score: document.getElementById('opportunity_score').value ? Number(document.getElementById('opportunity_score').value) : null,
    risk_flags: parseRiskFlags(document.getElementById('risk_flags').value),
    status: 'REVIEWING',
  };

  if (manifestIntakeProvenance) {
    payload.intake_id = manifestIntakeProvenance.intake_id;
    payload.intake_number = manifestIntakeProvenance.intake_number || null;
    payload.passport_id = manifestIntakeProvenance.passport_id || null;
  }

  if (!payload.source || !payload.description) {
    setStatus('manifestStatus', 'Source and description are required.', 'error');
    return;
  }

  const { error } = await sb.from('manifests').insert(payload);
  if (error) {
    setStatus('manifestStatus', error.message, 'error');
    return;
  }

  if (payload.intake_id) {
    logIntakeEvent(payload.intake_id, 'MANIFEST_CREATED');
  }

  form.reset();
  setStatus('manifestStatus', 'Manifest created and sent to the review queue.', 'success');
}

async function loadReviewQueue() {
  const list = document.getElementById('queueList');
  if (!list) return;

  const { data, error } = await sb
    .from('manifests')
    .select('*')
    .eq('status', 'REVIEWING')
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<div class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">${error.message}</div>`;
    return;
  }

  if (!data || !data.length) {
    list.innerHTML = '<div class="rounded-lg border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-400">No manifests are currently waiting review.</div>';
    return;
  }

  const cards = await Promise.all(
    data.map(async (manifest) => {
      const similar = await loadSimilarHistory(manifest);
      const expectedValue = Number(manifest.estimated_recovery_value || 0);
      const expectedCosts = Number(manifest.pickup_cost || 0) + Number(manifest.labor_cost || 0);
      const expectedMargin = expectedValue - expectedCosts;
      return `
        <article class="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-300">Manifest ${manifest.id}</span>
                <span class="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">${manifest.source || 'Unknown'}</span>
              </div>
              <h3 class="mt-3 text-lg font-semibold">${manifest.description || 'Untitled batch'}</h3>
              <p class="mt-2 text-sm text-slate-400">Expected value: <span class="font-medium text-slate-100">$${expectedValue.toFixed(2)}</span></p>
              <p class="mt-1 text-sm text-slate-400">Expected costs: <span class="font-medium text-slate-100">$${expectedCosts.toFixed(2)}</span></p>
              <p class="mt-1 text-sm text-slate-400">Expected margin: <span class="font-medium text-slate-100">$${expectedMargin.toFixed(2)}</span></p>
            </div>
            <div class="min-w-[220px] rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
              <p>AI confidence: <span class="font-medium text-slate-100">${manifest.ai_confidence ?? '—'}</span></p>
              <p class="mt-1">Opportunity score: <span class="font-medium text-slate-100">${manifest.opportunity_score ?? '—'}</span></p>
              <p class="mt-1">Risk flags: <span class="font-medium text-slate-100">${(manifest.risk_flags || []).join(', ') || 'None'}</span></p>
              <p class="mt-1">Similar history: <span class="font-medium text-slate-100">${similar}</span></p>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap gap-3">
            <button class="view-btn rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-cyan-400 hover:text-cyan-300" data-manifest-id="${manifest.id}">VIEW</button>
            <button class="approve-btn rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300" data-manifest-id="${manifest.id}">APPROVE</button>
            <button class="pass-btn rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300" data-manifest-id="${manifest.id}">PASS</button>
          </div>
        </article>
      `;
    })
  );

  list.innerHTML = cards.join('');
  attachQueueHandlers();
}

async function loadSimilarHistory(manifest) {
  const source = manifest.source || '';
  const description = manifest.description || '';
  const { data } = await sb
    .from('manifests')
    .select('id, source, description, estimated_recovery_value, status')
    .or(`source.ilike.%${source}%,description.ilike.%${description}%`)
    .neq('id', manifest.id)
    .limit(3);

  if (!data || !data.length) return 'No similar historical batches found.';
  return data.map((item) => `${item.source || 'source'} / ${item.description || 'batch'}`).join(' • ');
}

function attachQueueHandlers() {
  document.querySelectorAll('.approve-btn').forEach((button) => {
    button.addEventListener('click', () => approveManifest(button.dataset.manifestId));
  });
  document.querySelectorAll('.pass-btn').forEach((button) => {
    button.addEventListener('click', () => openPassModal(button.dataset.manifestId));
  });
  document.querySelectorAll('.view-btn').forEach((button) => {
    button.addEventListener('click', () => viewManifest(button.dataset.manifestId));
  });
}

async function approveManifest(manifestId) {
  const { error: decisionError } = await sb.from('manifest_decisions').insert({
    manifest_id: manifestId,
    decision: 'approve',
    reason_code: 'approved',
    operator_notes: 'Approved through operations queue.',
  });
  if (decisionError) {
    alert(decisionError.message);
    return;
  }

  const { error: updateError } = await sb.from('manifests').update({ status: 'APPROVED' }).eq('id', manifestId);
  if (updateError) {
    alert(updateError.message);
    return;
  }

  const { error: eventError } = await sb.from('manifest_events').insert({
    manifest_id: manifestId,
    event_type: 'approved',
    payload: { action: 'approved' },
  });
  if (eventError) {
    alert(eventError.message);
    return;
  }

  alert('Manifest approved.');
  loadReviewQueue();
}

let activePassManifestId = null;

function openPassModal(manifestId) {
  activePassManifestId = manifestId;
  document.getElementById('passModal').classList.remove('hidden');
  document.getElementById('passModal').classList.add('flex');
}

function closePassModal() {
  document.getElementById('passModal').classList.add('hidden');
  document.getElementById('passModal').classList.remove('flex');
  activePassManifestId = null;
}

async function savePassDecision() {
  const reasonCode = document.getElementById('reasonCode').value;
  const notes = document.getElementById('passNotes').value.trim();
  if (!reasonCode || !notes) {
    alert('Reason code and operator notes are required.');
    return;
  }

  const { error: decisionError } = await sb.from('manifest_decisions').insert({
    manifest_id: activePassManifestId,
    decision: 'pass',
    reason_code: reasonCode,
    operator_notes: notes,
  });
  if (decisionError) {
    alert(decisionError.message);
    return;
  }

  const { error: updateError } = await sb.from('manifests').update({ status: 'PASSED' }).eq('id', activePassManifestId);
  if (updateError) {
    alert(updateError.message);
    return;
  }

  const { error: eventError } = await sb.from('manifest_events').insert({
    manifest_id: activePassManifestId,
    event_type: 'passed',
    payload: { reason_code: reasonCode, notes },
  });
  if (eventError) {
    alert(eventError.message);
    return;
  }

  closePassModal();
  alert('Manifest passed.');
  loadReviewQueue();
}

function viewManifest(manifestId) {
  alert(`View details for manifest ${manifestId}`);
}

async function loadPassportOptions() {
  const selector = document.getElementById('materialPassportId');
  const txSelector = document.getElementById('transactionMaterialId');
  if (!selector && !txSelector) return;

  const { data, error } = await sb.from('passports').select('id, manufacturer, model').order('created_at', { ascending: false });
  if (error) return;

  if (selector) {
    selector.innerHTML = '<option value="">Select passport</option>' + (data || []).map((passport) => `<option value="${passport.id}">${passport.manufacturer || 'Passport'} ${passport.model || ''}</option>`).join('');
  }
  if (txSelector) {
    const { data: materials } = await sb.from('materials_recovered').select('id, material_name').order('created_at', { ascending: false });
    txSelector.innerHTML = '<option value="">Choose recovered material</option>' + (materials || []).map((material) => `<option value="${material.id}">${material.material_name || 'Recovered material'}</option>`).join('');
  }
}

async function loadReconcileData() {
  const summary = document.getElementById('reconcileSummary');
  const table = document.getElementById('reconcileTable');
  if (!summary && !table) return;

  const { data, error } = await sb.from('manifests').select('*').order('created_at', { ascending: false });
  if (error) {
    if (summary) summary.innerHTML = `<div class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">${error.message}</div>`;
    if (table) table.innerHTML = '';
    return;
  }

  const approved = data.filter((item) => item.status === 'APPROVED').length;
  const passed = data.filter((item) => item.status === 'PASSED').length;
  const reviewing = data.filter((item) => item.status === 'REVIEWING').length;
  const totalValue = data.reduce((sum, item) => sum + Number(item.estimated_recovery_value || 0), 0);
  const totalCosts = data.reduce((sum, item) => sum + Number(item.pickup_cost || 0) + Number(item.labor_cost || 0), 0);
  const totalMargin = totalValue - totalCosts;

  if (summary) {
    summary.innerHTML = `
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Approved</p>
          <p class="mt-2 text-2xl font-semibold text-emerald-300">${approved}</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Passed</p>
          <p class="mt-2 text-2xl font-semibold text-amber-300">${passed}</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Reviewing</p>
          <p class="mt-2 text-2xl font-semibold text-cyan-300">${reviewing}</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Margin</p>
          <p class="mt-2 text-2xl font-semibold text-violet-300">$${totalMargin.toFixed(2)}</p>
        </div>
      </div>
      <div class="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
        Total expected value: <span class="font-medium text-slate-100">$${totalValue.toFixed(2)}</span> • Total expected costs: <span class="font-medium text-slate-100">$${totalCosts.toFixed(2)}</span>
      </div>
    `;
  }

  if (table) {
    table.innerHTML = `
      <table class="min-w-full divide-y divide-slate-800 text-sm">
        <thead>
          <tr class="text-left text-slate-400">
            <th class="px-3 py-2">Manifest</th>
            <th class="px-3 py-2">Source</th>
            <th class="px-3 py-2">Status</th>
            <th class="px-3 py-2">Expected Margin</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          ${data.map((manifest) => {
            const margin = Number(manifest.estimated_recovery_value || 0) - (Number(manifest.pickup_cost || 0) + Number(manifest.labor_cost || 0));
            return `
              <tr class="text-slate-300">
                <td class="px-3 py-3">${manifest.id}</td>
                <td class="px-3 py-3">${manifest.source || 'Unknown'}</td>
                <td class="px-3 py-3">${manifest.status}</td>
                <td class="px-3 py-3">$${margin.toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }
}

async function loadLearningInsights() {
  const list = document.getElementById('learningList');
  if (!list) return;

  const { data, error } = await sb.from('manifests').select('*').order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = `<div class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">${error.message}</div>`;
    return;
  }

  const grouped = data.reduce((acc, manifest) => {
    const source = manifest.source || 'Unknown';
    if (!acc[source]) {
      acc[source] = { count: 0, approved: 0, totalValue: 0, totalMargin: 0 };
    }
    acc[source].count += 1;
    acc[source].approved += manifest.status === 'APPROVED' ? 1 : 0;
    acc[source].totalValue += Number(manifest.estimated_recovery_value || 0);
    acc[source].totalMargin += Number(manifest.estimated_recovery_value || 0) - (Number(manifest.pickup_cost || 0) + Number(manifest.labor_cost || 0));
    return acc;
  }, {});

  const rows = Object.entries(grouped)
    .map(([source, stats]) => ({
      source,
      count: stats.count,
      approved: stats.approved,
      avgMargin: stats.totalMargin / stats.count,
      avgValue: stats.totalValue / stats.count,
    }))
    .sort((a, b) => b.avgMargin - a.avgMargin)
    .slice(0, 6);

  list.innerHTML = rows.map((row) => `
    <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="font-semibold text-slate-100">${row.source}</p>
          <p class="mt-1 text-sm text-slate-400">${row.count} manifests • ${row.approved} approved</p>
        </div>
        <div class="text-right text-sm text-slate-400">
          <p>Avg value: <span class="font-medium text-slate-100">$${row.avgValue.toFixed(2)}</span></p>
          <p class="mt-1">Avg margin: <span class="font-medium text-slate-100">$${row.avgMargin.toFixed(2)}</span></p>
        </div>
      </div>
    </div>
  `).join('');
}

async function createPassport(event) {
  event.preventDefault();
  const payload = {
    manufacturer: document.getElementById('manufacturer').value.trim(),
    model: document.getElementById('model').value.trim(),
    serial: document.getElementById('serial').value.trim(),
    asset_tag: document.getElementById('asset_tag').value.trim(),
    incoming_weight: document.getElementById('incoming_weight').value ? Number(document.getElementById('incoming_weight').value) : null,
    photo_url: document.getElementById('photo_url').value.trim(),
    disposition: document.getElementById('disposition').value,
    status: 'received',
  };

  if (passportIntakeProvenance) {
    payload.intake_id = passportIntakeProvenance.intake_id;
    payload.intake_number = passportIntakeProvenance.intake_number || null;
    payload.intake_created_at = passportIntakeProvenance.intake_created_at || null;
    payload.intake_operator = passportIntakeProvenance.intake_operator || null;
    payload.intake_confidence = passportIntakeProvenance.intake_confidence || null;
    payload.intake_material = passportIntakeProvenance.material || null;
    payload.intake_grade = passportIntakeProvenance.grade || null;
  }

  const { data, error } = await sb.from('passports').insert(payload).select().single();
  if (error) {
    setStatus('passportStatus', error.message, 'error');
    return;
  }

  if (payload.intake_id) {
    logIntakeEvent(payload.intake_id, 'PASSPORT_CREATED');
  }

  event.currentTarget.reset();
  loadPassportOptions();
  setStatus('passportStatus', `Passport ${data.id} created.`, 'success');
}

async function createMaterial(event) {
  event.preventDefault();
  const payload = {
    passport_id: document.getElementById('materialPassportId').value,
    material_name: document.getElementById('materialName').value.trim(),
    quantity: document.getElementById('materialQuantity').value ? Number(document.getElementById('materialQuantity').value) : null,
    unit: document.getElementById('materialUnit').value.trim(),
    sale_value_estimate: document.getElementById('materialValue').value ? Number(document.getElementById('materialValue').value) : null,
    sale_status: 'pending',
  };

  if (!payload.passport_id || !payload.material_name) {
    alert('Choose a passport and enter a material name.');
    return;
  }

  const { error } = await sb.from('materials_recovered').insert(payload);
  if (error) {
    alert(error.message);
    return;
  }

  event.currentTarget.reset();
  loadPassportOptions();
  alert('Recovered material saved.');
}

async function createTransaction(event) {
  event.preventDefault();
  const payload = {
    material_id: document.getElementById('transactionMaterialId').value,
    buyer: document.getElementById('transactionBuyer').value.trim(),
    sale_price: document.getElementById('transactionPrice').value ? Number(document.getElementById('transactionPrice').value) : null,
    date_sold: document.getElementById('transactionDate').value || null,
  };

  if (!payload.material_id || !payload.buyer) {
    alert('Choose a recovered material and enter a buyer.');
    return;
  }

  const { error } = await sb.from('transactions').insert(payload);
  if (error) {
    alert(error.message);
    return;
  }

  event.currentTarget.reset();
  loadPassportOptions();
  alert('Transaction recorded.');
}

function prefillPassportFromIntake() {
  const params = new URLSearchParams(window.location.search);
  const intakeId = params.get('intake_id');
  if (!intakeId) return;

  const manufacturer = document.getElementById('manufacturer');
  if (manufacturer && !manufacturer.value && params.get('material')) {
    manufacturer.value = params.get('material');
  }

  const incomingWeight = document.getElementById('incoming_weight');
  if (incomingWeight && !incomingWeight.value && params.get('weight')) {
    incomingWeight.value = params.get('weight');
  }

  passportIntakeProvenance = {
    intake_id: intakeId,
    intake_number: params.get('intake_number'),
    intake_created_at: params.get('intake_created_at'),
    intake_operator: params.get('intake_operator'),
    intake_confidence: params.get('intake_confidence'),
    material: params.get('material'),
    grade: params.get('grade'),
  };

  const intakeNumber = params.get('intake_number');
  setStatus('passportStatus', `Prefilled from intake ${intakeNumber || '#' + intakeId}.`, 'neutral');
}

function prefillManifestFromIntake() {
  const params = new URLSearchParams(window.location.search);
  const intakeId = params.get('intake_id');
  if (!intakeId) return;

  const description = document.getElementById('description');
  if (description && !description.value && params.get('material')) {
    description.value = params.get('material');
  }

  const estimatedWeight = document.getElementById('estimated_weight');
  if (estimatedWeight && !estimatedWeight.value && params.get('weight')) {
    estimatedWeight.value = params.get('weight');
  }

  manifestIntakeProvenance = {
    intake_id: intakeId,
    intake_number: params.get('intake_number'),
    passport_id: params.get('passport_id'),
  };

  const intakeNumber = params.get('intake_number');
  setStatus('manifestStatus', `Prefilled from intake ${intakeNumber || '#' + intakeId}.`, 'neutral');
}

function attachReuseWarning() {
  const disposition = document.getElementById('disposition');
  const warning = document.getElementById('reuseWarning');
  if (!disposition || !warning) return;
  disposition.addEventListener('change', () => {
    warning.classList.toggle('hidden', disposition.value !== 'REUSE');
  });
}

function initOperations() {
  const manifestForm = document.getElementById('manifestForm');
  if (manifestForm) {
    manifestForm.addEventListener('submit', createManifest);
    prefillManifestFromIntake();
  }

  const refreshQueue = document.getElementById('refreshQueue');
  if (refreshQueue) {
    refreshQueue.addEventListener('click', loadReviewQueue);
  }

  const refreshReconcile = document.getElementById('refreshReconcile');
  if (refreshReconcile) {
    refreshReconcile.addEventListener('click', loadReconcileData);
  }

  const refreshLearning = document.getElementById('refreshLearning');
  if (refreshLearning) {
    refreshLearning.addEventListener('click', loadLearningInsights);
  }

  if (document.getElementById('passModal')) {
    document.getElementById('cancelPass').addEventListener('click', closePassModal);
    document.getElementById('submitPass').addEventListener('click', savePassDecision);
    loadReviewQueue();
  }

  if (document.getElementById('reconcileSummary') || document.getElementById('reconcileTable')) {
    loadReconcileData();
  }

  if (document.getElementById('learningList')) {
    loadLearningInsights();
  }

  const passportForm = document.getElementById('passportForm');
  if (passportForm) {
    passportForm.addEventListener('submit', createPassport);
    attachReuseWarning();
    prefillPassportFromIntake();
  }

  const materialForm = document.getElementById('materialForm');
  if (materialForm) {
    materialForm.addEventListener('submit', createMaterial);
  }

  const transactionForm = document.getElementById('transactionForm');
  if (transactionForm) {
    transactionForm.addEventListener('submit', createTransaction);
  }

  loadPassportOptions();
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.watchtowerOperatorReady) return;
  window.watchtowerOperatorReady.then((isOperator) => {
    if (isOperator) initOperations();
  });
});
