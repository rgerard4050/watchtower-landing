const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

// Mirrors job.html's STATE_LABELS -- same vocabulary, same order, so an
// operator reading this dashboard and a driver reading job.html never see
// two different names for the same status.
const STATUS_ORDER = [
  'PENDING', 'CLAIMED', 'EN_ROUTE', 'ARRIVED', 'SCANNING', 'INTAKE',
  'PASSPORT', 'MARKETPLACE', 'COMPLETED', 'CANCELLED',
];
const STATE_LABELS = {
  PENDING: 'Waiting to be claimed', CLAIMED: 'Claimed', EN_ROUTE: 'On the way', ARRIVED: 'Arrived',
  SCANNING: 'Scanning material', INTAKE: 'Logged at intake', PASSPORT: 'Passport generated',
  MARKETPLACE: 'Listed for sale', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const EXCEPTION_LABELS = {
  UNCLAIMED_TOO_LONG: { label: 'Unclaimed 24h+', tone: 'warn' },
  CLAIMED_INACTIVE: { label: 'Claimed, no movement 2h+', tone: 'warn' },
  STALLED_IN_PROGRESS: { label: 'Stalled mid-pickup 2h+', tone: 'warn' },
  INTAKE_NOT_ADVANCING: { label: 'Intake logged, no passport 2h+', tone: 'warn' },
  PASSPORT_NOT_LISTED: { label: 'Passport ready, not listed 2h+', tone: 'warn' },
  SCAN_STATE_MISMATCH: { label: 'Scan/job state mismatch', tone: 'error' },
  RECENTLY_CANCELLED: { label: 'Recently cancelled', tone: 'info' },
};

// Ready for pagination once job volume needs it: page/pageSize are real
// state, the fetch is range()-bound, and Prev/Next just move the window --
// switching "status priority" from a client-side re-sort of the current
// page to a DB-side ORDER BY would only require adding a rank column to
// vw_job_dashboard, not restructuring this file.
const PAGE_SIZE = 25;
let currentPage = 0;
let currentFilter = 'ALL';
let currentSort = 'newest';

function esc(s) { return s == null ? '' : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDateTime(iso) { return iso ? new Date(iso).toLocaleString() : '—'; }
function fmtDuration(intervalStr) {
  // Postgres interval text, e.g. "2 days 03:14:07" or "03:14:07" -- show the coarsest unit only.
  if (!intervalStr) return '—';
  const dayMatch = intervalStr.match(/(\d+)\s+days?/);
  if (dayMatch) return dayMatch[1] + 'd';
  const hmMatch = intervalStr.match(/^(\d+):(\d+):/);
  if (hmMatch) return hmMatch[1] + 'h';
  return intervalStr;
}
function statusBadge(status) {
  const toneMap = {
    PENDING: 'border-slate-600 text-slate-300', CLAIMED: 'border-sky-500/50 text-sky-300',
    EN_ROUTE: 'border-sky-500/50 text-sky-300', ARRIVED: 'border-amber-500/50 text-amber-300',
    SCANNING: 'border-amber-500/50 text-amber-300', INTAKE: 'border-emerald-500/50 text-emerald-300',
    PASSPORT: 'border-emerald-500/50 text-emerald-300', MARKETPLACE: 'border-violet-500/50 text-violet-300',
    COMPLETED: 'border-emerald-500/70 text-emerald-300', CANCELLED: 'border-rose-500/50 text-rose-300',
  };
  return `<span class="rounded-full border ${toneMap[status] || 'border-slate-600 text-slate-300'} px-2 py-0.5 text-xs uppercase tracking-wide">${esc(status)}</span>`;
}

async function loadExceptions() {
  const el = document.getElementById('exceptionsList');
  if (!el) return;
  const { data, error } = await sb.from('vw_job_exceptions').select('*').order('job_id');
  if (error) {
    el.innerHTML = `<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">${esc(error.message)}</div>`;
    return;
  }
  if (!data || !data.length) {
    el.innerHTML = '<div class="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-500">No jobs need attention right now.</div>';
    return;
  }
  const toneClass = { warn: 'border-amber-500/40 bg-amber-500/10 text-amber-300', error: 'border-rose-500/40 bg-rose-500/10 text-rose-300', info: 'border-slate-700 bg-slate-900/60 text-slate-400' };
  el.innerHTML = data.map((row) => {
    const meta = EXCEPTION_LABELS[row.exception_type] || { label: row.exception_type, tone: 'warn' };
    return `
      <a href="../job.html?job=${row.job_id}" class="flex items-center justify-between gap-3 rounded-xl border ${toneClass[meta.tone]} px-4 py-2.5 text-sm hover:brightness-125">
        <span>Job #${row.job_id} — ${esc(meta.label)}</span>
        <span class="text-xs opacity-80">${statusBadge(row.status)} · ${esc(fmtDuration(row.since))}</span>
      </a>`;
  }).join('');
}

function sortJobsClientSide(rows) {
  const sorted = rows.slice();
  if (currentSort === 'oldest') {
    sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (currentSort === 'status') {
    sorted.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  } else {
    sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return sorted;
}

async function loadJobs() {
  const tbody = document.getElementById('jobsTable');
  const pageLabel = document.getElementById('pageLabel');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="py-4 text-slate-500">Loading…</td></tr>';

  let query = sb.from('vw_job_dashboard').select('*', { count: 'exact' });
  if (currentFilter !== 'ALL') query = query.eq('status', currentFilter);
  // created_at is a real column, so newest/oldest are true DB-side order +
  // range(); "status priority" re-sorts the fetched page client-side (see
  // PAGE_SIZE comment above) since status has no rank column yet.
  query = query.order('created_at', { ascending: currentSort === 'oldest' });
  const from = currentPage * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, error, count } = await query;
  if (error) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-4 text-rose-400">${esc(error.message)}</td></tr>`;
    return;
  }
  const rows = sortJobsClientSide(data || []);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="py-6 text-center text-slate-500">No jobs match this filter.</td></tr>';
  } else {
    tbody.innerHTML = rows.map((j) => `
      <tr class="border-b border-slate-800/60 hover:bg-slate-900/50">
        <td class="py-2 pr-4"><a class="text-emerald-400 hover:underline" href="../job.html?job=${j.job_id}">#${j.job_id}</a></td>
        <td class="py-2 pr-4">${statusBadge(j.status)}<div class="mt-1 text-xs text-slate-500">${esc(STATE_LABELS[j.status] || '')}</div></td>
        <td class="py-2 pr-4 text-xs">${j.driver_id ? esc(j.driver_id.slice(0, 8)) + '…' : '—'}${j.driver_id ? `<div class="text-slate-500">${esc(j.driver_verification_status || '')}</div>` : ''}</td>
        <td class="py-2 pr-4">${esc(j.intake_material || j.listing_material_type || '—')}</td>
        <td class="py-2 pr-4">${esc(j.resident_name || j.source_type)}</td>
        <td class="py-2 pr-4 text-xs text-slate-400">${fmtDateTime(j.created_at)}</td>
        <td class="py-2 pr-4 text-xs">${esc(j.last_event_type || '—')}<div class="text-slate-500">${fmtDateTime(j.last_event_at)}</div></td>
        <td class="py-2 pr-4 text-xs">${esc(j.passport_status || '—')}</td>
        <td class="py-2 pr-4 text-xs">${esc(j.listing_status || '—')}</td>
      </tr>
    `).join('');
  }

  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;
  if (pageLabel) pageLabel.textContent = `Page ${currentPage + 1} of ${totalPages} (${count ?? rows.length} job${count === 1 ? '' : 's'})`;
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  if (prevBtn) prevBtn.disabled = currentPage === 0;
  if (nextBtn) nextBtn.disabled = currentPage + 1 >= totalPages;
}

async function refreshAll() {
  await Promise.all([loadExceptions(), loadJobs()]);
}

function initJobsDashboard() {
  document.getElementById('statusFilter').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    currentPage = 0;
    loadJobs();
  });
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    currentPage = 0;
    loadJobs();
  });
  document.getElementById('refreshBtn').addEventListener('click', refreshAll);
  document.getElementById('prevPageBtn').addEventListener('click', () => { if (currentPage > 0) { currentPage -= 1; loadJobs(); } });
  document.getElementById('nextPageBtn').addEventListener('click', () => { currentPage += 1; loadJobs(); });

  refreshAll();
  setInterval(refreshAll, 20000);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.watchtowerOperatorReady) return;
  window.watchtowerOperatorReady.then((isOperator) => {
    if (isOperator) initJobsDashboard();
  });
});
