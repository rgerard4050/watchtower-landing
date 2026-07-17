const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

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
    .in('status', ['ASSIGNED', 'ACTIVE'])
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

  const manifestIds = Array.isArray(run.manifest_ids) ? run.manifest_ids : [];
  const { data: manifests, error: manifestError } = await sb
    .from('manifests')
    .select('*')
    .in('id', manifestIds)
    .order('id', { ascending: true });

  if (manifestError) {
    summary.innerHTML = `<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">${manifestError.message}</div>`;
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
        <p class="mt-2">${run.status || 'QUEUED'}</p>
        <p class="mt-2">Stops: ${manifestIds.length}</p>
      </div>
    </div>
  `;

  if (!manifests || !manifests.length) {
    manifestsList.innerHTML = '<div class="rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-400">No manifests were attached to this route.</div>';
    return;
  }

  manifestsList.innerHTML = manifests
    .map((manifest) => `
      <article class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-black/20">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-amber-400">Manifest ${manifest.id}</p>
            <h3 class="mt-2 text-lg font-semibold">${manifest.description || 'Untitled batch'}</h3>
          </div>
          <span class="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">${manifest.status || 'reviewing'}</span>
        </div>
        <div class="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
          <div>Source: <span class="font-medium text-slate-100">${manifest.source || '—'}</span></div>
          <div>Weight: <span class="font-medium text-slate-100">${manifest.estimated_weight ? `${manifest.estimated_weight} lbs` : '—'}</span></div>
          <div>Units: <span class="font-medium text-slate-100">${manifest.estimated_units ?? '—'}</span></div>
          <div>Pickup requirements: <span class="font-medium text-slate-100">${manifest.risk_flags && manifest.risk_flags.length ? manifest.risk_flags.join(', ') : 'Standard pickup'}</span></div>
        </div>
        <div class="mt-4">
          <button class="complete-pickup-btn rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" data-run-id="${run.id}" data-manifest-id="${manifest.id}">Confirm Pickup</button>
        </div>
      </article>
    `)
    .join('');

  document.querySelectorAll('.complete-pickup-btn').forEach((button) => {
    button.addEventListener('click', () => completePickup(button.dataset.runId, button.dataset.manifestId));
  });
}

async function completePickup(runId, manifestId) {
  const { error: runError } = await sb.from('dispatch_runs').update({
    status: 'COMPLETED',
    completed_at: new Date().toISOString(),
    completed_by: 'driver',
  }).eq('id', runId);

  if (runError) {
    alert(runError.message);
    return;
  }

  const { error: manifestError } = await sb.from('manifests').update({ status: 'completed' }).eq('id', manifestId);
  if (manifestError) {
    alert(manifestError.message);
    return;
  }

  const { error: eventError } = await sb.from('manifest_events').insert({
    manifest_id: manifestId,
    event_type: 'pickup_completed',
    payload: { run_id: runId, completed_at: new Date().toISOString() },
  });

  if (eventError) {
    alert(eventError.message);
    return;
  }

  await loadDriverView();
  alert('Pickup completed and manifest updated.');
}

window.addEventListener('DOMContentLoaded', loadDriverView);
