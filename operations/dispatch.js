const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const STATUS_APPROVED = 'APPROVED';
const STATUS_QUEUED = 'QUEUED';
const STATUS_ASSIGNED = 'ASSIGNED';
const STATUS_ACTIVE = 'ACTIVE';
const STATUS_COMPLETED = 'COMPLETED';
const STATUS_CANCELLED = 'CANCELLED';
const STOP_WAITING = 'WAITING';
const STOP_ARRIVED = 'ARRIVED';
const STOP_LOADED = 'LOADED';
const STOP_COMPLETED = 'COMPLETED';
const STOP_CANCELLED = 'CANCELLED';

function normalizeStatus(value) {
  if (!value) return STATUS_QUEUED;
  return String(value).toUpperCase();
}

function setStatus(message, tone = 'neutral') {
  const node = document.getElementById('dispatchStatus');
  if (!node) return;
  const toneMap = {
    neutral: 'text-slate-400',
    success: 'text-emerald-400',
    error: 'text-rose-400',
  };
  node.className = `mt-3 text-sm ${toneMap[tone] || toneMap.neutral}`;
  node.textContent = message;
}

async function loadDispatchQueue() {
  const list = document.getElementById('queueList');
  if (!list) return;

  const { data, error } = await sb
    .from('manifests')
    .select('*')
    .eq('status', STATUS_APPROVED)
    .order('updated_at', { ascending: false });

  if (error) {
    list.innerHTML = `<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">${error.message}</div>`;
    return;
  }

  if (!data || !data.length) {
    list.innerHTML = '<div class="rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-400">No approved manifests are ready for dispatch.</div>';
    return;
  }

  list.innerHTML = data
    .map((manifest) => {
      const value = Number(manifest.estimated_recovery_value || 0).toFixed(2);
      const weight = manifest.estimated_weight ? `${manifest.estimated_weight} lbs` : '—';
      return `
        <article class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.2em] text-emerald-400">Manifest ${manifest.manifest_id || manifest.id}</p>
              <h3 class="mt-2 text-base font-semibold">${manifest.description || 'Untitled batch'}</h3>
            </div>
            <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-300">${STATUS_APPROVED}</span>
          </div>
          <div class="mt-4 grid gap-3 text-sm text-slate-400 sm:grid-cols-2">
            <div>Source: <span class="font-medium text-slate-100">${manifest.source || '—'}</span></div>
            <div>Estimated value: <span class="font-medium text-slate-100">$${value}</span></div>
            <div>Weight: <span class="font-medium text-slate-100">${weight}</span></div>
            <div>Risk flags: <span class="font-medium text-slate-100">${(manifest.risk_flags || []).join(', ') || 'None'}</span></div>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="add-route-btn rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300" data-manifest-id="${manifest.manifest_id || manifest.id}">Add to route</button>
          </div>
        </article>
      `;
    })
    .join('');

  document.querySelectorAll('.add-route-btn').forEach((button) => {
    button.addEventListener('click', () => addManifestToRoute(button.dataset.manifestId));
  });
}

function addManifestToRoute(manifestId) {
  const field = document.getElementById('manifestIds');
  const current = field.value.trim();
  const nextValue = current ? `${current},${manifestId}` : manifestId;
  field.value = nextValue;
  setStatus(`Added manifest ${manifestId} to the route draft.`, 'success');
}

async function ensureStopsForRun(run) {
  const { data: existingStops, error: stopLookupError } = await sb
    .from('dispatch_stops')
    .select('*')
    .eq('run_id', run.id)
    .order('stop_order', { ascending: true });

  if (stopLookupError) {
    return [];
  }

  if (existingStops && existingStops.length) {
    return existingStops;
  }

  let manifestIds = [];
  if (Array.isArray(run.manifest_ids)) {
    manifestIds = run.manifest_ids;
  } else if (typeof run.manifest_ids === 'string') {
    try {
      manifestIds = JSON.parse(run.manifest_ids);
    } catch (error) {
      manifestIds = [];
    }
  }

  if (!manifestIds.length) {
    return [];
  }

  const stopRows = manifestIds.map((manifestId, index) => ({
    run_id: run.id,
    manifest_id: manifestId,
    stop_order: index + 1,
    status: STOP_WAITING,
    arrival_window: null,
  }));

  const { error: insertError } = await sb.from('dispatch_stops').insert(stopRows);
  if (insertError) {
    return [];
  }

  return stopRows;
}

async function loadActiveRuns() {
  const list = document.getElementById('runsList');
  if (!list) return;

  const { data, error } = await sb.from('dispatch_runs').select('*').order('scheduled_at', { ascending: true });
  if (error) {
    list.innerHTML = `<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">${error.message}</div>`;
    return;
  }

  if (!data || !data.length) {
    list.innerHTML = '<div class="rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-400">No active runs yet.</div>';
    return;
  }

  list.innerHTML = await Promise.all(data.map(async (run) => {
    const stops = await ensureStopsForRun(run);
    const stopCount = (stops || []).length;
    const status = normalizeStatus(run.status || STATUS_QUEUED);
    return `
      <article class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-amber-400">Run ${run.id}</p>
            <h3 class="mt-1 text-base font-semibold">${run.driver_name} · ${run.vehicle_name}</h3>
          </div>
          <span class="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">${status}</span>
        </div>
        <div class="mt-4 grid gap-2 text-sm text-slate-400">
          <div>Scheduled: <span class="font-medium text-slate-100">${run.scheduled_at || '—'}</span></div>
          <div>Stops: <span class="font-medium text-slate-100">${stopCount}</span></div>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="start-run-btn rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300" data-run-id="${run.id}">Start run</button>
          <button class="complete-run-btn rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" data-run-id="${run.id}">Complete run</button>
        </div>
      </article>
    `;
  })).then((items) => items.join(''));

  document.querySelectorAll('.start-run-btn').forEach((button) => {
    button.addEventListener('click', () => updateRunStatus(button.dataset.runId, STATUS_ASSIGNED));
  });
  document.querySelectorAll('.complete-run-btn').forEach((button) => {
    button.addEventListener('click', () => completeDispatchRun(button.dataset.runId));
  });
}

async function updateRunStatus(runId, status) {
  const normalizedRunId = Number(runId);
  if (!Number.isFinite(normalizedRunId)) {
    alert('The selected run ID is invalid.');
    return;
  }

  const { error: runError } = await sb
    .from('dispatch_runs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', normalizedRunId);

  if (runError) {
    alert(runError.message);
    return;
  }

  const { error: stopError } = await sb
    .from('dispatch_stops')
    .update({ status: STOP_WAITING })
    .eq('run_id', normalizedRunId);

  if (stopError) {
    console.warn('Unable to update stop rows for run start:', stopError.message);
  }

  await loadActiveRuns();
  setStatus(`Run ${normalizedRunId} marked ${status}.`, 'success');
}

async function completeDispatchRun(runId) {
  const { data: runData, error: runLookupError } = await sb.from('dispatch_runs').select('*').eq('id', runId).single();
  if (runLookupError || !runData) {
    alert(runLookupError?.message || 'Run not found.');
    return;
  }

  const { data: stops, error: stopLookupError } = await sb.from('dispatch_stops').select('*').eq('run_id', runId);
  if (stopLookupError) {
    alert(stopLookupError.message);
    return;
  }

  const manifestIds = (stops || []).map((stop) => stop.manifest_id).filter(Boolean);
  const { error: runError } = await sb.from('dispatch_runs').update({
    status: STATUS_COMPLETED,
    completed_at: new Date().toISOString(),
    completed_by: 'dispatcher',
  }).eq('id', runId);

  if (runError) {
    alert(runError.message);
    return;
  }

  if (manifestIds.length) {
    const { error: manifestError } = await sb.from('manifests').update({ status: STATUS_COMPLETED }).in('manifest_id', manifestIds);
    if (manifestError) {
      alert(manifestError.message);
      return;
    }

    const eventPayloads = manifestIds.map((manifestId) => ({
      manifest_id: manifestId,
      event_type: 'pickup_completed',
      payload: { run_id: runId, completed_at: new Date().toISOString() },
    }));

    const { error: eventError } = await sb.from('manifest_events').insert(eventPayloads);
    if (eventError) {
      alert(eventError.message);
      return;
    }
  }

  await loadActiveRuns();
  setStatus(`Run ${runId} completed and manifests updated.`, 'success');
}

async function createDispatchRun(event) {
  event.preventDefault();
  const form = document.getElementById('dispatchForm');
  const driverName = document.getElementById('driverName').value.trim();
  const vehicleName = document.getElementById('vehicleName').value.trim();
  const scheduledDate = document.getElementById('scheduledDate').value;
  const scheduledTime = document.getElementById('scheduledTime').value;
  const manifestIds = document.getElementById('manifestIds').value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!driverName || !vehicleName || !scheduledDate || !scheduledTime || !manifestIds.length) {
    setStatus('Driver, vehicle, scheduled time, and at least one manifest are required.', 'error');
    return;
  }

  const scheduledAt = `${scheduledDate}T${scheduledTime}:00`;
  const { data: runData, error: runError } = await sb.from('dispatch_runs').insert({
    driver_name: driverName,
    vehicle_name: vehicleName,
    scheduled_at: scheduledAt,
    manifest_ids: manifestIds,
    status: STATUS_QUEUED,
  }).select().single();

  if (runError || !runData) {
    setStatus(runError?.message || 'Route creation failed.', 'error');
    return;
  }

  // TODO: if a future map view needs pickup pins, wire latitude/longitude here from existing manifest location fields when available.
  const stopRows = manifestIds.map((manifestId, index) => ({
    run_id: runData.id,
    manifest_id: manifestId,
    stop_order: index + 1,
    status: STOP_WAITING,
    arrival_window: null,
  }));

  const { error: stopError } = await sb.from('dispatch_stops').insert(stopRows);
  if (stopError) {
    setStatus(stopError.message, 'error');
    return;
  }

  form.reset();
  await loadDispatchQueue();
  await loadActiveRuns();
  setStatus('Route created and stops queued for pickup.', 'success');
}

function attachEvents() {
  const form = document.getElementById('dispatchForm');
  if (form) form.addEventListener('submit', createDispatchRun);
  const refreshButton = document.getElementById('refreshDispatch');
  if (refreshButton) refreshButton.addEventListener('click', async () => {
    await loadDispatchQueue();
    await loadActiveRuns();
  });
}

async function initDispatch() {
  attachEvents();
  await loadDispatchQueue();
  await loadActiveRuns();
}

window.addEventListener('DOMContentLoaded', initDispatch);
