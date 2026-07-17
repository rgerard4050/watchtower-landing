const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const STATUS_ASSIGNED = 'ASSIGNED';
const STATUS_ACTIVE = 'ACTIVE';
const STATUS_COMPLETED = 'COMPLETED';
const STOP_WAITING = 'WAITING';
const STOP_ARRIVED = 'ARRIVED';
const STOP_LOADED = 'LOADED';
const STOP_COMPLETED = 'COMPLETED';
const STOP_CANCELLED = 'CANCELLED';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function loadDriverView() {
  const summary = document.getElementById('driverSummary');
  const manifestsList = document.getElementById('driverManifests');
  if (!summary || !manifestsList) return;

  const { data: runs, error } = await sb
    .from('dispatch_runs')
    .select('*')
    .in('status', [STATUS_ASSIGNED, STATUS_ACTIVE])
    .order('scheduled_at', { ascending: true })
    .limit(1);

  if (error) {
    summary.innerHTML = `<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">${error.message}</div>`;
    return;
  }

  const run = runs && runs[0];
  if (!run) {
    summary.innerHTML = '<div class="rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-400">No assigned route is available right now.</div>';
    manifestsList.innerHTML = '';
    return;
  }

  const { data: stops, error: stopError } = await sb
    .from('dispatch_stops')
    .select('*')
    .eq('run_id', run.id)
    .order('stop_order', { ascending: true });

  if (stopError) {
    summary.innerHTML = `<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">${stopError.message}</div>`;
    return;
  }

  summary.innerHTML = `
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-emerald-400">Assigned Run</p>
        <h2 class="mt-2 text-xl font-semibold">${run.driver_name || 'Driver'}</h2>
        <p class="mt-1 text-sm text-slate-400">Vehicle: <span class="font-medium text-slate-100">${run.vehicle_name || '—'}</span></p>
        <p class="mt-1 text-sm text-slate-400">Scheduled: <span class="font-medium text-slate-100">${formatDateTime(run.scheduled_at)}</span></p>
      </div>
      <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
        <p class="font-medium text-slate-100">Route status</p>
        <p class="mt-2">${run.status || STATUS_ASSIGNED}</p>
        <p class="mt-2">Stops: ${(stops || []).length}</p>
      </div>
    </div>
  `;

  if (!stops || !stops.length) {
    manifestsList.innerHTML = '<div class="rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-400">No stops were attached to this route.</div>';
    return;
  }

  const stopCards = await Promise.all(stops.map(async (stop) => {
    const { data: manifest } = await sb.from('manifests').select('*').eq('manifest_id', stop.manifest_id).maybeSingle();
    const title = manifest ? (manifest.description || 'Untitled batch') : 'Manifest unavailable';
    const source = manifest ? (manifest.source || '—') : '—';
    const weight = manifest && manifest.estimated_weight ? `${manifest.estimated_weight} lbs` : '—';
    const requirements = manifest && manifest.risk_flags && manifest.risk_flags.length ? manifest.risk_flags.join(', ') : 'Standard pickup';
    return `
      <article class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-black/20">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-amber-400">Stop ${stop.stop_order || 1}</p>
            <h3 class="mt-2 text-lg font-semibold">${title}</h3>
          </div>
          <span class="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">${stop.status || STOP_WAITING}</span>
        </div>
        <div class="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
          <div>Source: <span class="font-medium text-slate-100">${source}</span></div>
          <div>Weight: <span class="font-medium text-slate-100">${weight}</span></div>
          <div>Requirements: <span class="font-medium text-slate-100">${requirements}</span></div>
          <div>Manifest: <span class="font-medium text-slate-100">${stop.manifest_id || '—'}</span></div>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="arrived-btn rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300" data-stop-id="${stop.id}" data-run-id="${run.id}">ARRIVED</button>
          <button class="loaded-btn rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300" data-stop-id="${stop.id}" data-run-id="${run.id}">CONFIRM LOADED</button>
          <button class="complete-stop-btn rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" data-stop-id="${stop.id}" data-run-id="${run.id}">COMPLETE STOP</button>
        </div>
      </article>
    `;
  }));

  manifestsList.innerHTML = stopCards.join('');

  document.querySelectorAll('.arrived-btn').forEach((button) => {
    button.addEventListener('click', () => updateStopStatus(button.dataset.stopId, STOP_ARRIVED));
  });
  document.querySelectorAll('.loaded-btn').forEach((button) => {
    button.addEventListener('click', () => updateStopStatus(button.dataset.stopId, STOP_LOADED));
  });
  document.querySelectorAll('.complete-stop-btn').forEach((button) => {
    button.addEventListener('click', () => completeStop(button.dataset.stopId, button.dataset.runId));
  });
}

async function updateStopStatus(stopId, status) {
  const { error } = await sb.from('dispatch_stops').update({ status }).eq('id', stopId);
  if (error) {
    alert(error.message);
    return;
  }
  await loadDriverView();
}

async function completeStop(stopId, runId) {
  const { error: stopError } = await sb.from('dispatch_stops').update({
    status: STOP_COMPLETED,
    completed_at: new Date().toISOString(),
  }).eq('id', stopId);

  if (stopError) {
    alert(stopError.message);
    return;
  }

  const { data: stops, error: stopsError } = await sb.from('dispatch_stops').select('*').eq('run_id', runId);
  if (stopsError) {
    alert(stopsError.message);
    return;
  }

  const allCompleted = (stops || []).length > 0 && (stops || []).every((stop) => stop.status === STOP_COMPLETED);
  if (allCompleted) {
    const { data: stopRows } = await sb.from('dispatch_stops').select('*').eq('run_id', runId);
    const manifestIds = (stopRows || []).map((stop) => stop.manifest_id).filter(Boolean);
    await sb.from('dispatch_runs').update({ status: STATUS_COMPLETED, completed_at: new Date().toISOString(), completed_by: 'driver' }).eq('id', runId);
    if (manifestIds.length) {
      await sb.from('manifests').update({ status: STATUS_COMPLETED }).in('manifest_id', manifestIds);
      const eventPayloads = manifestIds.map((manifestId) => ({
        manifest_id: manifestId,
        event_type: 'pickup_completed',
        payload: { run_id: runId, completed_at: new Date().toISOString() },
      }));
      await sb.from('manifest_events').insert(eventPayloads);
    }
  }

  await loadDriverView();
}

window.addEventListener('DOMContentLoaded', loadDriverView);
