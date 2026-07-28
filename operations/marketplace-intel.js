const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

function esc(s) { return s == null ? '' : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDateTime(iso) { return iso ? new Date(iso).toLocaleString() : '—'; }

async function loadAgingAndInactive() {
  const agingEl = document.getElementById('agingTable');
  const inactiveEl = document.getElementById('inactiveTable');
  if (!agingEl || !inactiveEl) return;

  const { data, error } = await sb.from('vw_marketplace_operator_intel').select('*').order('days_listed', { ascending: false });
  if (error) {
    agingEl.innerHTML = inactiveEl.innerHTML = `<tr><td colspan="6" class="py-4 text-rose-400">${esc(error.message)}</td></tr>`;
    return;
  }
  const rows = data || [];
  const aging = rows.filter((r) => r.aging);
  const inactive = rows.filter((r) => r.inactive);

  agingEl.innerHTML = aging.length ? aging.map((r) => `
    <tr class="border-b border-slate-800/60">
      <td class="py-2 pr-4"><a class="text-emerald-400 hover:underline" href="../marketplace-listing.html?id=${r.listing_id}" target="_blank">#${r.listing_id}</a></td>
      <td class="py-2 pr-4">${esc(r.material_type)}${r.grade ? ' · ' + esc(r.grade) : ''}</td>
      <td class="py-2 pr-4">${r.available_weight} lb</td>
      <td class="py-2 pr-4">${r.days_listed}d</td>
      <td class="py-2 pr-4">${r.offer_count}</td>
      <td class="py-2 pr-4"><a class="text-slate-400 hover:text-amber-300" href="./marketplace.html">Manage →</a></td>
    </tr>`).join('') : '<tr><td colspan="6" class="py-4 text-slate-500">No aging listings.</td></tr>';

  inactiveEl.innerHTML = inactive.length ? inactive.map((r) => `
    <tr class="border-b border-slate-800/60">
      <td class="py-2 pr-4">#${r.listing_id}</td>
      <td class="py-2 pr-4">${esc(r.material_type)}${r.grade ? ' · ' + esc(r.grade) : ''}</td>
      <td class="py-2 pr-4">${r.available_weight} lb</td>
      <td class="py-2 pr-4">${fmtDateTime(r.created_at)}</td>
      <td class="py-2 pr-4"><a class="text-slate-400 hover:text-amber-300" href="./marketplace.html">Publish →</a></td>
    </tr>`).join('') : '<tr><td colspan="5" class="py-4 text-slate-500">No inactive (unpublished 7+ days) listings.</td></tr>';

  renderDemand(rows);
}

function renderDemand(intelRows) {
  const el = document.getElementById('demandTable');
  if (!el) return;
  const byMaterial = {};
  intelRows.forEach((r) => {
    const key = r.material_type || 'Unknown';
    if (!byMaterial[key]) byMaterial[key] = { material: key, listings: 0, offers: 0, lastOfferAt: null };
    byMaterial[key].listings += 1;
    byMaterial[key].offers += r.offer_count || 0;
    if (r.last_offer_at && (!byMaterial[key].lastOfferAt || r.last_offer_at > byMaterial[key].lastOfferAt)) {
      byMaterial[key].lastOfferAt = r.last_offer_at;
    }
  });
  const demand = Object.values(byMaterial).sort((a, b) => b.offers - a.offers);
  el.innerHTML = demand.length ? demand.map((d) => `
    <tr class="border-b border-slate-800/60">
      <td class="py-2 pr-4">${esc(d.material)}</td>
      <td class="py-2 pr-4">${d.listings}</td>
      <td class="py-2 pr-4">${d.offers}</td>
      <td class="py-2 pr-4">${fmtDateTime(d.lastOfferAt)}</td>
    </tr>`).join('') : '<tr><td colspan="4" class="py-4 text-slate-500">No listings yet.</td></tr>';
}

async function loadBuyerActivity() {
  const el = document.getElementById('buyerTable');
  if (!el) return;
  const { data, error } = await sb.from('vw_marketplace_buyer_activity').select('*').order('offer_count', { ascending: false });
  if (error) {
    el.innerHTML = `<tr><td colspan="5" class="py-4 text-rose-400">${esc(error.message)}</td></tr>`;
    return;
  }
  const rows = (data || []).filter((b) => b.offer_count > 0);
  el.innerHTML = rows.length ? rows.map((b) => `
    <tr class="border-b border-slate-800/60">
      <td class="py-2 pr-4">${esc(b.company_name)}</td>
      <td class="py-2 pr-4">${esc(b.buyer_type || '—')}</td>
      <td class="py-2 pr-4">${b.offer_count}</td>
      <td class="py-2 pr-4">${b.accepted_offer_count}</td>
      <td class="py-2 pr-4">${fmtDateTime(b.last_offer_at)}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="py-4 text-slate-500">No buyer offer activity yet.</td></tr>';
}

async function refreshAll() {
  await Promise.all([loadAgingAndInactive(), loadBuyerActivity()]);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.watchtowerOperatorReady) return;
  window.watchtowerOperatorReady.then((isOperator) => {
    if (!isOperator) return;
    document.getElementById('refreshBtn').addEventListener('click', refreshAll);
    refreshAll();
    setInterval(refreshAll, 30000);
  });
});
