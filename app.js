// ═══════════════════════════════════════ CONFIG ═══
const SUPABASE_URL = 'https://quoriworrayfkxdwzhie.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1b3Jpd29ycmF5Zmt4ZHd6aGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTYzMTEsImV4cCI6MjA5NjU5MjMxMX0.LJaiD274vSfiGtRtqeFka7dNtqig3gDOjw6j-pjey6M';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════ STATE ════
let currentUser = null;
let currentProfile = null;
let currentPage = 'dashboard';

// ═══════════════════════════════════════ AUTH ════
async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  btn.textContent = 'Connexion…';
  btn.disabled = true;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = 'Email ou mot de passe incorrect.';
    errEl.classList.remove('hidden');
    btn.textContent = 'Se connecter';
    btn.disabled = false;
    return;
  }
  currentUser = data.user;
  await loadProfile();
  showApp();
}

async function loadProfile() {
  const { data } = await sb.from('profils').select('*').eq('id', currentUser.id).single();
  currentProfile = data;
  const prenom = data?.prenom || currentUser.email;
  const role = data?.role || '';
  document.getElementById('user-name').textContent = prenom;
  document.getElementById('user-role').textContent = role;
  document.getElementById('user-avatar').textContent = prenom[0].toUpperCase();
  document.getElementById('topbar-user').textContent = prenom;
}

async function logout() {
  await sb.auth.signOut();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  currentUser = null; currentProfile = null;
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  navigate('dashboard');
}

// Auto-login si session active
sb.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    currentUser = session.user;
    loadProfile().then(showApp);
  }
});

// Enter key on login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('login-screen').classList.contains('hidden')) login();
});

// ═══════════════════════════════════════ NAVIGATION ════
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  const titles = {
    dashboard: 'Tableau de bord', stock: 'Stock actuel',
    entree: 'Entrée de stock', sortie: 'Sortie de stock',
    deplacement: 'Déplacement', historique: 'Historique des mouvements',
    zones: 'Zones & Dépôts', inventaire: 'Inventaire',
    'bons': 'Bons de préparation'
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  if (window.innerWidth <= 680) closeSidebar();

  const renderers = {
    dashboard: renderDashboard, stock: renderStock,
    entree: renderEntree, sortie: renderSortie,
    deplacement: renderDeplacement, historique: renderHistorique,
    zones: renderZones, inventaire: renderInventaire,
    'bons': renderBons
  };
  renderers[page]?.();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// ═══════════════════════════════════════ TOAST ════
let toastTimer;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast-${type}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

// ═══════════════════════════════════════ MODAL ════
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// Fermer la modal seulement si le clic commence ET finit sur l'overlay (pas en glissant depuis l'intérieur)
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  let mouseDownOnOverlay = false;
  overlay.addEventListener('mousedown', e => {
    mouseDownOnOverlay = e.target === overlay;
  });
  overlay.addEventListener('mouseup', e => {
    if (mouseDownOnOverlay && e.target === overlay) closeModal();
    mouseDownOnOverlay = false;
  });
});

// ═══════════════════════════════════════ HELPERS ════
function fmt(val) { return val ?? '—'; }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function badgeDepot(depot) {
  return depot ? `<span class="badge badge-depot">${depot}</span>` : '—';
}
function spinner() { return '<div class="spinner"></div>'; }
function emptyState(msg) {
  return `<div class="empty-state"><div class="empty-state-icon">▦</div><p>${msg}</p></div>`;
}

// ═══════════════════════════════════════ DASHBOARD ════
async function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = spinner();

  const [{ data: stockData }, { data: mouvData }] = await Promise.all([
    sb.from('stock').select('depot, quantite'),
    sb.from('mouvements').select('type_mouvement, date_mouvement').order('date_mouvement', { ascending: false }).limit(10)
  ]);

  // Calculs
  const totalArticles = stockData?.length || 0;
  const totalUnites = stockData?.reduce((s, r) => s + (r.quantite || 0), 0) || 0;
  const depots = {};
  stockData?.forEach(r => {
    const d = r.depot || 'Non défini';
    if (!depots[d]) depots[d] = { articles: 0, unites: 0 };
    depots[d].articles++;
    depots[d].unites += r.quantite || 0;
  });
  const maxUnites = Math.max(...Object.values(depots).map(d => d.unites), 1);

  // Mouvements récents
  const derniersMouv = mouvData?.slice(0, 5) || [];
  const sorties30j = mouvData?.filter(m => {
    const d = new Date(m.date_mouvement);
    const now = new Date();
    return m.type_mouvement === 'sortie' && (now - d) < 30 * 86400000;
  }).length || 0;

  el.innerHTML = `
    <div class="card-grid card-grid-4" style="margin-bottom:1rem">
      <div class="stat-card">
        <div class="stat-label">Références en stock</div>
        <div class="stat-value stat-accent">${totalArticles}</div>
        <div class="stat-sub">lignes actives</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unités totales</div>
        <div class="stat-value">${totalUnites}</div>
        <div class="stat-sub">pièces / caisses</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Dépôts actifs</div>
        <div class="stat-value stat-success">${Object.keys(depots).length}</div>
        <div class="stat-sub">zones de stockage</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sorties (30j)</div>
        <div class="stat-value stat-warning">${sorties30j}</div>
        <div class="stat-sub">mouvements sortants</div>
      </div>
    </div>

    <div class="card-grid card-grid-2">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Répartition par dépôt</div>
        </div>
        ${Object.entries(depots).sort((a,b) => b[1].unites - a[1].unites).map(([name, d]) => `
          <div class="depot-bar">
            <div class="depot-name">${name}</div>
            <div class="depot-track">
              <div class="depot-fill" style="width:${Math.round(d.unites/maxUnites*100)}%"></div>
            </div>
            <div class="depot-count">${d.unites} u.</div>
          </div>
        `).join('') || emptyState('Aucune donnée')}
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Derniers mouvements</div>
          <a onclick="navigate('historique')" style="font-size:.82rem;color:var(--accent)">Voir tout →</a>
        </div>
        ${derniersMouv.length ? `
          <table><thead><tr><th>Date</th><th>Type</th></tr></thead><tbody>
          ${derniersMouv.map(m => `
            <tr>
              <td>${fmtDate(m.date_mouvement)}</td>
              <td><span class="badge badge-${m.type_mouvement}">${m.type_mouvement}</span></td>
            </tr>
          `).join('')}
          </tbody></table>
        ` : emptyState('Aucun mouvement')}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════ STOCK ════
let stockOffset = 0;
let stockLoading = false;
let stockAllLoaded = false;
let stockTotal = 0;
const STOCK_PER_PAGE = 40;
let stockFilters = { q: '', depot: '', enStockSeulement: false };
let stockScrollObserver = null;
let stockSearchDebounce = null;

async function renderStock() {
  const el = document.getElementById('page-stock');
  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">Stock actuel</div>
        <button class="btn-primary btn-sm" onclick="navigate('entree')">+ Entrée</button>
      </div>
      <div class="search-bar">
        <input type="text" id="stock-search" placeholder="Rechercher référence, lot…" value="${stockFilters.q}" oninput="onStockSearch(this.value)" />
        <select id="stock-depot" onchange="stockFilters.depot=this.value;resetStockScroll();loadStockBatch()">
          <option value="">Tous les dépôts</option>
        </select>
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer;white-space:nowrap">
          <input type="checkbox" id="stock-en-stock" ${stockFilters.enStockSeulement ? 'checked' : ''} onchange="stockFilters.enStockSeulement=this.checked;resetStockScroll();loadStockBatch()" />
          En stock uniquement
        </label>
        <button class="btn-secondary btn-sm" onclick="resetStockFilters()">Réinitialiser</button>
      </div>
      <div id="stock-count" style="font-size:.82rem;color:var(--text-secondary);margin-bottom:.6rem"></div>
      <div id="stock-table-wrap"></div>
      <div id="stock-card-wrap"></div>
      <div id="stock-sentinel" style="height:1px"></div>
      <div id="stock-loader" class="hidden" style="text-align:center;padding:1rem"><div class="spinner" style="margin:0 auto"></div></div>
    </div>
  `;
  await loadDepotOptions('stock-depot', stockFilters.depot);
  resetStockScroll();
  await loadStockBatch();
  initStockScrollObserver();
}

async function loadDepotOptions(selectId, selected = '') {
  const { data } = await sb.from('stock').select('depot').not('depot', 'is', null);
  const depots = [...new Set(data?.map(r => r.depot))].sort();
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value || selected;
  sel.innerHTML = `<option value="">Tous les dépôts</option>` +
    depots.map(d => `<option value="${d}" ${current === d ? 'selected' : ''}>${d}</option>`).join('');
}

function resetStockScroll() {
  stockOffset = 0;
  stockAllLoaded = false;
  stockTotal = 0;
  const tw = document.getElementById('stock-table-wrap');
  const cw = document.getElementById('stock-card-wrap');
  if (tw) tw.innerHTML = '';
  if (cw) cw.innerHTML = '';
}

function onStockSearch(val) {
  stockFilters.q = val;
  clearTimeout(stockSearchDebounce);
  stockSearchDebounce = setTimeout(() => {
    resetStockScroll();
    loadStockBatch();
  }, 300);
}

function initStockScrollObserver() {
  if (stockScrollObserver) stockScrollObserver.disconnect();
  const sentinel = document.getElementById('stock-sentinel');
  if (!sentinel) return;
  stockScrollObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !stockLoading && !stockAllLoaded) {
      loadStockBatch();
    }
  }, { rootMargin: '200px' });
  stockScrollObserver.observe(sentinel);
}

async function loadStockBatch() {
  if (stockLoading || stockAllLoaded) return;
  const tableWrap = document.getElementById('stock-table-wrap');
  const cardWrap = document.getElementById('stock-card-wrap');
  const loader = document.getElementById('stock-loader');
  if (!tableWrap || !cardWrap) return;

  stockLoading = true;
  if (loader) loader.classList.remove('hidden');

  let query = sb.from('stock').select('*', { count: 'exact' });
  if (stockFilters.q) query = query.or(`reference.ilike.%${stockFilters.q}%,lot.ilike.%${stockFilters.q}%,designation.ilike.%${stockFilters.q}%`);
  if (stockFilters.depot) query = query.eq('depot', stockFilters.depot);
  if (stockFilters.enStockSeulement) query = query.gt('quantite', 0);
  query = query.order('reference').range(stockOffset, stockOffset + STOCK_PER_PAGE - 1);

  const { data, count } = await query;
  stockTotal = count || 0;
  if (loader) loader.classList.add('hidden');
  stockLoading = false;

  // Compteur
  const countEl = document.getElementById('stock-count');
  if (countEl) countEl.textContent = `${stockTotal} article${stockTotal > 1 ? 's' : ''}`;

  if (!data?.length) {
    if (stockOffset === 0) {
      tableWrap.innerHTML = emptyState('Aucun article trouvé.');
    }
    stockAllLoaded = true;
    return;
  }

  // Vue tableau desktop — init header si premier batch
  if (stockOffset === 0) {
    tableWrap.innerHTML = `
      <div class="table-wrapper stock-table-view">
        <table>
          <thead><tr>
            <th>Référence</th><th>Lot</th><th>Cond.</th><th>Dépôt</th><th>Rangée</th>
            <th>Stock</th><th>Disponible</th><th>Remarque</th><th></th>
          </tr></thead>
          <tbody id="stock-tbody"></tbody>
        </table>
      </div>`;
    cardWrap.innerHTML = `<div class="stock-card-view" id="stock-cards"></div>`;
  }

  const tbody = document.getElementById('stock-tbody');
  const cards = document.getElementById('stock-cards');

  data.forEach(r => {
    const reserve = r.quantite_reservee || 0;
    const dispo = r.quantite - reserve;
    // Ligne tableau
    if (tbody) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-ref" style="cursor:pointer" onclick="openArticle('${r.id}')">${fmt(r.reference)}</td>
        <td class="td-lot">${fmt(r.lot)}</td>
        <td style="font-size:.78rem;color:var(--text-secondary)">${fmt(r.conditionnement)}</td>
        <td>${badgeDepot(r.depot)}</td>
        <td>${fmt(r.rangee)}</td>
        <td style="font-size:1.05rem;font-weight:700;color:var(--accent);text-align:center">${r.quantite}</td>
        <td style="font-size:1.05rem;font-weight:700;text-align:center;${reserve > 0 ? 'color:var(--warning)' : 'color:var(--success)'}">${dispo}${reserve > 0 ? `<br/><span style="font-size:.7rem;font-weight:400;color:var(--text-secondary)">(${reserve} en cde)</span>` : ''}</td>
        <td style="max-width:180px;font-size:.8rem;color:var(--text-secondary)">${fmt(r.remarque)}</td>
        <td><button class="btn-secondary btn-sm btn-icon" title="Modifier" onclick='openArticle("${r.id}")'>✎</button></td>`;
      tbody.appendChild(tr);
    }
    // Carte mobile
    if (cards) {
      const div = document.createElement('div');
      div.className = 'stock-card';
      div.innerHTML = `
        <div class="stock-card-top" onclick="openArticle('${r.id}')" style="cursor:pointer">
          <span class="stock-card-ref">${fmt(r.reference)}</span>
          <span class="stock-card-qte" style="font-size:1.5rem;font-weight:800;color:var(--accent)">${r.quantite}</span>
        </div>
        <div class="stock-card-meta">
          ${r.lot ? `<span class="stock-card-lot">Lot : ${r.lot}</span>` : ''}
          ${r.conditionnement ? `<span class="badge" style="background:var(--accent-light);color:var(--accent)">${r.conditionnement}</span>` : ''}
          <span class="badge badge-depot">${r.depot || '—'}</span>
          ${r.rangee ? `<span class="stock-card-rangee">Rangée ${r.rangee}</span>` : ''}
          ${reserve > 0 ? `<span style="font-size:.78rem;color:var(--warning)">Disponible: ${dispo} (${reserve} en cde)</span>` : ''}
        </div>
        ${r.photos?.length ? `<div style="margin:.4rem 0"><img src="${r.photos[0]}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;opacity:.85" /></div>` : ''}
        ${r.remarque ? `<div class="stock-card-remarque">${r.remarque}</div>` : ''}
        <div class="stock-card-actions">
          <button class="btn-secondary btn-sm" onclick='openArticle("${r.id}")'>✎ Modifier</button>
        </div>`;
      cards.appendChild(div);
    }
  });

  stockOffset += data.length;
  if (stockOffset >= stockTotal) stockAllLoaded = true;
}

function resetStockFilters() {
  stockFilters = { q: '', depot: '', enStockSeulement: false };
  const s = document.getElementById('stock-search');
  const d = document.getElementById('stock-depot');
  const c = document.getElementById('stock-en-stock');
  if (s) s.value = '';
  if (d) d.value = '';
  if (c) c.checked = false;
  resetStockScroll();
  loadStockBatch();
}

const CLOUDINARY_CLOUD = 'dbmeib7ap';
const CLOUDINARY_PRESET = 'sodimas_photos';

async function openArticle(rowId) {
  const { data: r } = await sb.from('stock').select('*').eq('id', rowId).single();
  if (!r) return;
  const photos = r.photos || [];

  openModal(`${r.reference}`, `
    <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem">
      <span class="badge badge-depot" style="font-size:.85rem">${r.depot || '—'}</span>
      ${r.rangee ? `<span style="font-size:.85rem;color:var(--text-secondary)">Rangée ${r.rangee}</span>` : ''}
      ${r.lot ? `<span style="font-size:.82rem;color:var(--text-secondary);font-family:monospace">Lot : ${r.lot}</span>` : ''}
      ${r.conditionnement ? `<span class="badge" style="background:var(--accent-light);color:var(--accent)">${r.conditionnement}</span>` : ''}
    </div>
    <div style="font-size:1.3rem;font-weight:700;margin-bottom:1rem">
      Quantité : <span style="color:var(--accent)">${r.quantite}</span>
    </div>
    ${r.remarque ? `<p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:1rem">${r.remarque}</p>` : ''}

    <div class="form-section-title">Photos</div>
    <div id="article-photos" style="display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:.8rem">
      ${photos.length ? photos.map((url, i) => `
        <div style="position:relative">
          <img src="${url}" style="width:90px;height:90px;object-fit:cover;border-radius:6px;cursor:pointer" onclick="openPhotoFull('${url}')" />
          <button onclick="deletePhoto('${rowId}', ${i})" style="position:absolute;top:-6px;right:-6px;background:var(--danger);color:#fff;border-radius:50%;width:20px;height:20px;font-size:.7rem;line-height:20px;text-align:center;padding:0">✕</button>
        </div>
      `).join('') : `<p style="font-size:.85rem;color:var(--text-secondary)">Aucune photo pour l'instant.</p>`}
    </div>
    <label class="btn-secondary btn-sm" style="display:inline-block;cursor:pointer">
      📷 Ajouter une photo
      <input type="file" accept="image/*" capture="environment" style="display:none" onchange="uploadPhoto('${rowId}', this)" />
    </label>

    <div class="form-section-title" style="margin-top:1.2rem">Modifier</div>
    <div class="form-group"><label>Référence</label>
      <input type="text" id="edit-ref" value="${r.reference || ''}" style="font-family:monospace" /></div>
    <div class="form-group"><label>N° de lot</label>
      <input type="text" id="edit-lot" value="${r.lot || ''}" style="font-family:monospace" /></div>
    <div class="form-group"><label>Conditionnement</label>
      <input type="text" id="edit-conditionnement" value="${r.conditionnement || ''}" placeholder="ex: palette, caisse, colis…" /></div>
    <div class="form-row">
      <div class="form-group"><label>Dépôt</label>
        <input type="text" id="edit-depot" value="${r.depot || ''}" /></div>
      <div class="form-group"><label>Rangée</label>
        <input type="text" id="edit-rangee" value="${r.rangee || ''}" /></div>
    </div>
    <div class="form-group"><label>Quantité</label>
      <input type="number" id="edit-qte" value="${r.quantite}" min="0" /></div>
    <div class="form-group"><label>Remarque</label>
      <textarea id="edit-remarque">${r.remarque || ''}</textarea></div>
    <div class="form-actions">
      <button class="btn-primary" onclick="saveEditStock('${rowId}')">Enregistrer</button>
      <button class="btn-secondary" onclick="closeModal()">Annuler</button>
    </div>
  `);
}

function openPhotoFull(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  overlay.innerHTML = `<img src="${url}" style="max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px" />`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

async function compressImage(file, maxPx = 1200, quality = 0.8) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    };
    img.src = url;
  });
}

async function uploadPhoto(rowId, input) {
  const file = input.files[0];
  if (!file) return;
  toast('Compression en cours…', 'info');

  const compressed = await compressImage(file);
  const sizeBefore = Math.round(file.size / 1024);
  const sizeAfter = Math.round(compressed.size / 1024);
  toast(`Upload en cours… (${sizeBefore}Ko → ${sizeAfter}Ko)`, 'info');

  const formData = new FormData();
  formData.append('file', compressed, 'photo.jpg');
  formData.append('upload_preset', CLOUDINARY_PRESET);
  formData.append('folder', 'sodimas');

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
      method: 'POST', body: formData
    });
    const data = await res.json();
    if (!data.secure_url) throw new Error('Upload échoué');

    // Récupérer les photos existantes et ajouter la nouvelle
    const { data: row } = await sb.from('stock').select('photos').eq('id', rowId).single();
    const photos = row?.photos || [];
    photos.push(data.secure_url);

    await sb.from('stock').update({ photos, updated_at: new Date().toISOString() }).eq('id', rowId);
    toast('Photo ajoutée !');
    openArticle(rowId); // Rafraîchir la modal
  } catch (e) {
    toast('Erreur upload : ' + e.message, 'error');
  }
}

async function deletePhoto(rowId, index) {
  const { data: row } = await sb.from('stock').select('photos').eq('id', rowId).single();
  const photos = row?.photos || [];
  photos.splice(index, 1);
  await sb.from('stock').update({ photos, updated_at: new Date().toISOString() }).eq('id', rowId);
  toast('Photo supprimée.');
  openArticle(rowId);
}

function editStock(row) {
  openArticle(row.id);
}

async function saveEditStock(id) {
  const ref = document.getElementById('edit-ref').value.trim();
  const lot = document.getElementById('edit-lot').value.trim();
  const conditionnement = document.getElementById('edit-conditionnement').value.trim();
  const depot = document.getElementById('edit-depot').value.trim();
  const rangee = document.getElementById('edit-rangee').value.trim();
  const qte = parseFloat(document.getElementById('edit-qte').value);
  const remarque = document.getElementById('edit-remarque').value.trim();

  if (!ref) { toast('La référence est obligatoire.', 'error'); return; }

  const { error } = await sb.from('stock').update({
    reference: ref, lot: lot || null, conditionnement: conditionnement || null,
    depot: depot || null, rangee: rangee || null,
    quantite: qte, remarque: remarque || null,
    updated_at: new Date().toISOString()
  }).eq('id', id);

  if (error) { toast('Erreur lors de la sauvegarde.', 'error'); return; }
  toast('Modification enregistrée.');
  closeModal();
  resetStockScroll();
  loadStockBatch();
}

// ═══════════════════════════════════════ ENTRÉE ════
async function renderEntree() {
  const el = document.getElementById('page-entree');
  el.innerHTML = `
    <div style="display:flex;gap:.6rem;margin-bottom:1rem;flex-wrap:wrap">
      <button class="btn-primary" id="tab-entree-manuelle" onclick="showEntreeTab('manuelle')" style="opacity:1">✏️ Saisie manuelle</button>
      <button class="btn-secondary" id="tab-entree-photo" onclick="showEntreeTab('photo')">📷 Import par photo</button>
    </div>

    <!-- Saisie manuelle -->
    <div id="entree-manuelle">
      <div class="card form-card">
        <div class="card-header"><div class="card-title">Enregistrer une entrée de stock</div></div>
        <div class="form-section-title">Identification</div>
        <div class="form-group"><label>Référence *</label>
          <input type="text" id="e-ref" placeholder="ex: 35SO530E00077" /></div>
        <div class="form-group"><label>Numéro de lot</label>
          <input type="text" id="e-lot" placeholder="ex: 4500173743" /></div>
        <div class="form-group"><label>Conditionnement</label>
          <input type="text" id="e-conditionnement" placeholder="ex: palette, caisse, colis…" /></div>
        <div class="form-group"><label>Désignation</label>
          <input type="text" id="e-desig" placeholder="ex: Caisse bois, Palette mécanisme…" /></div>
        <div class="form-section-title">Emplacement</div>
        <div class="form-row">
          <div class="form-group"><label>Dépôt *</label>
            <input type="text" id="e-depot" placeholder="ex: 1, 2, RENO…" list="depot-list" /></div>
          <div class="form-group"><label>Rangée</label>
            <input type="text" id="e-rangee" placeholder="ex: 5, FOND, RACK…" /></div>
        </div>
        <div class="form-section-title">Quantité & date</div>
        <div class="form-row">
          <div class="form-group"><label>Quantité *</label>
            <input type="number" id="e-qte" min="1" value="1" /></div>
          <div class="form-group"><label>Date de réception</label>
            <input type="date" id="e-date" value="${new Date().toISOString().slice(0,10)}" /></div>
        </div>
        <div class="form-group"><label>Remarque</label>
          <textarea id="e-remarque" placeholder="Informations complémentaires…"></textarea></div>
        <div class="form-actions">
          <button class="btn-success" id="e-save-btn" onclick="saveEntree()">✓ Enregistrer l'entrée</button>
          <button class="btn-secondary" onclick="resetEntreeForm()">Réinitialiser</button>
        </div>
      </div>
      <datalist id="depot-list"></datalist>
    </div>

    <!-- Import par photo -->
    <div id="entree-photo" class="hidden">
      ${renderImportPhotoHTML('entree')}
    </div>
  `;

  // Charger la liste des dépôts
  const { data } = await sb.from('stock').select('depot').not('depot', 'is', null);
  const depots = [...new Set(data?.map(r => r.depot))].sort();
  const dl = document.getElementById('depot-list');
  if (dl) dl.innerHTML = depots.map(d => `<option value="${d}">`).join('');

  // Charger les imports récents
  chargerSessionsImport('entree');
}

function showEntreeTab(tab) {
  document.getElementById('entree-manuelle').classList.toggle('hidden', tab !== 'manuelle');
  document.getElementById('entree-photo').classList.toggle('hidden', tab !== 'photo');
  document.getElementById('tab-entree-manuelle').className = tab === 'manuelle' ? 'btn-primary' : 'btn-secondary';
  document.getElementById('tab-entree-photo').className = tab === 'photo' ? 'btn-primary' : 'btn-secondary';
  if (tab === 'photo') chargerSessionsImport('entree');
}

async function saveEntree() {
  const saveBtn = document.getElementById('e-save-btn');
  if (saveBtn) {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Enregistrement…';
  }
  const ref = document.getElementById('e-ref').value.trim();
  const lot = document.getElementById('e-lot').value.trim();
  const conditionnement = document.getElementById('e-conditionnement').value.trim();
  const desig = document.getElementById('e-desig').value.trim();
  const depot = document.getElementById('e-depot').value.trim();
  const rangee = document.getElementById('e-rangee').value.trim();
  const qte = parseFloat(document.getElementById('e-qte').value);
  const date = document.getElementById('e-date').value;
  const remarque = document.getElementById('e-remarque').value.trim();

  if (!ref) { toast('La référence est obligatoire.', 'error'); return; }
  if (!depot) { toast('Le dépôt est obligatoire.', 'error'); return; }
  if (!qte || qte <= 0) { toast('La quantité doit être supérieure à 0.', 'error'); return; }

  // Vérifier si la ligne existe déjà dans le stock (clé complète : ref+lot+depot+rangee+conditionnement)
  let stockQuery = sb.from('stock').select('id, quantite, remarque').eq('reference', ref);
  stockQuery = lot ? stockQuery.eq('lot', lot) : stockQuery.is('lot', null);
  stockQuery = conditionnement ? stockQuery.eq('conditionnement', conditionnement) : stockQuery.is('conditionnement', null);
  stockQuery = rangee ? stockQuery.eq('rangee', rangee) : stockQuery.is('rangee', null);
  const { data: existingRows } = await stockQuery.eq('depot', depot).limit(1);
  const existing = existingRows?.[0] || null;

  let stockError;
  if (existing) {
    // Cumuler la remarque si elle est nouvelle
    let nouvelleRemarque = existing.remarque || null;
    if (remarque && remarque !== existing.remarque) {
      nouvelleRemarque = existing.remarque ? `${existing.remarque}\n${remarque}` : remarque;
    }
    const { error } = await sb.from('stock').update({
      quantite: existing.quantite + qte,
      remarque: nouvelleRemarque,
      updated_at: new Date().toISOString()
    }).eq('id', existing.id);
    stockError = error;
  } else {
    // Créer une nouvelle ligne
    const { error } = await sb.from('stock').insert({
      reference: ref, lot: lot || null, conditionnement: conditionnement || null, designation: desig || null,
      depot, rangee: rangee || null, quantite: qte,
      remarque: remarque || null
    });
    stockError = error;
  }

  if (stockError) {
    toast('Erreur stock : ' + stockError.message, 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Enregistrer l\'entrée'; }
    return;
  }

  // Enregistrer le mouvement
  await sb.from('mouvements').insert({
    date_mouvement: date, type_mouvement: 'entree',
    reference: ref, lot: lot || null, conditionnement: conditionnement || null, designation: desig || null,
    depot, rangee: rangee || null, quantite: qte,
    remarque: remarque || null,
    auteur: currentProfile?.prenom || currentUser?.email,
    source: 'app'
  });

  toast(`Entrée enregistrée : ${qte} × ${ref}`);
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Enregistrer l\'entrée'; }
  resetEntreeForm();
}

function resetEntreeForm() {
  ['e-ref','e-lot','e-conditionnement','e-desig','e-depot','e-rangee','e-remarque'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('e-qte').value = '1';
  document.getElementById('e-date').value = new Date().toISOString().slice(0,10);
}

// ═══════════════════════════════════════ SORTIE ════
async function renderSortie() {
  const el = document.getElementById('page-sortie');
  el.innerHTML = `
    <div style="display:flex;gap:.6rem;margin-bottom:1rem;flex-wrap:wrap">
      <button class="btn-primary" id="tab-sortie-manuelle" onclick="showSortieTab('manuelle')">✏️ Saisie manuelle</button>
      <button class="btn-secondary" id="tab-sortie-photo" onclick="showSortieTab('photo')">📷 Import par photo</button>
    </div>

    <!-- Saisie manuelle -->
    <div id="sortie-manuelle">
      <div class="card form-card">
        <div class="card-header"><div class="card-title">Enregistrer une sortie de stock</div></div>
        <div class="form-section-title">Rechercher l'article</div>
        <div class="search-bar" style="margin-bottom:.5rem">
          <input type="text" id="s-search" placeholder="Référence ou lot…" oninput="searchStockForSortie()" />
        </div>
        <div id="s-results"></div>
        <div id="s-form" class="hidden">
          <div class="form-section-title">Sortie</div>
          <div id="s-article-info" style="background:var(--accent-light);border-radius:var(--radius-sm);padding:.8rem;margin-bottom:1rem;font-size:.88rem;color:var(--text-secondary)"></div>
          <div class="form-row">
            <div class="form-group"><label>Date de sortie</label>
              <input type="date" id="s-date" value="${new Date().toISOString().slice(0,10)}" /></div>
          </div>
          <div class="form-group"><label>Remarque</label>
            <textarea id="s-remarque" placeholder="Nom du preneur, commande…"></textarea></div>
          <div class="form-actions">
            <button class="btn-danger" onclick="saveSortie()">↑ Enregistrer la sortie</button>
            <button class="btn-secondary" onclick="cancelSortie()">Annuler</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Import par photo -->
    <div id="sortie-photo" class="hidden">
      ${renderImportPhotoHTML('sortie')}
    </div>
  `;
}

function showSortieTab(tab) {
  document.getElementById('sortie-manuelle').classList.toggle('hidden', tab !== 'manuelle');
  document.getElementById('sortie-photo').classList.toggle('hidden', tab !== 'photo');
  document.getElementById('tab-sortie-manuelle').className = tab === 'manuelle' ? 'btn-primary' : 'btn-secondary';
  document.getElementById('tab-sortie-photo').className = tab === 'photo' ? 'btn-primary' : 'btn-secondary';
  if (tab === 'photo') chargerSessionsImport('sortie');
}

let selectedStockRow = null;
let sortieDebounce = null;
let sortieSelection = {};

async function searchStockForSortie() {
  const q = document.getElementById('s-search').value.trim();
  const res = document.getElementById('s-results');
  clearTimeout(sortieDebounce);
  if (q.length < 2) { res.innerHTML = ''; return; }

  sortieDebounce = setTimeout(async () => {
    const { data } = await sb.from('stock')
      .select('*')
      .or(`reference.ilike.%${q}%,lot.ilike.%${q}%`)
      .order('reference')
      .order('quantite', { ascending: false })
      .limit(20);

    if (!data?.length) {
      res.innerHTML = `<p style="font-size:.85rem;color:var(--text-secondary);margin:.5rem 0">Aucun article trouvé.</p>`;
      return;
    }

    // Grouper par référence
    const grouped = {};
    data.forEach(r => {
      if (!grouped[r.reference]) grouped[r.reference] = [];
      grouped[r.reference].push(r);
    });

    res.innerHTML = Object.entries(grouped).map(([ref, rows]) => `
      <div class="card" style="margin-bottom:.8rem;padding:1rem">
        <div style="font-weight:700;font-size:.95rem;font-family:monospace;margin-bottom:.8rem;color:var(--accent)">${ref}</div>
        <div class="table-wrapper stock-table-view">
          <table>
            <thead><tr><th>Lot</th><th>Dépôt</th><th>Rangée</th><th>Stock dispo</th><th>Qté à sortir</th></tr></thead>
            <tbody>
              ${rows.map(r => {
                const dispo = r.quantite - (r.quantite_reservee || 0);
                const couleur = dispo <= 0 ? 'var(--danger)' : dispo < 3 ? 'var(--warning)' : 'var(--success)';
                return `<tr>
                  <td class="td-lot">${fmt(r.lot)}</td>
                  <td>${badgeDepot(r.depot)}</td>
                  <td>${fmt(r.rangee)}</td>
                  <td style="font-size:1rem;font-weight:700;color:${couleur};text-align:center">${dispo}</td>
                  <td>
                    <input type="number" id="sortie-qte-${r.id}" min="0" value="0"
                      style="width:70px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem"
                      onchange="updateSortieSelection('${r.id}', this.value, ${JSON.stringify(r).replace(/'/g,"&#39;")})" />
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <!-- Vue cartes mobile -->
        <div class="stock-card-view">
          ${rows.map(r => {
            const dispo = r.quantite - (r.quantite_reservee || 0);
            const couleur = dispo <= 0 ? 'var(--danger)' : dispo < 3 ? 'var(--warning)' : 'var(--success)';
            return `<div class="import-card" style="border-left:4px solid ${couleur}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
                <span class="td-lot">${fmt(r.lot) || 'Sans lot'}</span>
                <span style="font-size:1rem;font-weight:700;color:${couleur}">${dispo} dispo</span>
              </div>
              <div style="font-size:.82rem;color:var(--text-secondary);margin-bottom:.5rem">${r.depot || '—'} / ${r.rangee || '—'}</div>
              <div style="display:flex;align-items:center;gap:.5rem">
                <label style="font-size:.85rem">Qté à sortir :</label>
                <input type="number" id="sortie-qte-${r.id}" min="0" value="0"
                  style="width:70px;padding:.4rem .5rem;border:1.5px solid var(--border);border-radius:4px"
                  onchange="updateSortieSelection('${r.id}', this.value, ${JSON.stringify(r).replace(/'/g,"&#39;")})" />
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `).join('');

    // Afficher le formulaire de validation
    document.getElementById('s-form').classList.remove('hidden');
    document.getElementById('s-article-info').innerHTML = `
      Saisissez les quantités à sortir pour chaque lot, puis validez.
    `;
  }, 300);
}

function updateSortieSelection(stockId, qte, row) {
  const q = parseFloat(qte) || 0;
  if (q > 0) {
    sortieSelection[stockId] = { row, qte: q };
  } else {
    delete sortieSelection[stockId];
  }
}

function cancelSortie() {
  selectedStockRow = null;
  sortieSelection = {};
  document.getElementById('s-form').classList.add('hidden');
  document.getElementById('s-search').value = '';
  document.getElementById('s-results').innerHTML = '';
}

async function saveSortie() {
  const date = document.getElementById('s-date').value;
  const remarque = document.getElementById('s-remarque').value.trim();
  const auteur = currentProfile?.prenom || currentUser?.email;

  // Vérifier qu'il y a au moins une ligne sélectionnée
  const lignes = Object.values(sortieSelection);
  if (!lignes.length) { toast('Saisissez au moins une quantité à sortir.', 'error'); return; }

  // Protection anti-double-clic
  const btn = document.querySelector('#s-form .btn-danger');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Enregistrement…'; }

  let ok = 0;
  for (const { row: r, qte } of lignes) {
    if (!qte || qte <= 0) continue;

    // Si stock insuffisant, demander confirmation
    if (qte > r.quantite) {
      const forcer = confirm(`⚠️ Stock insuffisant pour ${r.reference} lot ${r.lot || '—'} — ${r.quantite} disponible(s).\n\nForcer la sortie de ${qte} unités quand même ?`);
      if (!forcer) continue;
    }

    const newQte = r.quantite - qte;
    await sb.from('stock').update({
      quantite: newQte, updated_at: new Date().toISOString()
    }).eq('id', r.id);

    await sb.from('mouvements').insert({
      date_mouvement: date, type_mouvement: 'sortie',
      reference: r.reference, lot: r.lot, depot: r.depot, rangee: r.rangee,
      quantite: qte, remarque: remarque || null, auteur, source: 'app'
    });
    ok++;
  }

  toast(`${ok} sortie${ok > 1 ? 's' : ''} enregistrée${ok > 1 ? 's' : ''} !`);
  cancelSortie();
}

// ═══════════════════════════════════════ DÉPLACEMENT ════
async function renderDeplacement() {
  const el = document.getElementById('page-deplacement');
  el.innerHTML = `
    <div class="card form-card">
      <div class="card-header"><div class="card-title">Déplacer un article</div></div>
      <div class="form-section-title">Rechercher l'article</div>
      <div class="search-bar">
        <input type="text" id="d-search" placeholder="Référence ou lot…" oninput="searchStockForDeplacement()" />
      </div>
      <div id="d-results"></div>
      <div id="d-form" class="hidden">
        <div class="form-section-title">Nouvel emplacement</div>
        <div id="d-article-info" style="background:var(--accent-light);border-radius:var(--radius-sm);padding:.8rem;margin-bottom:1rem;font-size:.88rem"></div>
        <div class="form-row">
          <div class="form-group"><label>Nouveau dépôt *</label>
            <input type="text" id="d-depot" placeholder="ex: 1, 2, RENO…" list="depot-list-d" /></div>
          <div class="form-group"><label>Nouvelle rangée</label>
            <input type="text" id="d-rangee" placeholder="ex: 5, FOND…" /></div>
        </div>
        <div class="form-group"><label>Remarque</label>
          <textarea id="d-remarque" placeholder="Raison du déplacement…"></textarea></div>
        <div class="form-actions">
          <button class="btn-primary" onclick="saveDeplacement()">⇄ Confirmer le déplacement</button>
          <button class="btn-secondary" onclick="cancelDeplacement()">Annuler</button>
        </div>
      </div>
    </div>
    <datalist id="depot-list-d"></datalist>
  `;
  const { data } = await sb.from('stock').select('depot').not('depot', 'is', null);
  const depots = [...new Set(data?.map(r => r.depot))].sort();
  document.getElementById('depot-list-d').innerHTML = depots.map(d => `<option value="${d}">`).join('');
}

let selectedDeplacementRow = null;
let deplacementDebounce = null;

async function searchStockForDeplacement() {
  const q = document.getElementById('d-search').value.trim();
  const res = document.getElementById('d-results');
  clearTimeout(deplacementDebounce);
  if (q.length < 2) { res.innerHTML = ''; return; }
  deplacementDebounce = setTimeout(async () => {
    const { data } = await sb.from('stock').select('*')
      .or(`reference.ilike.%${q}%,lot.ilike.%${q}%`)
      .order('reference').limit(10);
    if (!data?.length) { res.innerHTML = `<p style="font-size:.85rem;color:var(--text-secondary);margin:.5rem 0">Aucun article trouvé.</p>`; return; }
    res.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Référence</th><th>Lot</th><th>Dépôt actuel</th><th>Rangée</th><th>Qté</th><th></th></tr></thead>
      <tbody>${data.map(r => `<tr>
        <td class="td-ref">${fmt(r.reference)}</td>
        <td class="td-lot">${fmt(r.lot)}</td>
        <td>${badgeDepot(r.depot)}</td>
        <td>${fmt(r.rangee)}</td>
        <td class="td-qte">${r.quantite}</td>
        <td><button class="btn-primary btn-sm" onclick='selectForDeplacement(${JSON.stringify(r).replace(/'/g,"&#39;")})'>Déplacer</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }, 300);
}

function selectForDeplacement(row) {
  selectedDeplacementRow = row;
  document.getElementById('d-results').innerHTML = '';
  document.getElementById('d-search').value = '';
  document.getElementById('d-article-info').innerHTML = `
    <strong>${row.reference}</strong>${row.lot ? ` — Lot ${row.lot}` : ''}<br/>
    Emplacement actuel : Dépôt <strong>${row.depot || '—'}</strong>, Rangée <strong>${row.rangee || '—'}</strong>
  `;
  document.getElementById('d-depot').value = row.depot || '';
  document.getElementById('d-rangee').value = row.rangee || '';
  document.getElementById('d-form').classList.remove('hidden');
}

function cancelDeplacement() {
  selectedDeplacementRow = null;
  document.getElementById('d-form').classList.add('hidden');
  document.getElementById('d-search').value = '';
  document.getElementById('d-results').innerHTML = '';
}

async function saveDeplacement() {
  if (!selectedDeplacementRow) return;
  const r = selectedDeplacementRow;
  const newDepot = document.getElementById('d-depot').value.trim();
  const newRangee = document.getElementById('d-rangee').value.trim();
  const remarque = document.getElementById('d-remarque').value.trim();

  if (!newDepot) { toast('Le nouveau dépôt est obligatoire.', 'error'); return; }

  const { error } = await sb.from('stock').update({
    depot: newDepot, rangee: newRangee || null,
    updated_at: new Date().toISOString()
  }).eq('id', r.id);

  if (error) { toast('Erreur : ' + error.message, 'error'); return; }

  await sb.from('mouvements').insert({
    date_mouvement: new Date().toISOString().slice(0,10),
    type_mouvement: 'deplacement',
    reference: r.reference, lot: r.lot,
    depot: newDepot, rangee: newRangee || null,
    quantite: r.quantite,
    remarque: remarque || `Déplacé de ${r.depot}→${newDepot}`,
    auteur: currentProfile?.prenom || currentUser?.email,
    source: 'app'
  });

  toast(`Article déplacé vers ${newDepot}${newRangee ? ' / ' + newRangee : ''}`);
  cancelDeplacement();
}

// ═══════════════════════════════════════ HISTORIQUE ════
let histPage = 1;
const HIST_PER_PAGE = 50;
let histFilters = { q: '', type: '', depot: '', dateFrom: '', dateTo: '' };

async function renderHistorique() {
  const el = document.getElementById('page-historique');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-title">Historique des mouvements</div></div>
      <div class="search-bar">
        <input type="text" id="h-search" placeholder="Référence, lot…" value="${histFilters.q}" oninput="histFilters.q=this.value;histPage=1;loadHistTable()" />
        <select id="h-type" onchange="histFilters.type=this.value;histPage=1;loadHistTable()">
          <option value="">Tous les types</option>
          <option value="entree" ${histFilters.type==='entree'?'selected':''}>Entrée</option>
          <option value="sortie" ${histFilters.type==='sortie'?'selected':''}>Sortie</option>
          <option value="deplacement" ${histFilters.type==='deplacement'?'selected':''}>Déplacement</option>
          <option value="inventaire" ${histFilters.type==='inventaire'?'selected':''}>Inventaire</option>
        </select>
        <select id="h-depot" onchange="histFilters.depot=this.value;histPage=1;loadHistTable()">
          <option value="">Tous les dépôts</option>
        </select>
        <input type="date" id="h-from" value="${histFilters.dateFrom}" onchange="histFilters.dateFrom=this.value;histPage=1;loadHistTable()" title="Du" />
        <input type="date" id="h-to" value="${histFilters.dateTo}" onchange="histFilters.dateTo=this.value;histPage=1;loadHistTable()" title="Au" />
        <button class="btn-secondary btn-sm" onclick="resetHistFilters()">Réinitialiser</button>
      </div>
      <div id="hist-table-wrap"><div class="spinner"></div></div>
    </div>
  `;
  await loadDepotOptionsHist();
  await loadHistTable();
}

async function loadDepotOptionsHist() {
  const { data } = await sb.from('mouvements').select('depot').not('depot', 'is', null);
  const depots = [...new Set(data?.map(r => r.depot))].sort();
  const sel = document.getElementById('h-depot');
  if (!sel) return;
  sel.innerHTML = `<option value="">Tous les dépôts</option>` +
    depots.map(d => `<option value="${d}" ${histFilters.depot===d?'selected':''}>${d}</option>`).join('');
}

async function loadHistTable() {
  const wrap = document.getElementById('hist-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = spinner();

  let query = sb.from('mouvements').select('*', { count: 'exact' });
  if (histFilters.q) query = query.or(`reference.ilike.%${histFilters.q}%,lot.ilike.%${histFilters.q}%`);
  if (histFilters.type) query = query.eq('type_mouvement', histFilters.type);
  if (histFilters.depot) query = query.eq('depot', histFilters.depot);
  if (histFilters.dateFrom) query = query.gte('date_mouvement', histFilters.dateFrom);
  if (histFilters.dateTo) query = query.lte('date_mouvement', histFilters.dateTo);
  query = query.order('date_mouvement', { ascending: false }).order('created_at', { ascending: false })
    .range((histPage - 1) * HIST_PER_PAGE, histPage * HIST_PER_PAGE - 1);

  const { data, count } = await query;
  const total = count || 0;
  const pages = Math.ceil(total / HIST_PER_PAGE);

  if (!data?.length) { wrap.innerHTML = emptyState('Aucun mouvement trouvé.'); return; }

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Date</th><th>Type</th><th>Référence</th><th>Lot</th>
          <th>Dépôt</th><th>Rangée</th><th>Qté</th><th>Par</th><th>Remarque</th>
        </tr></thead>
        <tbody>
          ${data.map(r => `
            <tr>
              <td style="white-space:nowrap">${fmtDate(r.date_mouvement)}</td>
              <td><span class="badge badge-${r.type_mouvement}">${r.type_mouvement}</span></td>
              <td class="td-ref">${fmt(r.reference)}</td>
              <td class="td-lot">${fmt(r.lot)}</td>
              <td>${badgeDepot(r.depot)}</td>
              <td>${fmt(r.rangee)}</td>
              <td class="td-qte">${r.quantite}</td>
              <td style="font-size:.8rem;color:var(--text-secondary)">${fmt(r.auteur)}</td>
              <td style="max-width:160px;font-size:.8rem;color:var(--text-secondary)">${fmt(r.remarque)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="pagination">
      <span>${total} mouvement${total > 1 ? 's' : ''}</span>
      <div class="pagination-btns">
        <button class="page-btn" ${histPage<=1?'disabled':''} onclick="histPage--;loadHistTable()">←</button>
        <span style="padding:.3rem .5rem;font-size:.82rem">${histPage} / ${pages||1}</span>
        <button class="page-btn" ${histPage>=pages?'disabled':''} onclick="histPage++;loadHistTable()">→</button>
      </div>
    </div>
  `;
}

function resetHistFilters() {
  histFilters = { q: '', type: '', depot: '', dateFrom: '', dateTo: '' };
  histPage = 1;
  renderHistorique();
}

// ═══════════════════════════════════════ ZONES ════
async function renderZones() {
  const el = document.getElementById('page-zones');
  el.innerHTML = spinner();

  const { data: stockData } = await sb.from('stock').select('depot, rangee, quantite');

  // Grouper par dépôt > rangée
  const tree = {};
  stockData?.forEach(r => {
    const d = r.depot || 'Non défini';
    const rg = r.rangee || 'Sans rangée';
    if (!tree[d]) tree[d] = {};
    if (!tree[d][rg]) tree[d][rg] = { articles: 0, unites: 0 };
    tree[d][rg].articles++;
    tree[d][rg].unites += r.quantite || 0;
  });

  el.innerHTML = `
    <div class="card-header" style="margin-bottom:1rem">
      <div></div>
      <button class="btn-primary btn-sm" onclick="openAddZoneModal()">+ Nouveau dépôt</button>
    </div>
    <div class="card-grid card-grid-3">
      ${Object.entries(tree).sort().map(([depot, rangees]) => `
        <div class="card">
          <div class="card-header">
            <div class="card-title">${depot}</div>
            <span style="font-size:.8rem;color:var(--text-secondary)">${Object.keys(rangees).length} rangée(s)</span>
          </div>
          <table>
            <thead><tr><th>Rangée</th><th>Réf.</th><th>Unités</th></tr></thead>
            <tbody>
              ${Object.entries(rangees).sort().map(([rg, d]) => `
                <tr>
                  <td>${rg}</td>
                  <td class="td-qte">${d.articles}</td>
                  <td class="td-qte">${d.unites}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('') || emptyState('Aucune zone définie.')}
    </div>
  `;
}

function openAddZoneModal() {
  openModal('Nouveau dépôt / zone', `
    <div class="form-group"><label>Nom du dépôt *</label>
      <input type="text" id="z-depot" placeholder="ex: 4, EXT, HANGAR…" /></div>
    <div class="form-group"><label>Description</label>
      <input type="text" id="z-desc" placeholder="Description optionnelle" /></div>
    <div class="form-actions">
      <button class="btn-primary" onclick="saveNewZone()">Créer</button>
      <button class="btn-secondary" onclick="closeModal()">Annuler</button>
    </div>
  `);
}

async function saveNewZone() {
  const depot = document.getElementById('z-depot').value.trim();
  if (!depot) { toast('Le nom est obligatoire.', 'error'); return; }
  const { error } = await sb.from('zones').insert({ depot, description: document.getElementById('z-desc').value.trim() || null });
  if (error) { toast('Erreur : ' + error.message, 'error'); return; }
  toast('Dépôt créé.');
  closeModal();
  renderZones();
}

// ═══════════════════════════════════════ INVENTAIRE ════
async function renderInventaire() {
  const el = document.getElementById('page-inventaire');
  el.innerHTML = spinner();

  const { data: inventaires } = await sb.from('inventaires')
    .select('*').order('date_inventaire', { ascending: false }).limit(20);

  el.innerHTML = `
    <div class="card-header" style="margin-bottom:1rem">
      <div></div>
      <button class="btn-primary" onclick="startInventaire()">+ Nouvel inventaire</button>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Sessions d'inventaire</div></div>
      ${inventaires?.length ? `
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Date</th><th>Par</th><th>Statut</th><th>Remarque</th><th></th></tr></thead>
            <tbody>
              ${inventaires.map(inv => `
                <tr>
                  <td>${fmtDate(inv.date_inventaire)}</td>
                  <td>${fmt(inv.auteur)}</td>
                  <td><span class="badge ${inv.statut === 'termine' ? 'badge-entree' : 'badge-deplacement'}">${inv.statut}</span></td>
                  <td style="font-size:.85rem;color:var(--text-secondary)">${fmt(inv.remarque)}</td>
                  <td style="display:flex;gap:.4rem">
                    <button class="btn-secondary btn-sm" onclick="viewInventaire('${inv.id}')">Voir</button>
                    ${inv.statut === 'en_cours' ? `
                      <button class="btn-secondary btn-sm" onclick="importPhotoInventaire('${inv.id}')">📷</button>
                      <button class="btn-danger btn-sm" onclick="deleteInventaire('${inv.id}')">🗑</button>
                    ` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : emptyState('Aucun inventaire réalisé.')}
    </div>
  `;
}

async function startInventaire() {
  const { data, error } = await sb.from('inventaires').insert({
    date_inventaire: new Date().toISOString().slice(0,10),
    auteur: currentProfile?.prenom || currentUser?.email,
    statut: 'en_cours'
  }).select().single();

  if (error) { toast('Erreur : ' + error.message, 'error'); return; }
  toast('Nouvel inventaire créé. Utilisez le bouton 📷 pour importer les photos.');
  renderInventaire();
}

async function viewInventaire(invId) {
  const { data: inv } = await sb.from('inventaires').select('*').eq('id', invId).single();
  const { data: lignes } = await sb.from('inventaire_lignes').select('*').eq('inventaire_id', invId).order('created_at');

  const isEnCours = inv.statut === 'en_cours';
  const el = document.getElementById('page-inventaire');

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:1rem;flex-wrap:wrap">
      <button class="btn-secondary btn-sm" onclick="renderInventaire()">← Retour</button>
      <h2 style="font-size:1rem;font-weight:600;flex:1">
        Inventaire du ${fmtDate(inv.date_inventaire)} — ${inv.auteur || '—'}
        <span class="badge ${inv.statut === 'termine' ? 'badge-entree' : 'badge-deplacement'}" style="margin-left:.5rem">${inv.statut === 'termine' ? 'Terminé' : 'En cours'}</span>
      </h2>
      ${isEnCours ? `
        <button class="btn-secondary btn-sm" onclick="importPhotoInventaire('${invId}')">📷 Ajouter photo</button>
        <button class="btn-secondary btn-sm" onclick="ajouterLigneInv('${invId}')">+ Ligne</button>
        <button class="btn-success" onclick="cloturerInventaire('${invId}')" ${!lignes?.length ? 'disabled' : ''}>✓ Clôturer</button>
      ` : ''}
    </div>

    <div class="card">
      ${lignes?.length ? `
        <!-- Vue tableau desktop -->
        <div class="table-wrapper stock-table-view">
          <table>
            <thead><tr>
              <th>Référence</th><th>Lot</th><th>Cond.</th><th>Dépôt</th><th>Rangée</th>
              <th>Théorique</th><th>Réel</th><th>Écart</th><th>Remarque</th>
              ${isEnCours ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${lignes.map(l => {
                const ecart = (l.quantite_reelle ?? 0) - (l.quantite_theorique ?? 0);
                return `<tr>
                  <td>${isEnCours ? `<input type="text" value="${l.reference || ''}" onchange="invLigneChanged('${l.id}','reference',this.value)" style="width:100%;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.8rem;font-family:monospace" />` : `<span class="td-ref" style="font-size:.78rem">${l.reference}</span>`}</td>
                  <td>${isEnCours ? `<input type="text" value="${l.lot || ''}" onchange="invLigneChanged('${l.id}','lot',this.value)" style="width:100%;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.78rem;font-family:monospace" />` : `<span class="td-lot">${fmt(l.lot)}</span>`}</td>
                  <td>${isEnCours ? `<input type="text" value="${l.conditionnement || ''}" onchange="invLigneChanged('${l.id}','conditionnement',this.value)" style="width:80px;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.78rem" placeholder="palette…" />` : `<span style="font-size:.78rem;color:var(--text-secondary)">${fmt(l.conditionnement)}</span>`}</td>
                  <td>${isEnCours ? `<input type="text" value="${l.depot || ''}" onchange="invLigneChanged('${l.id}','depot',this.value)" style="width:70px;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem" />` : badgeDepot(l.depot)}</td>
                  <td>${isEnCours ? `<input type="text" value="${l.rangee || ''}" onchange="invLigneChanged('${l.id}','rangee',this.value)" style="width:65px;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem" />` : `${fmt(l.rangee)}`}</td>
                  <td class="td-qte">${l.quantite_theorique ?? 0}</td>
                  <td>${isEnCours ? `<input type="number" min="0" value="${l.quantite_reelle ?? 0}" onchange="invLigneChanged('${l.id}','quantite_reelle',this.value)" style="width:65px;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" />` : `<span class="td-qte">${l.quantite_reelle ?? 0}</span>`}</td>
                  <td class="td-qte" id="inv-ecart-${l.id}" style="color:${ecart < 0 ? 'var(--danger)' : ecart > 0 ? 'var(--success)' : 'var(--text-secondary)'}">${ecart > 0 ? '+'+ecart : ecart}</td>
                  <td>${isEnCours ? `<input type="text" value="${l.remarque || ''}" onchange="invLigneChanged('${l.id}','remarque',this.value)" style="width:100%;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.8rem" placeholder="remarque…" />` : `<span style="font-size:.8rem;color:var(--text-secondary)">${l.remarque || ''}</span>`}</td>
                  ${isEnCours ? `<td><button class="btn-danger btn-sm" onclick="deleteInvLigne('${l.id}','${invId}')">✕</button></td>` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <!-- Vue cartes mobile/tablette -->
        <div class="stock-card-view">
          ${lignes.map(l => {
            const ecart = (l.quantite_reelle ?? 0) - (l.quantite_theorique ?? 0);
            return `<div class="import-card">
              <div class="import-card-header">
                <span style="font-size:.78rem;color:var(--text-secondary);font-weight:600">${l.reference || '—'}</span>
                ${isEnCours ? `<button class="btn-danger btn-sm" onclick="deleteInvLigne('${l.id}','${invId}')">✕</button>` : ''}
              </div>
              ${isEnCours ? `
                <div class="form-group" style="margin-bottom:.5rem"><label>Référence</label>
                  <input type="text" value="${l.reference || ''}" onchange="invLigneChanged('${l.id}','reference',this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem;font-family:monospace" /></div>
                <div class="form-row">
                  <div class="form-group" style="margin-bottom:.5rem"><label>Lot</label>
                    <input type="text" value="${l.lot || ''}" onchange="invLigneChanged('${l.id}','lot',this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.88rem;font-family:monospace" /></div>
                  <div class="form-group" style="margin-bottom:.5rem"><label>Qté réelle</label>
                    <input type="number" min="0" value="${l.quantite_reelle ?? 0}" onchange="invLigneChanged('${l.id}','quantite_reelle',this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" /></div>
                </div>
                <div class="form-group" style="margin-bottom:.5rem"><label>Conditionnement</label>
                  <input type="text" value="${l.conditionnement || ''}" onchange="invLigneChanged('${l.id}','conditionnement',this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" placeholder="palette, caisse, colis…" /></div>
                <div class="form-row">
                  <div class="form-group" style="margin-bottom:0"><label>Dépôt</label>
                    <input type="text" value="${l.depot || ''}" onchange="invLigneChanged('${l.id}','depot',this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" /></div>
                  <div class="form-group" style="margin-bottom:0"><label>Rangée</label>
                    <input type="text" value="${l.rangee || ''}" onchange="invLigneChanged('${l.id}','rangee',this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" /></div>
                </div>
              ` : `<div style="font-size:.85rem;color:var(--text-secondary)">Lot : ${fmt(l.lot)} | ${fmt(l.conditionnement)} | ${l.depot || '—'} / ${l.rangee || '—'}</div>`}
              <div style="margin-top:.5rem;font-size:.85rem">
                Théorique : <strong>${l.quantite_theorique ?? 0}</strong> → Réel : <strong>${l.quantite_reelle ?? 0}</strong> →
                Écart : <strong style="color:${ecart < 0 ? 'var(--danger)' : ecart > 0 ? 'var(--success)' : 'var(--text-secondary)'}">${ecart > 0 ? '+'+ecart : ecart}</strong>
              </div>
            </div>`;
          }).join('')}
        </div>
      ` : `<div style="text-align:center;padding:2rem;color:var(--text-secondary)">
        Aucune ligne saisie. Utilisez le bouton 📷 pour importer les lignes par photo.
      </div>`}
    </div>
  `;
}

async function invLigneChanged(ligneId, champ, valeur) {
  const update = {};
  if (champ === 'quantite_reelle' || champ === 'quantite_theorique') {
    update[champ] = parseFloat(valeur) || 0;
  } else {
    update[champ] = valeur.trim() || null;
  }
  await sb.from('inventaire_lignes').update(update).eq('id', ligneId);

  if (champ === 'quantite_reelle') {
    const { data: l } = await sb.from('inventaire_lignes').select('quantite_theorique, quantite_reelle').eq('id', ligneId).single();
    const ecart = (l?.quantite_reelle ?? 0) - (l?.quantite_theorique ?? 0);
    const ecartEl = document.getElementById('inv-ecart-' + ligneId);
    if (ecartEl) {
      ecartEl.textContent = ecart > 0 ? '+' + ecart : ecart;
      ecartEl.style.color = ecart < 0 ? 'var(--danger)' : ecart > 0 ? 'var(--success)' : 'var(--text-secondary)';
    }
  }
}

async function ajouterLigneInv(invId) {
  const { error } = await sb.from('inventaire_lignes').insert({
    inventaire_id: invId, reference: '', quantite_theorique: 0, quantite_reelle: 0
  });
  if (error) { toast('Erreur : ' + error.message, 'error'); return; }
  viewInventaire(invId);
}

async function deleteInvLigne(ligneId, invId) {
  await sb.from('inventaire_lignes').delete().eq('id', ligneId);
  toast('Ligne supprimée.');
  viewInventaire(invId);
}

async function saveInventaireLigne(input) {
  const { dataset } = input;
  const reel = parseFloat(input.value);
  if (isNaN(reel)) return;
  const theorique = parseFloat(dataset.theorique);

  await sb.from('inventaire_lignes').upsert({
    inventaire_id: dataset.inv, reference: dataset.ref,
    depot: dataset.depot || null, quantite_theorique: theorique, quantite_reelle: reel
  }, { onConflict: 'inventaire_id,reference,depot' });

  const ecart = reel - theorique;
  const ecartEl = document.getElementById('ecart-' + dataset.id);
  if (ecartEl) {
    ecartEl.textContent = ecart > 0 ? '+' + ecart : ecart === 0 ? '0' : ecart;
    ecartEl.style.color = ecart < 0 ? 'var(--danger)' : ecart > 0 ? 'var(--success)' : 'var(--text-secondary)';
  }
}

async function cloturerInventaire(invId) {
  const { error } = await sb.from('inventaires').update({ statut: 'termine' }).eq('id', invId);
  if (error) { toast('Erreur.', 'error'); return; }

  // Récupérer toutes les lignes de l'inventaire
  const { data: lignes } = await sb.from('inventaire_lignes')
    .select('*').eq('inventaire_id', invId);

  let crees = 0, mis_a_jour = 0;

  for (const ligne of lignes || []) {
    if (!ligne.reference || ligne.quantite_reelle === null) continue;

    // Clé d'unicité complète : ref+lot+depot+rangee+conditionnement
    let query = sb.from('stock').select('id, remarque').eq('reference', ligne.reference);
    query = ligne.lot ? query.eq('lot', ligne.lot) : query.is('lot', null);
    query = ligne.depot ? query.eq('depot', ligne.depot) : query.is('depot', null);
    query = ligne.rangee ? query.eq('rangee', ligne.rangee) : query.is('rangee', null);
    query = ligne.conditionnement ? query.eq('conditionnement', ligne.conditionnement) : query.is('conditionnement', null);
    const { data: existingRows } = await query.limit(1);
    const existing = existingRows?.[0] || null;

    if (existing) {
      // Mettre à jour la quantité
      await sb.from('stock').update({
        quantite: ligne.quantite_reelle,
        depot: ligne.depot || undefined,
        rangee: ligne.rangee || undefined,
        remarque: ligne.remarque || undefined,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
      mis_a_jour++;
    } else {
      // Créer la référence si elle n'existe pas
      await sb.from('stock').insert({
        reference: ligne.reference,
        lot: ligne.lot || null,
        conditionnement: ligne.conditionnement || null,
        depot: ligne.depot || null,
        rangee: ligne.rangee || null,
        remarque: ligne.remarque || null,
        quantite: ligne.quantite_reelle,
        quantite_reservee: 0
      });
      crees++;
    }

    // Enregistrer le mouvement d'inventaire
    await sb.from('mouvements').insert({
      date_mouvement: new Date().toISOString().slice(0,10),
      type_mouvement: 'inventaire',
      reference: ligne.reference,
      lot: ligne.lot || null,
      depot: ligne.depot || null,
      rangee: ligne.rangee || null,
      quantite: ligne.quantite_reelle,
      auteur: currentProfile?.prenom || currentUser?.email,
      source: 'inventaire',
      remarque: `Inventaire ${invId} — écart : ${(ligne.quantite_reelle - (ligne.quantite_theorique || 0))}`
    });
  }

  toast(`Inventaire clôturé : ${mis_a_jour} article${mis_a_jour > 1 ? 's' : ''} mis à jour, ${crees} créé${crees > 1 ? 's' : ''}.`);
  closeModal();
  renderInventaire();
}

async function deleteInventaire(invId) {
  if (!confirm('Supprimer cet inventaire et toutes ses lignes ?')) return;
  await sb.from('inventaire_lignes').delete().eq('inventaire_id', invId);
  await sb.from('inventaires').delete().eq('id', invId);
  toast('Inventaire supprimé.');
  renderInventaire();
}

// Import photo depuis la page inventaire
let invPhotoId = null;
let invPhotoData = null;
let invPhotoRows = [];
let invPhotoRowsOriginal = []; // snapshot de ce que Claude a lu, avant corrections

function importPhotoInventaire(invId) {
  invPhotoId = invId;
  invPhotoRows = [];
  invPhotoData = null;

  openModal('Import photo — Inventaire', `
    <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:1rem">
      Prenez en photo la feuille d'inventaire. Les quantités comptées seront importées dans cet inventaire.
    </p>
    <div id="inv-drop-zone" class="ip-drop-zone" onclick="document.getElementById('inv-file').click()">
      <div id="inv-preview-wrap">
        <div class="ip-drop-icon">📷</div>
        <p>Appuyez pour prendre une photo ou choisir depuis la galerie</p>
      </div>
      <input type="file" id="inv-file" accept="image/*" style="display:none" onchange="onInvPhotoSelected(this)" />
    </div>
    <div id="inv-analyse-wrap" class="hidden" style="margin-top:1rem">
      <button class="btn-primary" id="inv-analyse-btn" onclick="analyseInvPhoto()">🔍 Analyser la photo</button>
    </div>
    <div id="inv-results-wrap" class="hidden" style="margin-top:1rem">
      <div class="form-section-title">Vérification</div>
      <div id="inv-cards"></div>
      <div class="form-actions" style="margin-top:1rem">
        <button class="btn-secondary" onclick="addInvRow()">+ Ligne</button>
        <button class="btn-success" id="inv-validate-btn" onclick="validateInvPhoto()">✓ Importer dans l'inventaire</button>
      </div>
    </div>
  `);
}

async function onInvPhotoSelected(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('inv-preview-wrap').innerHTML = `
      <img src="${e.target.result}" style="max-width:100%;max-height:250px;border-radius:8px;object-fit:contain" />
      <p style="font-size:.8rem;color:var(--text-secondary);margin-top:.4rem">Appuyez pour changer la photo</p>
    `;
  };
  reader.readAsDataURL(file);
  const compressed = await compressImage(file, 1600, 0.85);
  const b64 = await new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result.split(',')[1]);
    r.readAsDataURL(compressed);
  });
  invPhotoData = { base64: b64, mediaType: 'image/jpeg' };
  document.getElementById('inv-analyse-wrap').classList.remove('hidden');
}

async function analyseInvPhoto() {
  if (!invPhotoData) return;
  const btn = document.getElementById('inv-analyse-btn');
  btn.textContent = '⏳ Analyse en cours…';
  btn.disabled = true;

  const corrections = await chargerCorrections();
  const correctionsPrompt = buildCorrectionsPrompt(corrections);

  const prompt = `Tu analyses une feuille manuscrite d'inventaire de stock pour un entrepôt d'ascenseurs.

RÉFÉRENCES — format EXACT : [2ch][SO ou PO][3ch avec zéros][E ou P][5ch avec zéros] = 13 caractères total
Exemples d'écriture abrégée de Matthias :
- 33/60P/3001 → 33SO060P03001 (P précisé = remplace le E)
- 32/40/40 → 32SO040E00040 (pas de P = E par défaut)
- 35/530/20 → 35SO530E00020
- 33/70P/3047 → 33SO070P03047
- 38/20P/04 → 38SO020P00004
Les "/" sont des SÉPARATEURS, jamais des chiffres à inclure dans la référence.
Si la réf est écrite en entier (ex: 35SO530E00075), la copier telle quelle.
Ignorer le préfixe x/y/v (coche de préparation).

NUMÉROS DE LOT : "7" et "9" souvent confondus. 7 = trait horizontal haut + descend droit. 9 = boucle fermée en haut.

QUANTITÉS — notation mixte, TRÈS IMPORTANT, les symboles s'ADDITIONNENT :
- Symboles : I=1, II=2, III=3, Γ ou L cursif (équerre)=2, Π (portique, 2 traits reliés en haut)=3, □=4, □barré=5
- Combinaisons : □barré+I=6, □barré+II=7, □barré+III=8, □barré+Γ=7, □+Γ=6, Π+I=4
- Π ≠ Γ : Π a deux traits verticaux reliés en haut (=3) ; Γ a un seul trait avec crochet (=2)
- Additionne TOUS les symboles présents pour une ligne, ne prends pas juste le dernier

ZONES : 
- D2A6 = Dépôt "2" Rangée "6" (le A devant le numéro de rangée est ignoré)
- D2 A11 = Dépôt "2" Rangée "11" (ignorer le A, garder juste le numéro)
- RENO 3 = Dépôt "RENO" Rangée "3"
- QUAI SODIMAS 1 = Dépôt "QUAI SODIMAS" Rangée "1"
- Règle générale : si rangée = lettre + chiffre(s), ne garder que le(s) chiffre(s)
- " = même référence que la ligne précédente. Accolade } = zone commune.

CONDITIONNEMENT : si la feuille précise palette/caisse/colis/pièce (ex: "2 PAL", "5 colis"), extraire ce mot dans le champ conditionnement, sinon null. Si une même référence+lot apparaît avec des conditionnements DIFFÉRENTS sur la feuille, crée une ligne JSON distincte pour chacun (ne pas additionner).

Retourne UNIQUEMENT un JSON valide :
[{"reference": "35SO530E00067", "lot": "4500224268", "quantite": 1, "conditionnement": null, "depot": "2", "rangee": "6", "remarque": null}, ...]
Si valeur absente, mets null. Le champ "remarque" = tout commentaire dans la colonne remarque.${correctionsPrompt}`;

  try {
    const response = await fetch('/.netlify/functions/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: invPhotoData.mediaType, data: invPhotoData.base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    const text = data.content?.map(c => c.text || '').join('').trim();
    const firstBracketInv = text.indexOf('[');
    const lastBracketInv = text.lastIndexOf(']');
    if (firstBracketInv === -1 || lastBracketInv === -1) throw new Error('JSON introuvable');
    invPhotoRows = JSON.parse(text.slice(firstBracketInv, lastBracketInv + 1));
    // Sauvegarder le snapshot original avant toute correction manuelle
    invPhotoRowsOriginal = JSON.parse(JSON.stringify(invPhotoRows));

    btn.textContent = '🔍 Analyser la photo';
    btn.disabled = false;

    renderInvCards();
    document.getElementById('inv-results-wrap').classList.remove('hidden');

  } catch(e) {
    toast('Erreur : ' + e.message, 'error');
    btn.textContent = '🔍 Analyser la photo';
    btn.disabled = false;
  }
}

function renderInvCards() {
  const wrap = document.getElementById('inv-cards');
  if (!wrap) return;
  wrap.innerHTML = '';
  invPhotoRows.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'import-card';
    div.innerHTML = `
      <div class="import-card-header">
        <span style="font-size:.78rem;color:var(--text-secondary);font-weight:600">Ligne ${i+1}</span>
        <button class="btn-danger btn-sm" onclick="removeInvRow(${i})">✕</button>
      </div>
      <div class="form-group" style="margin-bottom:.6rem">
        <label>Référence</label>
        <input type="text" value="${row.reference || ''}" onchange="invPhotoRows[${i}].reference=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem;font-family:monospace" />
      </div>
      <div class="form-row">
        <div class="form-group" style="margin-bottom:.6rem">
          <label>Lot</label>
          <input type="text" value="${row.lot || ''}" onchange="invPhotoRows[${i}].lot=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.88rem;font-family:monospace" />
        </div>
        <div class="form-group" style="margin-bottom:.6rem">
          <label>Qté réelle</label>
          <input type="number" value="${row.quantite ?? 0}" min="0" onchange="invPhotoRows[${i}].quantite=parseFloat(this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
        </div>
      </div>
      <div class="form-group" style="margin-bottom:.6rem">
        <label>Conditionnement</label>
        <input type="text" value="${row.conditionnement || ''}" onchange="invPhotoRows[${i}].conditionnement=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" placeholder="palette, caisse, colis…" />
      </div>
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0">
          <label>Dépôt</label>
          <input type="text" value="${row.depot || ''}" onchange="invPhotoRows[${i}].depot=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Rangée</label>
          <input type="text" value="${row.rangee || ''}" onchange="invPhotoRows[${i}].rangee=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0;margin-top:.6rem">
        <label>Remarque</label>
        <input type="text" value="${row.remarque || ''}" onchange="invPhotoRows[${i}].remarque=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
      </div>
    `;
    wrap.appendChild(div);
  });
}

function addInvRow() {
  invPhotoRows.push({ reference: '', lot: '', conditionnement: '', quantite: 0, depot: '', rangee: '' });
  renderInvCards();
  document.getElementById('inv-results-wrap').classList.remove('hidden');
}

function removeInvRow(i) {
  invPhotoRows.splice(i, 1);
  renderInvCards();
}

// ═══════════════════════════════════════ IA — CORRECTIONS ════

async function enregistrerCorrections(rowsAvant, rowsApres) {
  // Compare ce que Claude a lu (avant) vs ce que l'utilisateur a validé (après)
  const champs = ['reference', 'lot', 'depot', 'rangee'];

  for (let i = 0; i < Math.min(rowsAvant.length, rowsApres.length); i++) {
    for (const champ of champs) {
      const lu = (rowsAvant[i][champ] || '').toString().trim();
      const corrige = (rowsApres[i][champ] || '').toString().trim();

      if (lu && corrige && lu !== corrige) {
        // Insérer ou incrémenter le compteur d'occurrences
        const { data: existing } = await sb.from('corrections_ia')
          .select('id, occurrences')
          .eq('champ', champ)
          .eq('valeur_lue', lu)
          .maybeSingle();

        if (existing) {
          await sb.from('corrections_ia').update({
            valeur_corrigee: corrige,
            occurrences: existing.occurrences + 1,
            updated_at: new Date().toISOString()
          }).eq('id', existing.id);
        } else {
          await sb.from('corrections_ia').insert({
            champ, valeur_lue: lu, valeur_corrigee: corrige
          });
        }
      }
    }
  }
}

async function chargerCorrections() {
  // Récupère les corrections les plus fréquentes (min 1 occurrence)
  const { data } = await sb.from('corrections_ia')
    .select('*')
    .order('occurrences', { ascending: false })
    .limit(50);
  return data || [];
}

function buildCorrectionsPrompt(corrections) {
  if (!corrections.length) return '';

  const refs = corrections.filter(c => c.champ === 'reference');
  const lots = corrections.filter(c => c.champ === 'lot');
  const depots = corrections.filter(c => c.champ === 'depot');

  let prompt = '\n\nCORRECTIONS APPRISES — applique-les systématiquement :\n';

  if (refs.length) {
    prompt += 'Références (lu → correct) :\n';
    refs.forEach(c => prompt += `- "${c.valeur_lue}" → "${c.valeur_corrigee}" (${c.occurrences}x)\n`);
  }
  if (lots.length) {
    prompt += 'Numéros de lot (lu → correct) :\n';
    lots.forEach(c => prompt += `- "${c.valeur_lue}" → "${c.valeur_corrigee}" (${c.occurrences}x)\n`);
  }
  if (depots.length) {
    prompt += 'Zones/Dépôts (lu → correct) :\n';
    depots.forEach(c => prompt += `- "${c.valeur_lue}" → "${c.valeur_corrigee}" (${c.occurrences}x)\n`);
  }

  return prompt;
}

async function validateInvPhoto() {
  if (!invPhotoRows.length || !invPhotoId) return;

  const btn = document.getElementById('inv-validate-btn');
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '⏳ Import en cours…';
  }

  // Enregistrer les corrections (diff entre ce que Claude a lu et ce que l'utilisateur a validé)
  if (invPhotoRowsOriginal.length) {
    await enregistrerCorrections(invPhotoRowsOriginal, invPhotoRows);
  }

  const { data: stock } = await sb.from('stock').select('*');
  let ok = 0, errors = 0;

  for (const row of invPhotoRows) {
    if (!row.reference) continue;
    const stockRow = stock?.find(s => s.reference === row.reference);
    const theorique = stockRow?.quantite ?? 0;

    const { error } = await sb.from('inventaire_lignes').insert({
      inventaire_id: invPhotoId,
      reference: row.reference,
      lot: row.lot || null,
      conditionnement: row.conditionnement || null,
      depot: row.depot || null,
      rangee: row.rangee || null,
      remarque: row.remarque || null,
      quantite_theorique: theorique,
      quantite_reelle: row.quantite ?? 0
    });

    if (error) errors++;
    else ok++;
  }

  if (errors > 0) {
    toast(`${ok} importée${ok > 1 ? 's' : ''}, ${errors} erreur${errors > 1 ? 's' : ''}.`, 'error');
  } else {
    toast(`${ok} ligne${ok > 1 ? 's' : ''} importée${ok > 1 ? 's' : ''} !`);
  }
  closeModal();
  viewInventaire(invPhotoId);
}

// ═══════════════════════════════════════ IMPORT PHOTO ════
let importPhotoData = null;
let importRows = [];
let importRowsOriginal = [];
let importType = 'sortie';
let importDate = new Date().toISOString().slice(0, 10);

function renderImportPhotoHTML(type) {
  const typeLabel = type === 'entree' ? 'Entrée' : 'Sortie';
  const date = new Date().toISOString().slice(0, 10);
  return `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header"><div class="card-title">📷 Import par photo — ${typeLabel}</div></div>
      <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:1rem">
        Photographiez votre feuille manuscrite. Claude va lire les références, lots, quantités et emplacements.
      </p>
      <div class="form-group"><label>Date</label>
        <input type="date" id="ip-date-${type}" value="${date}" onchange="importDate=this.value" /></div>

      <div id="ip-drop-zone-${type}" class="ip-drop-zone" onclick="document.getElementById('ip-file-${type}').click()">
        <div id="ip-preview-wrap-${type}">
          <div class="ip-drop-icon">📷</div>
          <p>Appuyez pour prendre une photo ou choisir depuis la galerie</p>
        </div>
        <input type="file" id="ip-file-${type}" accept="image/*" style="display:none"
          onchange="onImportPhotoSelected(this, '${type}')" />
      </div>

      <div id="ip-analyse-wrap-${type}" class="hidden" style="margin-top:1rem">
        <button class="btn-primary" id="ip-analyse-btn-${type}" onclick="analyseImportPhoto('${type}')">
          🔍 Analyser la photo
        </button>
      </div>
    </div>

    <div id="ip-results-wrap-${type}" class="hidden">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Vérification — <span id="ip-results-count-${type}"></span></div>
          <div style="display:flex;gap:.5rem">
            <button class="btn-secondary btn-sm" onclick="addImportRow('${type}')">+ Ligne</button>
            <button class="btn-success" id="ip-validate-btn-${type}" onclick="validateImport('${type}')">✓ Valider</button>
          </div>
        </div>
        <p style="font-size:.82rem;color:var(--text-secondary);margin-bottom:.8rem">Vérifiez et corrigez avant de valider.</p>
        <div class="table-wrapper stock-table-view">
          <table>
            <thead><tr>
              <th>Référence</th><th>Lot</th><th>Cond.</th><th>Qté</th><th>Dépôt</th><th>Rangée</th><th>Remarque</th><th></th>
            </tr></thead>
            <tbody id="ip-tbody-${type}"></tbody>
          </table>
        </div>
        <div class="stock-card-view" id="ip-cards-${type}"></div>
      </div>
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header"><div class="card-title">Imports récents — ${typeLabel}</div></div>
      <div id="sessions-wrap-${type}">${spinner()}</div>
    </div>
  `;
}

function renderImportPhoto() {
  // Redirige vers la page entrée par défaut
  navigateTo('entree');
  setTimeout(() => showEntreeTab('photo'), 100);
}

async function onImportPhotoSelected(input, type) {
  type = type || 'entree';
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const previewId = `ip-preview-wrap-${type}`;
    const el = document.getElementById(previewId) || document.getElementById('ip-preview-wrap');
    if (el) el.innerHTML = `
      <img src="${e.target.result}" style="max-width:100%;max-height:300px;border-radius:8px;object-fit:contain" />
      <p style="font-size:.8rem;color:var(--text-secondary);margin-top:.5rem">Appuyez pour changer la photo</p>
    `;
  };
  reader.readAsDataURL(file);

  const compressed = await compressImage(file, 1600, 0.85);
  const b64 = await new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result.split(',')[1]);
    r.readAsDataURL(compressed);
  });
  importPhotoData = { base64: b64, mediaType: 'image/jpeg' };
  const analyseWrap = document.getElementById(`ip-analyse-wrap-${type}`) || document.getElementById('ip-analyse-wrap');
  if (analyseWrap) analyseWrap.classList.remove('hidden');
}

async function analyseImportPhoto(type) {
  type = type || 'entree';
  if (!importPhotoData) return;
  const btn = document.getElementById(`ip-analyse-btn-${type}`) || document.getElementById('ip-analyse-btn');
  if (btn) { btn.textContent = '⏳ Analyse en cours…'; btn.disabled = true; }

  const corrections = await chargerCorrections();
  const correctionsPrompt = buildCorrectionsPrompt(corrections);

  const prompt = `Tu analyses une feuille manuscrite de gestion de stock pour un entrepôt d'ascenseurs.

RÉFÉRENCES — format EXACT : [2ch][SO ou PO][3ch avec zéros][E ou P][5ch avec zéros] = 13 caractères total
Exemples d'écriture abrégée de Matthias :
- 33/60P/3001 → 33SO060P03001 (P précisé = remplace le E)
- 32/40/40 → 32SO040E00040 (pas de P = E par défaut)
- 35/530/20 → 35SO530E00020
- 38/20P/04 → 38SO020P00004
Les "/" sont des SÉPARATEURS, jamais des chiffres à inclure dans la référence.
Si la réf est écrite en entier (ex: 35SO530E00075), la copier telle quelle.
Ignorer le préfixe x/y/v (coche de préparation).

NUMÉROS DE LOT :
- "7" et "9" souvent confondus : 7 = barre horizontale en haut + trait droit ; 9 = boucle fermée en haut
- Vérifie chaque 7/9 en comparant avec les autres occurrences sur la feuille

QUANTITÉS — notation mixte, TRÈS IMPORTANT :
- Les symboles peuvent être COMBINÉS et doivent être ADDITIONNÉS, pas remplacés
- Symboles de base : I=1, II=2, III=3, Γ ou L cursif=2, Π ou portique=3, □=4, □barré=5
- Exemples de combinaisons : □barré + I = 6, □barré + II = 7, □barré + III = 8, □barré + Γ = 7, □ + Γ = 6
- Π (portique) ≠ Γ (équerre) : Π a DEUX traits verticaux reliés en haut = 3 ; Γ a UN trait vertical avec crochet = 2
- Compte chaque symbole séparément puis additionne

ZONES :
- "D2A6" = Dépôt "2" Rangée "6" (le A devant le numéro de rangée est ignoré)
- "D2 A11" = Dépôt "2" Rangée "11" (ignorer le A, garder juste le numéro)
- "RENO 8" = Dépôt "RENO" Rangée "8"
- "QUAI SODIMAS 1" = Dépôt "QUAI SODIMAS" Rangée "1"
- Règle générale : si rangée = lettre + chiffre(s), ne garder que le(s) chiffre(s)

AUTRES RÈGLES :
- x/coches = référence préparée, garde la ligne mais ignore la coche
- " ou // = même référence que la ligne du dessus
- Accolade } = zone s'applique à toutes les lignes regroupées
- Colonne REMARQUE : noter tout commentaire écrit dans cette colonne
- CONDITIONNEMENT : si la feuille précise palette/caisse/colis/pièce, extraire dans conditionnement, sinon null.
- Si même référence+lot avec conditionnements DIFFÉRENTS → créer une ligne JSON distincte pour chaque.

Retourne UNIQUEMENT un JSON valide :
[{"reference": "35SO530E00067", "lot": "4500224268", "quantite": 1, "conditionnement": null, "depot": "2", "rangee": "6", "remarque": null}, ...]
Si valeur absente, mets null. Vérifie DEUX FOIS chaque quantité avant de répondre.${correctionsPrompt}`;

  try {
    const response = await fetch('/.netlify/functions/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: importPhotoData.mediaType, data: importPhotoData.base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error('API: ' + JSON.stringify(data.error));
    const text = data.content?.map(c => c.text || '').join('').trim();
    if (!text) throw new Error('Réponse vide de Claude');
    // Extraire le JSON même s'il y a du texte autour
    // Extraire le JSON en cherchant directement le premier [ et le dernier ]
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket === -1 || lastBracket === -1) throw new Error('JSON introuvable. Réponse : ' + text.slice(0, 200));
    importRows = JSON.parse(text.slice(firstBracket, lastBracket + 1));
    importRowsOriginal = JSON.parse(JSON.stringify(importRows));

    btn.textContent = '🔍 Analyser la photo';
    btn.disabled = false;
    currentImportType = type;
    renderImportTable(type);

  } catch(e) {
    toast('Erreur d\'analyse : ' + e.message, 'error');
    btn.textContent = '🔍 Analyser la photo';
    btn.disabled = false;
  }
}

let currentImportType = 'entree';

function renderImportTable(type) {
  type = type || currentImportType || 'entree';
  currentImportType = type;

  const wrap = document.getElementById(`ip-results-wrap-${type}`) || document.getElementById('ip-results-wrap');
  const countEl = document.getElementById(`ip-results-count-${type}`) || document.getElementById('ip-results-count');
  const tbody = document.getElementById(`ip-tbody-${type}`) || document.getElementById('ip-tbody');
  const cardsWrap = document.getElementById(`ip-cards-${type}`) || document.getElementById('ip-cards');

  if (wrap) wrap.classList.remove('hidden');
  if (countEl) countEl.textContent = `${importRows.length} ligne${importRows.length > 1 ? 's' : ''} détectée${importRows.length > 1 ? 's' : ''}`;

  if (tbody) {
    tbody.innerHTML = '';
    importRows.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" value="${row.reference || ''}" onchange="importRows[${i}].reference=this.value" style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem;font-family:monospace" /></td>
        <td><input type="text" value="${row.lot || ''}" onchange="importRows[${i}].lot=this.value" style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem;font-family:monospace" /></td>
        <td><input type="text" value="${row.conditionnement || ''}" onchange="importRows[${i}].conditionnement=this.value" style="width:90px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.8rem" placeholder="palette…" /></td>
        <td><input type="number" value="${row.quantite ?? 1}" min="1" onchange="importRows[${i}].quantite=parseFloat(this.value)" style="width:60px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" /></td>
        <td><input type="text" value="${row.depot || ''}" onchange="importRows[${i}].depot=this.value" style="width:70px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" /></td>
        <td><input type="text" value="${row.rangee || ''}" onchange="importRows[${i}].rangee=this.value" style="width:70px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" /></td>
        <td><input type="text" value="${row.remarque || ''}" onchange="importRows[${i}].remarque=this.value" style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem" placeholder="remarque…" /></td>
        <td><button class="btn-danger btn-sm" onclick="removeImportRow(${i})">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (cardsWrap) {
    cardsWrap.innerHTML = '';
    importRows.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'import-card';
      div.innerHTML = `
        <div class="import-card-header">
          <span style="font-size:.78rem;color:var(--text-secondary);font-weight:600">Ligne ${i+1}</span>
          <button class="btn-danger btn-sm" onclick="removeImportRow(${i})">✕</button>
        </div>
        <div class="form-group" style="margin-bottom:.6rem">
          <label>Référence</label>
          <input type="text" value="${row.reference || ''}" onchange="importRows[${i}].reference=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem;font-family:monospace" />
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:.6rem">
            <label>N° de lot</label>
            <input type="text" value="${row.lot || ''}" onchange="importRows[${i}].lot=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.88rem;font-family:monospace" />
          </div>
          <div class="form-group" style="margin-bottom:.6rem">
            <label>Quantité</label>
            <input type="number" value="${row.quantite ?? 1}" min="1" onchange="importRows[${i}].quantite=parseFloat(this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:.6rem">
          <label>Conditionnement</label>
          <input type="text" value="${row.conditionnement || ''}" onchange="importRows[${i}].conditionnement=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" placeholder="palette, caisse, colis…" />
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:.5rem">
            <label>Dépôt</label>
            <input type="text" value="${row.depot || ''}" onchange="importRows[${i}].depot=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
          </div>
          <div class="form-group" style="margin-bottom:.5rem">
            <label>Rangée</label>
            <input type="text" value="${row.rangee || ''}" onchange="importRows[${i}].rangee=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Remarque</label>
          <input type="text" value="${row.remarque || ''}" onchange="importRows[${i}].remarque=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" placeholder="remarque…" />
        </div>
      `;
      cardsWrap.appendChild(div);
    });
  }
}
function syncImportTable() {
  // Re-render sans perdre le focus (juste sync les données)
  renderImportTable();
}

function addImportRow(type) {
  type = type || currentImportType || 'entree';
  importRows.push({ reference: '', lot: '', conditionnement: '', quantite: 1, depot: '', rangee: '' });
  renderImportTable(type);
  const wrap = document.getElementById(`ip-results-wrap-${type}`) || document.getElementById('ip-results-wrap');
  if (wrap) wrap.classList.remove('hidden');
}

function removeImportRow(i) {
  importRows.splice(i, 1);
  renderImportTable(currentImportType);
}

async function validateImport(type) {
  type = type || currentImportType || 'entree';
  if (!importRows.length) { toast('Aucune ligne à importer.', 'error'); return; }

  const date = document.getElementById(`ip-date-${type}`)?.value || new Date().toISOString().slice(0,10);
  const typeLabel = type === 'entree' ? 'ENTRÉE' : 'SORTIE';
  const emoji = type === 'entree' ? '📥' : '📤';

  const confirme = confirm(`${emoji} Confirmer l'import ?\n\n${importRows.length} ligne${importRows.length > 1 ? 's' : ''} en ${typeLabel}\nDate : ${date}\n\nVérifiez bien le type avant de valider.`);
  if (!confirme) return;

  const btn = document.getElementById(`ip-validate-btn-${type}`) || document.getElementById('ip-validate-btn');
  if (btn) {
    if (btn.disabled) return; // protection double-clic
    btn.disabled = true;
    btn.textContent = '⏳ Import en cours…';
  }
  const auteur = currentProfile?.prenom || currentUser?.email;

  // Créer la session d'import
  const { data: session } = await sb.from('sessions_import').insert({
    type,
    date_import: date,
    nb_lignes: importRows.length,
    auteur: currentProfile?.prenom || currentUser?.email
  }).select().single();
  const sessionId = session?.id || null;

  let ok = 0, errors = 0;
  for (const row of importRows) {
    if (!row.reference || !row.quantite) { errors++; continue; }

    if (type === 'sortie') {
      // Chercher par ref+lot
      let q = sb.from('stock').select('id, quantite').eq('reference', row.reference);
      q = row.lot ? q.eq('lot', row.lot) : q.is('lot', null);
      const { data: existing } = await q.maybeSingle();
      if (existing) {
        await sb.from('stock').update({
          quantite: Math.max(0, existing.quantite - row.quantite),
          updated_at: new Date().toISOString()
        }).eq('id', existing.id);
      }
    } else {
      // Entrée — clé d'unicité complète : ref+lot+depot+rangee+conditionnement
      let q = sb.from('stock').select('id, quantite, remarque').eq('reference', row.reference);
      q = row.lot ? q.eq('lot', row.lot) : q.is('lot', null);
      q = row.depot ? q.eq('depot', row.depot) : q.is('depot', null);
      q = row.rangee ? q.eq('rangee', row.rangee) : q.is('rangee', null);
      q = row.conditionnement ? q.eq('conditionnement', row.conditionnement) : q.is('conditionnement', null);
      const { data: existingRows } = await q.limit(1);
      const existing = existingRows?.[0] || null;

      if (existing) {
        // Cumuler la remarque si elle est nouvelle
        let nouvelleRemarque = existing.remarque || null;
        if (row.remarque && row.remarque !== existing.remarque) {
          nouvelleRemarque = existing.remarque
            ? `${existing.remarque}\n${row.remarque}`
            : row.remarque;
        }
        await sb.from('stock').update({
          quantite: existing.quantite + row.quantite,
          remarque: nouvelleRemarque,
          updated_at: new Date().toISOString()
        }).eq('id', existing.id);
      } else {
        await sb.from('stock').insert({
          reference: row.reference,
          lot: row.lot || null,
          conditionnement: row.conditionnement || null,
          depot: row.depot || null,
          rangee: row.rangee || null,
          remarque: row.remarque || null,
          quantite: row.quantite,
          quantite_reservee: 0
        });
      }
    }

    await sb.from('mouvements').insert({
      date_mouvement: date, type_mouvement: type,
      reference: row.reference, lot: row.lot || null,
      depot: row.depot || null, rangee: row.rangee || null,
      quantite: row.quantite, auteur, source: 'import_photo',
      remarque: row.remarque || 'Import par photo',
      session_id: sessionId
    });
    ok++;
  }

  // Mettre à jour le nb de lignes réelles importées
  if (sessionId) {
    await sb.from('sessions_import').update({ nb_lignes: ok }).eq('id', sessionId);
  }

  toast(`${ok} mouvement${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''} avec succès !`);
  importRows = [];
  importPhotoData = null;
  // Réinitialiser le bouton
  if (btn) { btn.disabled = false; btn.textContent = '✓ Valider'; }
  // Recharger les imports récents
  chargerSessionsImport(type);
  // Masquer la zone de résultats
  const wrap = document.getElementById(`ip-results-wrap-${type}`) || document.getElementById('ip-results-wrap');
  if (wrap) wrap.classList.add('hidden');
  // Réinitialiser la photo
  const previewWrap = document.getElementById(`ip-preview-wrap-${type}`) || document.getElementById('ip-preview-wrap');
  if (previewWrap) previewWrap.innerHTML = `<div class="ip-drop-icon">📷</div><p>Appuyez pour prendre une photo ou choisir depuis la galerie</p>`;
  const analyseWrap = document.getElementById(`ip-analyse-wrap-${type}`) || document.getElementById('ip-analyse-wrap');
  if (analyseWrap) analyseWrap.classList.add('hidden');
}

// ═══════════════════════════════════════ SESSIONS IMPORT ════

async function chargerSessionsImport(type) {
  const wrapId = type ? `sessions-wrap-${type}` : 'sessions-wrap';
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;

  let query = sb.from('sessions_import').select('*').order('created_at', { ascending: false }).limit(20);
  if (type && type !== 'inventaire') query = query.eq('type', type);

  const { data: sessions } = await query;

  if (!sessions?.length) {
    wrap.innerHTML = emptyState('Aucun import enregistré.');
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Lignes</th><th>Par</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          ${sessions.map(s => `
            <tr>
              <td>${fmtDate(s.date_import)}</td>
              <td><span class="badge badge-${s.type === 'entree' ? 'entree' : 'sortie'}">${s.type}</span></td>
              <td class="td-qte">${s.nb_lignes}</td>
              <td style="font-size:.82rem;color:var(--text-secondary)">${fmt(s.auteur)}</td>
              <td>${s.annule ? '<span class="badge badge-sortie">Annulé</span>' : '<span class="badge badge-entree">Actif</span>'}</td>
              <td>${!s.annule ? `<button class="btn-danger btn-sm" onclick="annulerImport('${s.id}','${s.type}')">Annuler</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function annulerImport(sessionId, type) {
  const { data: mouvements } = await sb.from('mouvements')
    .select('*').eq('session_id', sessionId);

  if (!mouvements?.length) { toast('Aucun mouvement trouvé pour cet import.', 'error'); return; }

  // Vérifier si des mouvements ultérieurs ont touché ces références
  const avertissements = [];
  const refLots = [...new Set(mouvements.map(m => `${m.reference}__${m.lot || ''}`))];

  for (const refLot of refLots) {
    const [ref, lot] = refLot.split('__');
    const dernierMouv = mouvements.filter(m => m.reference === ref && (m.lot || '') === lot)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    let q = sb.from('mouvements').select('id')
      .eq('reference', ref)
      .gt('created_at', dernierMouv.created_at);
    // Exclure les mouvements de cette session
    const { data: mouvUlterieurs } = await q.limit(1);

    if (mouvUlterieurs?.length) {
      avertissements.push(`${ref} / ${lot || 'sans lot'}`);
    }
  }

  let confirme = false;
  if (avertissements.length) {
    const liste = [...new Set(avertissements)].slice(0, 5).join('\n- ');
    confirme = confirm(`⚠️ Des mouvements ultérieurs ont touché ces références depuis cet import :\n- ${liste}\n\nL'annulation pourrait créer des incohérences de stock (stock négatif possible). Continuer quand même ?`);
  } else {
    confirme = confirm(`Annuler cet import de ${mouvements.length} ligne${mouvements.length > 1 ? 's' : ''} ? Le stock sera remis en état.`);
  }

  if (!confirme) return;

  // Inverser les opérations sur le stock (sans limiter à 0 — stock négatif possible)
  for (const m of mouvements) {
    let q = sb.from('stock').select('id, quantite').eq('reference', m.reference);
    q = m.lot ? q.eq('lot', m.lot) : q.is('lot', null);
    if (m.depot) q = q.eq('depot', m.depot);
    if (m.rangee) q = q.eq('rangee', m.rangee);
    const { data: rows } = await q.limit(1);
    const stockRow = rows?.[0];

    if (stockRow) {
      const nouvelleQte = type === 'entree'
        ? stockRow.quantite - m.quantite  // annuler entrée = soustraire (peut être négatif)
        : stockRow.quantite + m.quantite; // annuler sortie = rajouter

      await sb.from('stock').update({
        quantite: nouvelleQte,
        updated_at: new Date().toISOString()
      }).eq('id', stockRow.id);
    }
  }

  await sb.from('mouvements').delete().eq('session_id', sessionId);
  await sb.from('sessions_import').update({
    annule: true, annule_at: new Date().toISOString()
  }).eq('id', sessionId);

  toast('Import annulé et stock remis en état.');
  chargerSessionsImport();
}

// ═══════════════════════════════════════ BONS DE PRÉPARATION ════

async function renderBons() {
  const el = document.getElementById('page-bons');
  el.innerHTML = spinner();

  const { data: bons } = await sb.from('bons_preparation')
    .select('*, bon_lignes(quantite)')
    .order('created_at', { ascending: false });

  el.innerHTML = `
    <div class="card-header" style="margin-bottom:1rem">
      <div></div>
      <div style="display:flex;gap:.5rem">
        <button class="btn-secondary" onclick="importBonParPhoto()">📷 Import par photo</button>
        <button class="btn-primary" onclick="openNewBonModal()">+ Nouveau bon</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Bons de préparation</div></div>
      ${bons?.length ? `
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Date prévue</th><th>Destinataire</th><th>Lignes</th><th>Statut</th><th>N° BL</th><th></th></tr></thead>
            <tbody>
              ${bons.map(b => `
                <tr>
                  <td>${fmtDate(b.date_prevue)}</td>
                  <td>${fmt(b.destinataire)}</td>
                  <td class="td-qte">${b.bon_lignes?.length || 0}</td>
                  <td><span class="badge ${b.statut === 'valide' ? 'badge-entree' : 'badge-deplacement'}">${b.statut === 'valide' ? 'Validé' : 'En cours'}</span></td>
                  <td style="font-family:monospace;font-size:.82rem">${fmt(b.numero_bl)}</td>
                  <td><button class="btn-secondary btn-sm" onclick="openBon('${b.id}')">Ouvrir</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : emptyState('Aucun bon de préparation.')}
    </div>
  `;
}

function importBonParPhoto() {
  let photoData = null;

  openModal('Import bon par photo', `
    <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:1rem">
      Photographiez votre feuille SODIMAS. Claude va lire le type, le destinataire, la date et toutes les lignes automatiquement.
    </p>
    <div id="bon-photo-drop" class="ip-drop-zone" onclick="document.getElementById('bon-photo-file').click()">
      <div id="bon-photo-preview">
        <div class="ip-drop-icon">📷</div>
        <p>Appuyez pour prendre une photo ou choisir depuis la galerie</p>
      </div>
      <input type="file" id="bon-photo-file" accept="image/*" style="display:none" onchange="onBonPhotoSelected(this)" />
    </div>
    <div id="bon-photo-analyse-wrap" class="hidden" style="margin-top:1rem">
      <button class="btn-primary" id="bon-photo-analyse-btn" onclick="analysePhotoBon()">🔍 Analyser la photo</button>
    </div>
  `);
}

async function onBonPhotoSelected(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('bon-photo-preview').innerHTML = `
      <img src="${e.target.result}" style="max-width:100%;max-height:300px;border-radius:8px;object-fit:contain" />
      <p style="font-size:.8rem;color:var(--text-secondary);margin-top:.5rem">Appuyez pour changer la photo</p>
    `;
  };
  reader.readAsDataURL(file);
  const compressed = await compressImage(file, 1600, 0.85);
  const b64 = await new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result.split(',')[1]);
    r.readAsDataURL(compressed);
  });
  window._bonPhotoData = { base64: b64, mediaType: 'image/jpeg' };
  document.getElementById('bon-photo-analyse-wrap').classList.remove('hidden');
}

async function analysePhotoBon() {
  if (!window._bonPhotoData) return;
  const btn = document.getElementById('bon-photo-analyse-btn');
  btn.textContent = '⏳ Analyse en cours…';
  btn.disabled = true;

  const corrections = await chargerCorrections();
  const correctionsPrompt = buildCorrectionsPrompt(corrections);

  const prompt = `Tu analyses une feuille SODIMAS de mouvement de stock.

INFORMATIONS À EXTRAIRE :
1. Type de mouvement coché : "reception" (Réception/entrée), "sortie" (Sortie/Enlèvement), ou "preparation" (Préparation commande)
2. Date (format YYYY-MM-DD)
3. Destinataire/Expéditeur
4. Numéro de commande / Réf. client (si présent)
5. Toutes les lignes du tableau

RÉFÉRENCES — format EXACT : [2ch][SO ou PO][3ch avec zéros][E ou P][5ch avec zéros] = 13 caractères total
Exemples d'écriture abrégée :
- 33/60P/3001 → 33SO060P03001 (P précisé = remplace le E)
- 32/40/40 → 32SO040E00040 (pas de P = E par défaut)
- 35/530/75 → 35SO530E00075
- 38/20P/04 → 38SO020P00004
Les "/" sont des SÉPARATEURS, jamais des chiffres à inclure dans la référence.
Si la réf est écrite en entier, la copier telle quelle.
" ou // = même référence que la ligne précédente.

ZONES : 
- D2A3 = depot "2" rangee "3" (le A devant le numéro est ignoré)
- D2 A11 = depot "2" rangee "11" (ignorer le A, garder juste le numéro)
- RENO 3 = depot "RENO" rangee "3"
- QUAI SODI 1 = depot "QUAI SODIMAS" rangee "1"
- Règle générale : si rangée = lettre + chiffre(s), ne garder que le(s) chiffre(s)

QUANTITÉS : chiffres arabes normaux sur cette feuille (pas de bâtons)

Retourne UNIQUEMENT un JSON valide :
{
  "type": "preparation",
  "date": "2026-07-07",
  "destinataire": "LUDO",
  "numero_commande": null,
  "lignes": [
    {"reference": "35SO530E00075", "lot": "4500221801", "quantite": 1, "depot": "2", "rangee": "A3", "remarque": null}
  ]
}${correctionsPrompt}`;

  try {
    const response = await fetch('/.netlify/functions/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: window._bonPhotoData.mediaType, data: window._bonPhotoData.base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    const text = data.content?.map(c => c.text || '').join('').trim();

    const firstBracket = text.indexOf('{');
    const lastBracket = text.lastIndexOf('}');
    if (firstBracket === -1) throw new Error('JSON introuvable');
    const result = JSON.parse(text.slice(firstBracket, lastBracket + 1));

    closeModal();
    afficherVerificationBon(result);

  } catch(e) {
    toast('Erreur : ' + e.message, 'error');
    btn.textContent = '🔍 Analyser la photo';
    btn.disabled = false;
  }
}

let _bonPhotoResult = null;

async function afficherVerificationBon(result) {
  _bonPhotoResult = result;
  const el = document.getElementById('page-bons');

  // Vérifier le stock pour chaque ligne
  const lignesAvecStock = await Promise.all((result.lignes || []).map(async (l, i) => {
    if (!l.reference) return { ...l, dispo: null };
    let q = sb.from('stock').select('quantite, quantite_reservee').eq('reference', l.reference);
    if (l.lot) q = q.eq('lot', l.lot); else q = q.is('lot', null);
    if (l.depot) q = q.eq('depot', l.depot);
    if (l.rangee) q = q.eq('rangee', l.rangee);
    const { data } = await q.limit(1);
    const row = data?.[0];
    const dispo = row ? row.quantite - (row.quantite_reservee || 0) : null;
    return { ...l, dispo };
  }));

  // Mettre à jour les lignes avec les stocks
  result.lignes = lignesAvecStock;

  const typeLabel = result.type === 'reception' ? '📥 Réception (Entrée)' :
                    result.type === 'sortie' ? '📤 Sortie / Enlèvement' : '📋 Préparation commande';
  const typeBadge = result.type === 'reception' ? 'badge-entree' :
                    result.type === 'sortie' ? 'badge-sortie' : 'badge-deplacement';

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:1rem;flex-wrap:wrap">
      <button class="btn-secondary btn-sm" onclick="renderBons()">← Retour</button>
      <h2 style="font-size:1rem;font-weight:600;flex:1">Vérification — Import par photo</h2>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-header"><div class="card-title">Informations générales</div></div>
      <div class="form-row">
        <div class="form-group">
          <label>Type de mouvement</label>
          <select id="vbon-type" style="font-size:.9rem">
            <option value="preparation" ${result.type === 'preparation' ? 'selected' : ''}>📋 Préparation commande</option>
            <option value="sortie" ${result.type === 'sortie' ? 'selected' : ''}>📤 Sortie / Enlèvement</option>
            <option value="reception" ${result.type === 'reception' ? 'selected' : ''}>📥 Réception (Entrée)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="vbon-date" value="${result.date || new Date().toISOString().slice(0,10)}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Destinataire *</label>
          <input type="text" id="vbon-dest" value="${result.destinataire || ''}" placeholder="ex: LUDO, SODIMAS…" />
        </div>
        <div class="form-group">
          <label>N° commande / Réf. client</label>
          <input type="text" id="vbon-cmd" value="${result.numero_commande || ''}" />
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <div class="card-title">Lignes — ${result.lignes?.length || 0} article${(result.lignes?.length || 0) > 1 ? 's' : ''}</div>
        <div style="display:flex;gap:.5rem">
          <button class="btn-secondary btn-sm" onclick="verifierStockBonPhoto()">🔄 Vérifier stock</button>
          <button class="btn-secondary btn-sm" onclick="ajouterLigneBonPhoto()">+ Ligne</button>
        </div>
      </div>

      <!-- Vue tableau desktop -->
      <div class="table-wrapper stock-table-view">
        <table>
          <thead><tr>
            <th>Référence</th><th>Lot</th><th>Qté dem.</th><th>Dépôt</th><th>Rangée</th><th>Remarque</th><th>Stock dispo</th><th></th>
          </tr></thead>
          <tbody id="vbon-tbody">
            ${(result.lignes || []).map((l, i) => {
              const dispo = l.dispo;
              const couleur = dispo === null ? 'var(--text-secondary)' :
                              dispo === 0 ? 'var(--danger)' :
                              dispo < l.quantite ? 'var(--warning)' : 'var(--success)';
              const dispoLabel = dispo === null ? '—' : dispo;
              return `<tr>
                <td><input type="text" value="${l.reference || ''}" onchange="_bonPhotoResult.lignes[${i}].reference=this.value" style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem;font-family:monospace" /></td>
                <td><input type="text" value="${l.lot || ''}" onchange="_bonPhotoResult.lignes[${i}].lot=this.value" style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem;font-family:monospace" /></td>
                <td><input type="number" value="${l.quantite ?? 1}" min="1" onchange="_bonPhotoResult.lignes[${i}].quantite=parseFloat(this.value)" style="width:60px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" /></td>
                <td><input type="text" value="${l.depot || ''}" onchange="_bonPhotoResult.lignes[${i}].depot=this.value" style="width:70px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" /></td>
                <td><input type="text" value="${l.rangee || ''}" onchange="_bonPhotoResult.lignes[${i}].rangee=this.value" style="width:70px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" /></td>
                <td><input type="text" value="${l.remarque || ''}" onchange="_bonPhotoResult.lignes[${i}].remarque=this.value" style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem" /></td>
                <td style="font-size:1rem;font-weight:700;color:${couleur};text-align:center">${dispoLabel}</td>
                <td><button class="btn-danger btn-sm" onclick="_bonPhotoResult.lignes.splice(${i},1);afficherVerificationBon(_bonPhotoResult)">✕</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Vue cartes mobile -->
      <div class="stock-card-view">
        ${(result.lignes || []).map((l, i) => {
          const dispo = l.dispo;
          const couleur = dispo === null ? 'var(--text-secondary)' :
                          dispo === 0 ? 'var(--danger)' :
                          dispo < l.quantite ? 'var(--warning)' : 'var(--success)';
          return `<div class="import-card" style="border-left:4px solid ${couleur}">
            <div class="import-card-header">
              <span style="font-weight:600;font-size:.9rem">${l.reference || '—'}</span>
              <div style="display:flex;align-items:center;gap:.5rem">
                <span style="font-size:1rem;font-weight:700;color:${couleur}">${dispo !== null ? dispo + ' dispo' : '—'}</span>
                <button class="btn-danger btn-sm" onclick="_bonPhotoResult.lignes.splice(${i},1);afficherVerificationBon(_bonPhotoResult)">✕</button>
              </div>
            </div>
            <div class="form-group" style="margin-bottom:.5rem"><label>Référence</label>
              <input type="text" value="${l.reference || ''}" onchange="_bonPhotoResult.lignes[${i}].reference=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem;font-family:monospace" /></div>
            <div class="form-row">
              <div class="form-group" style="margin-bottom:.5rem"><label>Lot</label>
                <input type="text" value="${l.lot || ''}" onchange="_bonPhotoResult.lignes[${i}].lot=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.88rem;font-family:monospace" /></div>
              <div class="form-group" style="margin-bottom:.5rem"><label>Qté</label>
                <input type="number" value="${l.quantite ?? 1}" min="1" onchange="_bonPhotoResult.lignes[${i}].quantite=parseFloat(this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" /></div>
            </div>
            <div class="form-row">
              <div class="form-group" style="margin-bottom:0"><label>Dépôt</label>
                <input type="text" value="${l.depot || ''}" onchange="_bonPhotoResult.lignes[${i}].depot=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" /></div>
              <div class="form-group" style="margin-bottom:0"><label>Rangée</label>
                <input type="text" value="${l.rangee || ''}" onchange="_bonPhotoResult.lignes[${i}].rangee=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" /></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="form-actions">
      <button class="btn-success" onclick="validerImportBonPhoto()">✓ Valider</button>
      <button class="btn-secondary" onclick="renderBons()">Annuler</button>
    </div>
  `;
}

async function verifierStockBonPhoto() {
  // Récupère les valeurs actuelles des champs avant de recalculer
  toast('Vérification en cours…');
  await afficherVerificationBon(_bonPhotoResult);
}

function ajouterLigneBonPhoto() {
  _bonPhotoResult.lignes.push({ reference: '', lot: '', quantite: 1, depot: '', rangee: '', remarque: '' });
  afficherVerificationBon(_bonPhotoResult);
}

async function validerImportBonPhoto() {
  const type = document.getElementById('vbon-type').value;
  const date = document.getElementById('vbon-date').value;
  const dest = document.getElementById('vbon-dest').value.trim();
  const cmd = document.getElementById('vbon-cmd').value.trim();
  const lignes = _bonPhotoResult.lignes.filter(l => l.reference);

  if (!dest) { toast('Le destinataire est obligatoire.', 'error'); return; }
  if (!lignes.length) { toast('Aucune ligne à importer.', 'error'); return; }

  if (type === 'preparation') {
    // Créer un bon de préparation
    const { data: bon, error } = await sb.from('bons_preparation').insert({
      date_prevue: date,
      destinataire: dest,
      remarque: cmd ? `N° commande : ${cmd}` : null,
      statut: 'en_cours',
      created_by: currentProfile?.prenom || currentUser?.email
    }).select().single();

    if (error) { toast('Erreur : ' + error.message, 'error'); return; }

    // Ajouter les lignes — chercher chaque article dans le stock
    for (const l of lignes) {
      let q = sb.from('stock').select('id').eq('reference', l.reference);
      if (l.lot) q = q.eq('lot', l.lot); else q = q.is('lot', null);
      if (l.depot) q = q.eq('depot', l.depot);
      if (l.rangee) q = q.eq('rangee', l.rangee);
      const { data: stockRows } = await q.limit(1);
      const stockId = stockRows?.[0]?.id || null;

      await sb.from('bon_lignes').insert({
        bon_id: bon.id,
        stock_id: stockId,
        reference: l.reference,
        lot: l.lot || null,
        depot: l.depot || null,
        rangee: l.rangee || null,
        remarque: l.remarque || null,
        quantite: l.quantite,
        added_by: currentProfile?.prenom || currentUser?.email
      });

      // Réserver le stock si disponible
      if (stockId) {
        const { data: sr } = await sb.from('stock').select('quantite_reservee').eq('id', stockId).single();
        await sb.from('stock').update({
          quantite_reservee: (sr?.quantite_reservee || 0) + l.quantite
        }).eq('id', stockId);
      }
    }

    toast(`Bon de préparation créé — ${lignes.length} ligne${lignes.length > 1 ? 's' : ''} !`);
    openBon(bon.id);

  } else {
    // Import entrée ou sortie (réutilise validateImport)
    importRows = lignes.map(l => ({ ...l }));
    importRowsOriginal = [...importRows];
    currentImportType = type === 'reception' ? 'entree' : 'sortie';

    // Créer la session
    const { data: session } = await sb.from('sessions_import').insert({
      type: currentImportType,
      date_import: date,
      nb_lignes: lignes.length,
      auteur: currentProfile?.prenom || currentUser?.email
    }).select().single();

    const sessionId = session?.id || null;
    const auteur = currentProfile?.prenom || currentUser?.email;
    let ok = 0;

    for (const row of importRows) {
      if (!row.reference || !row.quantite) continue;

      if (currentImportType === 'sortie') {
        let q = sb.from('stock').select('id, quantite').eq('reference', row.reference);
        q = row.lot ? q.eq('lot', row.lot) : q.is('lot', null);
        const { data: existing } = await q.limit(1);
        if (existing?.[0]) {
          await sb.from('stock').update({ quantite: existing[0].quantite - row.quantite, updated_at: new Date().toISOString() }).eq('id', existing[0].id);
        }
      } else {
        let q = sb.from('stock').select('id, quantite, remarque').eq('reference', row.reference);
        q = row.lot ? q.eq('lot', row.lot) : q.is('lot', null);
        q = row.depot ? q.eq('depot', row.depot) : q.is('depot', null);
        q = row.rangee ? q.eq('rangee', row.rangee) : q.is('rangee', null);
        q = row.conditionnement ? q.eq('conditionnement', row.conditionnement) : q.is('conditionnement', null);
        const { data: existing } = await q.limit(1);
        if (existing?.[0]) {
          await sb.from('stock').update({ quantite: existing[0].quantite + row.quantite, updated_at: new Date().toISOString() }).eq('id', existing[0].id);
        } else {
          await sb.from('stock').insert({ reference: row.reference, lot: row.lot || null, depot: row.depot || null, rangee: row.rangee || null, remarque: row.remarque || null, quantite: row.quantite, quantite_reservee: 0 });
        }
      }

      await sb.from('mouvements').insert({
        date_mouvement: date, type_mouvement: currentImportType,
        reference: row.reference, lot: row.lot || null,
        depot: row.depot || null, rangee: row.rangee || null,
        quantite: row.quantite, auteur, source: 'import_photo',
        remarque: row.remarque || null, session_id: sessionId
      });
      ok++;
    }

    if (sessionId) await sb.from('sessions_import').update({ nb_lignes: ok }).eq('id', sessionId);
    toast(`${ok} ligne${ok > 1 ? 's' : ''} importée${ok > 1 ? 's' : ''} !`);
    renderBons();
  }
}

function openNewBonModal() {
  openModal('Nouveau bon de préparation', `
    <div class="form-group"><label>Date prévue *</label>
      <input type="date" id="bon-date" value="${new Date().toISOString().slice(0,10)}" /></div>
    <div class="form-group"><label>Destinataire *</label>
      <input type="text" id="bon-dest" placeholder="ex: SODIMAS, Ludovic, Davy…" /></div>
    <div class="form-group"><label>Remarque</label>
      <textarea id="bon-remarque" placeholder="Informations complémentaires…"></textarea></div>
    <div class="form-actions">
      <button class="btn-primary" onclick="createBon()">Créer le bon</button>
      <button class="btn-secondary" onclick="closeModal()">Annuler</button>
    </div>
  `);
}

async function createBon() {
  const date = document.getElementById('bon-date').value;
  const dest = document.getElementById('bon-dest').value.trim();
  const remarque = document.getElementById('bon-remarque').value.trim();

  if (!date || !dest) { toast('Date et destinataire obligatoires.', 'error'); return; }

  const { data, error } = await sb.from('bons_preparation').insert({
    date_prevue: date, destinataire: dest, remarque: remarque || null,
    created_by: currentProfile?.prenom || currentUser?.email,
    statut: 'en_cours'
  }).select().single();

  if (error) { toast('Erreur : ' + error.message, 'error'); return; }
  toast('Bon créé.');
  closeModal();
  openBon(data.id);
}

async function openBon(bonId) {
  const { data: bon } = await sb.from('bons_preparation').select('*').eq('id', bonId).single();
  const { data: lignes } = await sb.from('bon_lignes').select('*').eq('bon_id', bonId).order('created_at');

  const lignesAvecDispo = await Promise.all((lignes || []).map(async l => {
    let stockRow = null;
    if (l.stock_id) {
      const { data } = await sb.from('stock').select('quantite, quantite_reservee').eq('id', l.stock_id).maybeSingle();
      stockRow = data;
    } else {
      let q = sb.from('stock').select('quantite, quantite_reservee').eq('reference', l.reference);
      if (l.lot) q = q.eq('lot', l.lot); else q = q.is('lot', null);
      if (l.depot) q = q.eq('depot', l.depot);
      if (l.rangee) q = q.eq('rangee', l.rangee);
      const { data } = await q.maybeSingle();
      stockRow = data;
    }
    return { ...l, stockExiste: !!stockRow, qteDispo: stockRow ? stockRow.quantite : 0 };
  }));

  const isEnCours = bon.statut === 'en_cours';
  const el = document.getElementById('page-bons');

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:1rem;flex-wrap:wrap">
      <button class="btn-secondary btn-sm" onclick="renderBons()">← Retour</button>
      <h2 style="font-size:1rem;font-weight:600;flex:1">
        ${bon.destinataire}
        <span class="badge ${bon.statut === 'valide' ? 'badge-entree' : 'badge-deplacement'}" style="margin-left:.5rem">
          ${bon.statut === 'valide' ? 'Validé' : 'En cours'}
        </span>
        ${bon.numero_bl ? `<span style="margin-left:.5rem;font-family:monospace;font-size:.85rem;color:var(--text-secondary)">${bon.numero_bl}</span>` : ''}
      </h2>
      <span style="font-size:.85rem;color:var(--text-secondary)">${fmtDate(bon.date_prevue)}</span>
      ${isEnCours ? `
        <button class="btn-secondary" onclick="imprimerBon('${bonId}')">🖨 Imprimer le bon</button>
        <button class="btn-success" onclick="validerBon('${bonId}')">✓ Valider → BL</button>
        <button class="btn-danger btn-sm" onclick="deleteBon('${bonId}', false)">🗑</button>
      ` : `
        <button class="btn-primary" onclick="genererPDF('${bonId}')">📄 Télécharger le BL</button>
        <button class="btn-danger btn-sm" onclick="deleteBon('${bonId}', true)">🗑 Annuler le BL</button>
      `}
    </div>

    ${bon.remarque ? `<p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:.8rem">${bon.remarque}</p>` : ''}

    <div class="card" style="margin-bottom:1rem">
      <div class="card-header"><div class="card-title">Lignes du bon — ${lignesAvecDispo.length} article${lignesAvecDispo.length > 1 ? 's' : ''}</div></div>
      ${lignesAvecDispo.length ? `
        <!-- Vue tableau desktop -->
        <div class="table-wrapper stock-table-view">
          <table>
            <thead><tr>
              <th>Référence</th><th>Lot</th><th>Cond.</th><th>Dépôt</th><th>Rangée</th>
              <th>Remarque</th><th>Qté</th><th>Statut</th>${isEnCours ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${lignesAvecDispo.map(l => `
                <tr>
                  <td class="td-ref">${l.reference}</td>
                  <td class="td-lot">${fmt(l.lot)}</td>
                  <td style="font-size:.78rem;color:var(--text-secondary)">${fmt(l.conditionnement)}</td>
                  <td>${badgeDepot(l.depot)}</td>
                  <td>${fmt(l.rangee)}</td>
                  <td style="font-size:.78rem;color:var(--text-secondary);max-width:120px">${fmt(l.remarque)}</td>
                  <td style="font-size:1rem;font-weight:700;color:var(--accent);text-align:center">${l.quantite}</td>
                  <td>${isEnCours
                    ? (!l.stockExiste || l.qteDispo < l.quantite
                        ? `<span class="badge badge-sortie">⚠ Indispo</span>`
                        : `<span class="badge badge-entree">OK</span>`)
                    : (l.indisponible
                        ? `<span class="badge badge-sortie">⚠ ${(l.quantite_preparee || 0) > 0 ? `${l.quantite_preparee}/${l.quantite}` : 'Indispo'}</span>`
                        : `<span class="badge badge-entree">OK</span>`)}</td>
                  ${isEnCours ? `<td><button class="btn-danger btn-sm" onclick="removeBonLigne('${l.id}','${bonId}')">✕</button></td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <!-- Vue cartes mobile -->
        <div class="stock-card-view">
          ${lignesAvecDispo.map(l => `
            <div class="import-card">
              <div class="import-card-header">
                <span style="font-weight:600;font-size:.9rem">${l.reference}</span>
                ${isEnCours ? `<button class="btn-danger btn-sm" onclick="removeBonLigne('${l.id}','${bonId}')">✕</button>` : ''}
              </div>
              <div style="font-size:.82rem;color:var(--text-secondary);margin-bottom:.3rem">
                ${l.lot ? `Lot : ${l.lot}` : ''}
                ${l.conditionnement ? ` · ${l.conditionnement}` : ''}
                ${l.depot ? ` · ${l.depot}` : ''}${l.rangee ? ` / ${l.rangee}` : ''}
              </div>
              ${l.remarque ? `<div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:.3rem">${l.remarque}</div>` : ''}
              <div style="display:flex;align-items:center;gap:.8rem">
                <span style="font-size:1.2rem;font-weight:700;color:var(--accent)">${l.quantite}</span>
                ${isEnCours
                  ? (!l.stockExiste || l.qteDispo < l.quantite
                      ? `<span class="badge badge-sortie">⚠ Indispo</span>`
                      : `<span class="badge badge-entree">OK</span>`)
                  : (l.indisponible ? `<span class="badge badge-sortie">Indispo</span>` : `<span class="badge badge-entree">OK</span>`)}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<div style="text-align:center;padding:2rem;color:var(--text-secondary)">Aucune ligne — utilisez la recherche ci-dessous pour ajouter des articles.</div>`}
    </div>

    ${isEnCours ? `
      <div class="card">
        <div class="card-header"><div class="card-title">Ajouter un article</div></div>
        <div class="search-bar" style="margin-bottom:1rem">
          <input type="text" id="bon-search" placeholder="Référence, lot, emplacement, remarque…"
            oninput="searchStockForBon('${bonId}')" style="flex:1" />
        </div>
        <div id="bon-search-results"></div>
      </div>
    ` : ''}
  `;
}

async function deleteBon(bonId, wasValidated) {
  if (!confirm(wasValidated
    ? 'Supprimer ce bon va RESTAURER le stock déduit et annuler le bon de livraison. Continuer ?'
    : 'Supprimer ce bon va libérer les réservations de stock. Continuer ?')) return;

  const { data: lignes } = await sb.from('bon_lignes').select('*').eq('bon_id', bonId);

  for (const l of lignes || []) {
    if (l.stock_id) {
      const { data: stockRow } = await sb.from('stock').select('quantite, quantite_reservee').eq('id', l.stock_id).single();
      if (stockRow) {
        if (wasValidated) {
          // Ne restaurer que si la ligne était disponible (indisponible = stock jamais déduit)
          if (!l.indisponible) {
            await sb.from('stock').update({
              quantite: stockRow.quantite + l.quantite,
              updated_at: new Date().toISOString()
            }).eq('id', l.stock_id);
          }
        } else {
          // Libérer la réservation seulement si la ligne n'était pas indisponible
          if (!l.indisponible) {
            await sb.from('stock').update({
              quantite_reservee: Math.max(0, (stockRow.quantite_reservee || 0) - l.quantite)
            }).eq('id', l.stock_id);
          }
        }
      }
    }
  }

  if (wasValidated) {
    // Supprimer les mouvements liés à ce BL
    const { data: bon } = await sb.from('bons_preparation').select('numero_bl').eq('id', bonId).single();
    if (bon?.numero_bl) {
      await sb.from('mouvements').delete().like('remarque', `${bon.numero_bl}%`);
    }
  }

  await sb.from('bons_preparation').delete().eq('id', bonId);

  toast(wasValidated ? 'Bon et BL supprimés, stock restauré.' : 'Bon supprimé, réservations libérées.');
  renderBons();
}

let bonSearchDebounce = null;
async function searchStockForBon(bonId) {
  const q = document.getElementById('bon-search').value.trim();
  const res = document.getElementById('bon-search-results');
  clearTimeout(bonSearchDebounce);
  if (q.length < 2) { res.innerHTML = ''; return; }

  bonSearchDebounce = setTimeout(async () => {
    const { data: rawData } = await sb.from('stock').select('*')
      .or(`reference.ilike.%${q}%,lot.ilike.%${q}%,depot.ilike.%${q}%,rangee.ilike.%${q}%,remarque.ilike.%${q}%,conditionnement.ilike.%${q}%`)
      .order('reference').limit(30);

    // Trier : stock > 0 en premier, puis par quantité décroissante
    const data = (rawData || []).sort((a, b) => {
      const da = a.quantite - (a.quantite_reservee || 0);
      const db = b.quantite - (b.quantite_reservee || 0);
      if (da > 0 && db <= 0) return -1;
      if (db > 0 && da <= 0) return 1;
      return db - da;
    }).slice(0, 15);

    if (!data?.length) {
      res.innerHTML = `<p style="font-size:.85rem;color:var(--text-secondary);margin:.5rem 0">
        Aucun article trouvé en stock.
        <button class="btn-secondary btn-sm" onclick="addBonLigneManuelle('${bonId}', '${q.replace(/'/g,"\\'")}')">Ajouter "${q}" quand même (indisponible)</button>
      </p>`;
      return;
    }

    res.innerHTML = `
      <!-- Vue tableau desktop -->
      <div class="table-wrapper stock-table-view">
        <table>
          <thead><tr>
            <th>Référence</th><th>Lot</th><th>Cond.</th><th>Dépôt</th><th>Rangée</th>
            <th>Remarque</th><th>Stock</th><th>Qté à sortir</th><th></th>
          </tr></thead>
          <tbody>
            ${data.map((r, i) => {
              const dispo = r.quantite - (r.quantite_reservee || 0);
              return `<tr>
                <td class="td-ref">${fmt(r.reference)}</td>
                <td class="td-lot">${fmt(r.lot)}</td>
                <td style="font-size:.78rem;color:var(--text-secondary)">${fmt(r.conditionnement)}</td>
                <td>${badgeDepot(r.depot)}</td>
                <td>${fmt(r.rangee)}</td>
                <td style="font-size:.78rem;color:var(--text-secondary);max-width:100px">${fmt(r.remarque)}</td>
                <td style="font-size:1rem;font-weight:700;color:var(--accent);text-align:center">${dispo}</td>
                <td><input type="number" id="bon-qte-${i}" value="1" min="1" max="${dispo}"
                  style="width:65px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" /></td>
                <td><button class="btn-primary btn-sm" onclick='addBonLigne("${bonId}", ${JSON.stringify(r).replace(/'/g,"&#39;")}, ${i})'>+ Ajouter</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <!-- Vue cartes mobile -->
      <div class="stock-card-view">
        ${data.map((r, i) => {
          const dispo = r.quantite - (r.quantite_reservee || 0);
          return `<div class="import-card">
            <div class="import-card-header">
              <span style="font-weight:600">${r.reference}</span>
              <span style="font-size:1.1rem;font-weight:700;color:var(--accent)">${dispo}</span>
            </div>
            <div style="font-size:.82rem;color:var(--text-secondary);margin-bottom:.5rem">
              ${r.lot ? `Lot : ${r.lot}` : ''}
              ${r.conditionnement ? ` · ${r.conditionnement}` : ''}
              ${r.depot ? ` · ${r.depot}` : ''}${r.rangee ? ` / ${r.rangee}` : ''}
            </div>
            ${r.remarque ? `<div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:.5rem">${r.remarque}</div>` : ''}
            <div style="display:flex;align-items:center;gap:.5rem">
              <input type="number" id="bon-qte-${i}" value="1" min="1"
                style="width:65px;padding:.4rem .5rem;border:1.5px solid var(--border);border-radius:4px" />
              <button class="btn-primary btn-sm" onclick='addBonLigne("${bonId}", ${JSON.stringify(r).replace(/'/g,"&#39;")}, ${i})'>+ Ajouter</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }, 300);
}

async function addBonLigne(bonId, stockRow, inputIndex) {
  const qte = parseFloat(document.getElementById(`bon-qte-${inputIndex}`).value) || 1;

  const { error } = await sb.from('bon_lignes').insert({
    bon_id: bonId, stock_id: stockRow.id,
    reference: stockRow.reference, lot: stockRow.lot,
    depot: stockRow.depot, rangee: stockRow.rangee,
    conditionnement: stockRow.conditionnement || null,
    remarque: stockRow.remarque || null,
    quantite: qte, added_by: currentProfile?.prenom || currentUser?.email
  });
  if (error) { toast('Erreur : ' + error.message, 'error'); return; }

  // Réserver la quantité
  await sb.from('stock').update({
    quantite_reservee: (stockRow.quantite_reservee || 0) + qte
  }).eq('id', stockRow.id);

  toast(`${stockRow.reference} ajouté au bon.`);
  document.getElementById('bon-search').value = '';
  document.getElementById('bon-search-results').innerHTML = '';
  openBon(bonId);
}

async function addBonLigneManuelle(bonId, ref) {
  const { error } = await sb.from('bon_lignes').insert({
    bon_id: bonId, reference: ref, quantite: 1,
    added_by: currentProfile?.prenom || currentUser?.email
  });
  if (error) { toast('Erreur : ' + error.message, 'error'); return; }
  toast(`${ref} ajouté (indisponible).`);
  document.getElementById('bon-search').value = '';
  document.getElementById('bon-search-results').innerHTML = '';
  openBon(bonId);
}

async function removeBonLigne(ligneId, bonId) {
  // Récupérer la ligne pour libérer la réservation
  const { data: ligne } = await sb.from('bon_lignes').select('*').eq('id', ligneId).single();
  if (ligne?.stock_id) {
    const { data: stockRow } = await sb.from('stock').select('quantite_reservee').eq('id', ligne.stock_id).single();
    if (stockRow) {
      await sb.from('stock').update({
        quantite_reservee: Math.max(0, (stockRow.quantite_reservee || 0) - ligne.quantite)
      }).eq('id', ligne.stock_id);
    }
  }
  await sb.from('bon_lignes').delete().eq('id', ligneId);
  toast('Ligne supprimée.');
  openBon(bonId);
}

async function validerBon(bonId) {
  const { data: bon } = await sb.from('bons_preparation').select('*').eq('id', bonId).single();
  const { data: lignes } = await sb.from('bon_lignes').select('*').eq('bon_id', bonId);

  if (!lignes?.length) { toast('Le bon est vide.', 'error'); return; }

  const auteur = currentProfile?.prenom || currentUser?.email;
  const annee = new Date(bon.date_prevue).getFullYear();

  // Générer le numéro de BL
  const { data: compteur } = await sb.from('bl_compteur').select('*').eq('annee', annee).maybeSingle();
  const nextNum = (compteur?.dernier_numero || 0) + 1;
  const numeroBL = `BL-${annee}-${String(nextNum).padStart(4, '0')}`;

  if (compteur) {
    await sb.from('bl_compteur').update({ dernier_numero: nextNum }).eq('annee', annee);
  } else {
    await sb.from('bl_compteur').insert({ annee, dernier_numero: nextNum });
  }

  // Pour chaque ligne : déduire le stock, libérer la réservation, créer le mouvement
  for (const l of lignes) {
    let indisponible = false;
    let qtePreparee = l.quantite;

    if (l.stock_id) {
      const { data: stockRow } = await sb.from('stock').select('quantite, quantite_reservee').eq('id', l.stock_id).single();
      if (stockRow) {
        const dispoReel = stockRow.quantite; // ce qui est physiquement présent
        qtePreparee = Math.min(l.quantite, Math.max(0, dispoReel));
        indisponible = qtePreparee < l.quantite;

        await sb.from('stock').update({
          quantite: Math.max(0, stockRow.quantite - qtePreparee),
          quantite_reservee: Math.max(0, (stockRow.quantite_reservee || 0) - l.quantite),
          updated_at: new Date().toISOString()
        }).eq('id', l.stock_id);
      } else {
        indisponible = true;
        qtePreparee = 0;
      }
    } else {
      // Ligne ajoutée manuellement sans stock_id → toujours indisponible
      indisponible = true;
      qtePreparee = 0;
    }

    // Mémoriser le résultat sur la ligne
    await sb.from('bon_lignes').update({
      indisponible, quantite_preparee: qtePreparee
    }).eq('id', l.id);

    // Mouvement de sortie uniquement pour la quantité réellement préparée
    if (qtePreparee > 0) {
      await sb.from('mouvements').insert({
        date_mouvement: bon.date_prevue, type_mouvement: 'sortie',
        reference: l.reference, lot: l.lot, depot: l.depot, rangee: l.rangee,
        quantite: qtePreparee, auteur, source: 'bon_preparation',
        remarque: `${numeroBL} — ${bon.destinataire}`
      });
    }
  }

  await sb.from('bons_preparation').update({
    statut: 'valide', numero_bl: numeroBL, validated_at: new Date().toISOString()
  }).eq('id', bonId);

  toast(`Bon validé ! ${numeroBL}`);
  openBon(bonId);
}

async function imprimerBon(bonId) {
  const { data: bon } = await sb.from('bons_preparation').select('*').eq('id', bonId).single();
  const { data: lignes } = await sb.from('bon_lignes').select('*').eq('bon_id', bonId).order('created_at');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageW = 210;
  const margin = 14;

  // Bandeau titre
  doc.setFillColor(30, 35, 51);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('BON DE PREPARATION', margin, 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('SODIMAS - Mozart Distribution', pageW - margin, 14, { align: 'right' });

  // Infos bon
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`BON EN COURS - A valider apres preparation`, margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Date de preparation : ${fmtDate(bon.date_prevue)}`, margin, 39);
  doc.text(`Destinataire : ${bon.destinataire}`, margin, 46);
  if (bon.remarque) doc.text(`Remarque : ${bon.remarque}`, margin, 53);

  // Zone signatures
  const sigY = 32;
  doc.setFontSize(8.5);
  doc.setTextColor(80);
  doc.text('Prepare par :', pageW - 90, sigY);
  doc.line(pageW - 90, sigY + 14, pageW - margin, sigY + 14);
  doc.text('Controle par :', pageW - 90, sigY + 20);
  doc.line(pageW - 90, sigY + 34, pageW - margin, sigY + 34);
  doc.setTextColor(0);

  let y = bon.remarque ? 60 : 54;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // En-tête tableau
  const cols = {
    ref:      { x: margin,       w: 42, label: 'Reference' },
    lot:      { x: margin + 42,  w: 28, label: 'No de lot' },
    cond:     { x: margin + 70,  w: 16, label: 'Cond.' },
    depot:    { x: margin + 86,  w: 14, label: 'Depot' },
    rangee:   { x: margin + 100, w: 20, label: 'Rangee' },
    remarque: { x: margin + 120, w: 36, label: 'Remarque' },
    qte:      { x: margin + 156, w: 12, label: 'Qte' },
    statut:   { x: margin + 168, w: 28, label: 'Statut' },
  };

  doc.setFillColor(30, 35, 51);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setTextColor(255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  Object.values(cols).forEach(c => doc.text(c.label, c.x + 1, y + 5.5));
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  y += 8;

  lignes?.forEach((l, i) => {
    // Découper après les / pour ref et lot
    doc.setFontSize(8);
    const refStr = String(l.reference || '');
    const refLines = splitAfterSlash(doc, refStr, cols.ref.w - 2);

    const lotStr = String(l.lot || '—');
    const lotLines = splitAfterSlash(doc, lotStr, cols.lot.w - 2);

    const rangeeLines = doc.splitTextToSize(String(l.rangee || '—'), cols.rangee.w - 2);
    const remLines = l.remarque ? doc.splitTextToSize(String(l.remarque), cols.remarque.w - 2) : [''];
    const maxLines = Math.max(refLines.length, lotLines.length, rangeeLines.length, remLines.length);
    const rowH = Math.max(9, maxLines * 5 + 4);

    const indispo = l.indisponible;
    if (indispo) {
      doc.setFillColor(254, 226, 226);
      doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
    } else if (i % 2 === 1) {
      doc.setFillColor(246, 248, 252);
      doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
    }

    const topY = y + 5; // alignement vertical uniforme pour toutes les colonnes
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(refLines, cols.ref.x + 1, topY);
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(7.5);
    doc.text(lotLines, cols.lot.x + 1, topY);
    doc.text(String(l.conditionnement || '—'), cols.cond.x + 1, topY);

    doc.setFontSize(8);
    doc.text(String(l.depot || '—'), cols.depot.x + 1, topY);
    doc.text(rangeeLines, cols.rangee.x + 1, topY);

    if (l.remarque) {
      doc.setTextColor(80);
      doc.setFontSize(7.5);
      doc.text(remLines, cols.remarque.x + 1, topY);
      doc.setTextColor(0);
      doc.setFontSize(8);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(l.quantite), cols.qte.x + cols.qte.w / 2, topY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    if (indispo) {
      doc.setTextColor(200, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const qp = l.quantite_preparee || 0;
      doc.text(qp > 0 ? `${qp}/${l.quantite}` : 'INDISPO', cols.statut.x + 1, topY);
    } else {
      // Case à cocher vide
      doc.setDrawColor(80);
      doc.rect(cols.statut.x + 1, y + (rowH - 6) / 2, 6, 6);
      doc.setDrawColor(220);
    }
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    doc.setDrawColor(220);
    doc.line(margin, y + rowH, pageW - margin, y + rowH);
    y += rowH;
    if (y > 272) {
      doc.addPage(); y = 14;
      doc.setFillColor(30, 35, 51);
      doc.rect(margin, y, pageW - margin * 2, 8, 'F');
      doc.setTextColor(255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      Object.values(cols).forEach(c => doc.text(c.label, c.x + 1, y + 5.5));
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      y += 8;
    }
  });

  doc.setFontSize(7.5);
  doc.setTextColor(150);
  y += 10;
  doc.text(`Bon de preparation provisoire - ${new Date().toLocaleDateString('fr-FR')} - SODIMAS / Mozart Distribution`, margin, y);

  doc.save(`BON_PREP_${bon.destinataire.replace(/\s+/g,'_')}_${bon.date_prevue}.pdf`);
}

// Découpe un texte en lignes en coupant après les / si le texte dépasse la largeur
function splitAfterSlash(doc, text, maxWidth) {
  if (!text || text === '—') return [text || '—'];
  // Si ça rentre sur une ligne, pas besoin de couper
  const w = doc.getTextWidth(text);
  if (w <= maxWidth) return [text];
  // Découper aux /
  const parts = text.split('/');
  const lines = [];
  let current = '';
  for (let i = 0; i < parts.length; i++) {
    const segment = (i < parts.length - 1) ? parts[i] + '/' : parts[i];
    const test = current + segment;
    if (current && doc.getTextWidth(test) > maxWidth) {
      lines.push(current);
      current = segment;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

async function genererPDF(bonId) {
  const { data: bon } = await sb.from('bons_preparation').select('*').eq('id', bonId).single();
  const { data: lignes } = await sb.from('bon_lignes').select('*').eq('bon_id', bonId).order('created_at');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageW = 210;
  const margin = 14;

  // ── En-tête ──────────────────────────────────────────────
  // Bandeau titre
  doc.setFillColor(30, 35, 51);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('BON DE PREPARATION', margin, 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`SODIMAS - Mozart Distribution`, pageW - margin, 14, { align: 'right' });

  // Infos bon
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`N° ${bon.numero_bl || '—'}`, margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Date de préparation : ${fmtDate(bon.date_prevue)}`, margin, 39);
  doc.text(`Destinataire : ${bon.destinataire}`, margin, 46);
  if (bon.remarque) doc.text(`Remarque : ${bon.remarque}`, margin, 53);

  // Zone signatures
  const sigY = 32;
  doc.setFontSize(8.5);
  doc.setTextColor(80);
  doc.text('Prepare par :', pageW - 90, sigY);
  doc.line(pageW - 90, sigY + 14, pageW - margin, sigY + 14);
  doc.text('Controle par :', pageW - 90, sigY + 20);
  doc.line(pageW - 90, sigY + 34, pageW - margin, sigY + 34);
  doc.setTextColor(0);

  // Ligne séparatrice
  let y = bon.remarque ? 60 : 54;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ── En-tête tableau ──────────────────────────────────────
  const cols = {
    ref:      { x: margin,       w: 42, label: 'Reference' },
    lot:      { x: margin + 42,  w: 28, label: 'No de lot' },
    cond:     { x: margin + 70,  w: 16, label: 'Cond.' },
    depot:    { x: margin + 86,  w: 14, label: 'Depot' },
    rangee:   { x: margin + 100, w: 20, label: 'Rangee' },
    remarque: { x: margin + 120, w: 36, label: 'Remarque' },
    qte:      { x: margin + 156, w: 12, label: 'Qte' },
    statut:   { x: margin + 168, w: 28, label: 'Statut' },
  };

  doc.setFillColor(30, 35, 51);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setTextColor(255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  Object.values(cols).forEach(c => doc.text(c.label, c.x + 1, y + 5.5));
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  y += 8;

  lignes?.forEach((l, i) => {
    // Hauteur dynamique avec découpage après les /
    doc.setFontSize(8);
    const refStr = String(l.reference || '');
    const refLines = splitAfterSlash(doc, refStr, cols.ref.w - 2);
    const lotStr = String(l.lot || '—');
    const lotLines = splitAfterSlash(doc, lotStr, cols.lot.w - 2);
    const rangeeLines = doc.splitTextToSize(String(l.rangee || '—'), cols.rangee.w - 2);
    const remLines = l.remarque ? doc.splitTextToSize(String(l.remarque), cols.remarque.w - 2) : [''];
    const maxLines = Math.max(refLines.length, lotLines.length, rangeeLines.length, remLines.length);
    const rowH = Math.max(9, maxLines * 5 + 4);

    if (i % 2 === 1) {
      doc.setFillColor(246, 248, 252);
      doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
    }

    const topY = y + 5; // alignement uniforme pour toutes les colonnes
    doc.setFontSize(8);
    doc.setTextColor(0);

    doc.setFont('helvetica', 'bold');
    doc.text(refLines, cols.ref.x + 1, topY);
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(7.5);
    doc.text(lotLines, cols.lot.x + 1, topY);
    doc.text(String(l.conditionnement || '—'), cols.cond.x + 1, topY);

    doc.setFontSize(8);
    doc.text(String(l.depot || '—'), cols.depot.x + 1, topY);
    doc.text(rangeeLines, cols.rangee.x + 1, topY);

    if (l.remarque) {
      doc.setTextColor(80);
      doc.setFontSize(7.5);
      doc.text(remLines, cols.remarque.x + 1, topY);
      doc.setTextColor(0);
      doc.setFontSize(8);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(l.quantite), cols.qte.x + cols.qte.w / 2, topY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    // Case à cocher vide pour Matthias
    doc.setDrawColor(80);
    doc.rect(cols.statut.x + 1, y + (rowH - 6) / 2, 6, 6);
    doc.setDrawColor(220);
    doc.setDrawColor(220);

    doc.line(margin, y + rowH, pageW - margin, y + rowH);
    y += rowH;
    if (y > 272) {
      doc.addPage(); y = 14;
      doc.setFillColor(30, 35, 51);
      doc.rect(margin, y, pageW - margin * 2, 8, 'F');
      doc.setTextColor(255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      Object.values(cols).forEach(c => doc.text(c.label, c.x + 1, y + 5.5));
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      y += 8;
    }
  });

  doc.setTextColor(0);

  // Note indispo
  if (hasIndispo) {
    y += 6;
    if (y > 265) { doc.addPage(); y = 14; }
    doc.setFontSize(8.5);
    doc.setTextColor(200, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text('! Certains articles n\'ont pas pu etre prepares integralement (stock insuffisant).', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
  }

  // Pied de page
  y += 10;
  if (y > 270) { doc.addPage(); y = 14; }
  doc.setFontSize(7.5);
  doc.setTextColor(150);
  doc.text(`Document genere le ${new Date().toLocaleDateString('fr-FR')} par ${bon.created_by || ''}  -  SODIMAS / Mozart Distribution`, margin, y);

  doc.save(`${bon.numero_bl || 'bon'}_${bon.destinataire.replace(/\s+/g, '_')}.pdf`);
}
