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
    'import-photo': 'Import par photo', 'bons': 'Bons de préparation'
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  if (window.innerWidth <= 680) closeSidebar();

  const renderers = {
    dashboard: renderDashboard, stock: renderStock,
    entree: renderEntree, sortie: renderSortie,
    deplacement: renderDeplacement, historique: renderHistorique,
    zones: renderZones, inventaire: renderInventaire,
    'import-photo': renderImportPhoto, 'bons': renderBons
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
  const maxArticles = Math.max(...Object.values(depots).map(d => d.articles), 1);

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
        ${Object.entries(depots).sort((a,b) => b[1].articles - a[1].articles).map(([name, d]) => `
          <div class="depot-bar">
            <div class="depot-name">${name}</div>
            <div class="depot-track">
              <div class="depot-fill" style="width:${Math.round(d.articles/maxArticles*100)}%"></div>
            </div>
            <div class="depot-count">${d.articles} réf.</div>
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
            <th>Référence</th><th>Lot</th><th>Dépôt</th><th>Rangée</th>
            <th>Qté</th><th>Dispo</th><th>Remarque</th><th></th>
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
        <td>${badgeDepot(r.depot)}</td>
        <td>${fmt(r.rangee)}</td>
        <td class="td-qte">${r.quantite}</td>
        <td class="td-qte" style="${reserve > 0 ? 'color:var(--warning)' : ''}">${dispo}${reserve > 0 ? ` <span style="font-size:.72rem;color:var(--text-secondary)">(${reserve} résa.)</span>` : ''}</td>
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
          <span class="stock-card-qte">${r.quantite}</span>
        </div>
        <div class="stock-card-meta">
          ${r.lot ? `<span class="stock-card-lot">Lot : ${r.lot}</span>` : ''}
          <span class="badge badge-depot">${r.depot || '—'}</span>
          ${r.rangee ? `<span class="stock-card-rangee">Rangée ${r.rangee}</span>` : ''}
          ${reserve > 0 ? `<span style="font-size:.78rem;color:var(--warning)">Dispo: ${dispo} (${reserve} résa.)</span>` : ''}
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
  const depot = document.getElementById('edit-depot').value.trim();
  const rangee = document.getElementById('edit-rangee').value.trim();
  const qte = parseFloat(document.getElementById('edit-qte').value);
  const remarque = document.getElementById('edit-remarque').value.trim();

  const { error } = await sb.from('stock').update({
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
    <div class="card form-card">
      <div class="card-header"><div class="card-title">Enregistrer une entrée de stock</div></div>
      <div class="form-section-title">Identification</div>
      <div class="form-group"><label>Référence *</label>
        <input type="text" id="e-ref" placeholder="ex: 35SO530E00077" /></div>
      <div class="form-group"><label>Numéro de lot</label>
        <input type="text" id="e-lot" placeholder="ex: 4500173743" /></div>
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
        <button class="btn-success" onclick="saveEntree()">✓ Enregistrer l'entrée</button>
        <button class="btn-secondary" onclick="resetEntreeForm()">Réinitialiser</button>
      </div>
    </div>
    <datalist id="depot-list"></datalist>
  `;
  // Charger la liste des dépôts connus
  const { data } = await sb.from('stock').select('depot').not('depot', 'is', null);
  const depots = [...new Set(data?.map(r => r.depot))].sort();
  document.getElementById('depot-list').innerHTML = depots.map(d => `<option value="${d}">`).join('');
}

async function saveEntree() {
  const ref = document.getElementById('e-ref').value.trim();
  const lot = document.getElementById('e-lot').value.trim();
  const desig = document.getElementById('e-desig').value.trim();
  const depot = document.getElementById('e-depot').value.trim();
  const rangee = document.getElementById('e-rangee').value.trim();
  const qte = parseFloat(document.getElementById('e-qte').value);
  const date = document.getElementById('e-date').value;
  const remarque = document.getElementById('e-remarque').value.trim();

  if (!ref) { toast('La référence est obligatoire.', 'error'); return; }
  if (!depot) { toast('Le dépôt est obligatoire.', 'error'); return; }
  if (!qte || qte <= 0) { toast('La quantité doit être supérieure à 0.', 'error'); return; }

  // Vérifier si la ligne existe déjà dans le stock (même ref + lot + depot + rangee)
  const { data: existing } = await sb.from('stock')
    .select('id, quantite')
    .eq('reference', ref)
    .eq('depot', depot)
    .maybeSingle();

  let stockError;
  if (existing) {
    // Mettre à jour la quantité
    const { error } = await sb.from('stock').update({
      quantite: existing.quantite + qte,
      updated_at: new Date().toISOString()
    }).eq('id', existing.id);
    stockError = error;
  } else {
    // Créer une nouvelle ligne
    const { error } = await sb.from('stock').insert({
      reference: ref, lot: lot || null, designation: desig || null,
      depot, rangee: rangee || null, quantite: qte,
      remarque: remarque || null
    });
    stockError = error;
  }

  if (stockError) { toast('Erreur stock : ' + stockError.message, 'error'); return; }

  // Enregistrer le mouvement
  await sb.from('mouvements').insert({
    date_mouvement: date, type_mouvement: 'entree',
    reference: ref, lot: lot || null, designation: desig || null,
    depot, rangee: rangee || null, quantite: qte,
    remarque: remarque || null,
    auteur: currentProfile?.prenom || currentUser?.email,
    source: 'app'
  });

  toast(`Entrée enregistrée : ${qte} × ${ref}`);
  resetEntreeForm();
}

function resetEntreeForm() {
  ['e-ref','e-lot','e-desig','e-depot','e-rangee','e-remarque'].forEach(id => {
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
    <div class="card form-card">
      <div class="card-header"><div class="card-title">Enregistrer une sortie de stock</div></div>
      <div class="form-section-title">Rechercher l'article</div>
      <div class="search-bar" style="margin-bottom:.5rem">
        <input type="text" id="s-search" placeholder="Référence ou lot…" oninput="searchStockForSortie()" />
      </div>
      <div id="s-results"></div>
      <div id="s-form" class="hidden">
        <div class="form-section-title">Sortie</div>
        <div id="s-article-info" style="background:var(--accent-light);border-radius:var(--radius-sm);padding:.8rem;margin-bottom:1rem;font-size:.88rem"></div>
        <div class="form-row">
          <div class="form-group"><label>Quantité sortante *</label>
            <input type="number" id="s-qte" min="1" value="1" /></div>
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
  `;
}

let selectedStockRow = null;
let sortieDebounce = null;

async function searchStockForSortie() {
  const q = document.getElementById('s-search').value.trim();
  const res = document.getElementById('s-results');
  clearTimeout(sortieDebounce);
  if (q.length < 2) { res.innerHTML = ''; return; }

  sortieDebounce = setTimeout(async () => {
    const { data } = await sb.from('stock')
      .select('*')
      .or(`reference.ilike.%${q}%,lot.ilike.%${q}%`)
      .gt('quantite', 0)
      .order('reference')
      .limit(10);

    if (!data?.length) { res.innerHTML = `<p style="font-size:.85rem;color:var(--text-secondary);margin:.5rem 0">Aucun article trouvé.</p>`; return; }

    res.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Référence</th><th>Lot</th><th>Dépôt</th><th>Rangée</th><th>Qté dispo</th><th></th></tr></thead>
      <tbody>${data.map(r => `
        <tr>
          <td class="td-ref">${fmt(r.reference)}</td>
          <td class="td-lot">${fmt(r.lot)}</td>
          <td>${badgeDepot(r.depot)}</td>
          <td>${fmt(r.rangee)}</td>
          <td class="td-qte">${r.quantite}</td>
          <td><button class="btn-primary btn-sm" onclick='selectForSortie(${JSON.stringify(r).replace(/'/g,"&#39;")})'>Sélectionner</button></td>
        </tr>
      `).join('')}</tbody>
    </table></div>`;
  }, 300);
}

function selectForSortie(row) {
  selectedStockRow = row;
  document.getElementById('s-results').innerHTML = '';
  document.getElementById('s-search').value = '';
  document.getElementById('s-article-info').innerHTML = `
    <strong>${row.reference}</strong>${row.lot ? ` — Lot ${row.lot}` : ''}<br/>
    Dépôt : <strong>${row.depot || '—'}</strong> | Rangée : <strong>${row.rangee || '—'}</strong> | Stock disponible : <strong>${row.quantite}</strong>
  `;
  document.getElementById('s-qte').max = row.quantite;
  document.getElementById('s-form').classList.remove('hidden');
}

function cancelSortie() {
  selectedStockRow = null;
  document.getElementById('s-form').classList.add('hidden');
  document.getElementById('s-search').value = '';
  document.getElementById('s-results').innerHTML = '';
}

async function saveSortie() {
  if (!selectedStockRow) return;
  const qte = parseFloat(document.getElementById('s-qte').value);
  const date = document.getElementById('s-date').value;
  const remarque = document.getElementById('s-remarque').value.trim();
  const r = selectedStockRow;

  if (!qte || qte <= 0) { toast('Quantité invalide.', 'error'); return; }
  if (qte > r.quantite) { toast(`Stock insuffisant (dispo : ${r.quantite}).`, 'error'); return; }

  const newQte = r.quantite - qte;
  const { error } = await sb.from('stock').update({
    quantite: newQte, updated_at: new Date().toISOString()
  }).eq('id', r.id);

  if (error) { toast('Erreur : ' + error.message, 'error'); return; }

  await sb.from('mouvements').insert({
    date_mouvement: date, type_mouvement: 'sortie',
    reference: r.reference, lot: r.lot, depot: r.depot, rangee: r.rangee,
    quantite: qte, remarque: remarque || null,
    auteur: currentProfile?.prenom || currentUser?.email,
    source: 'app'
  });

  toast(`Sortie enregistrée : ${qte} × ${r.reference}`);
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
  toast('Nouvel inventaire créé.');
  viewInventaire(data.id);
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
              <th>Référence</th><th>Lot</th><th>Dépôt</th><th>Rangée</th>
              <th>Théorique</th><th>Réel</th><th>Écart</th>
              ${isEnCours ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${lignes.map(l => {
                const ecart = (l.quantite_reelle ?? 0) - (l.quantite_theorique ?? 0);
                return `<tr>
                  <td>${isEnCours ? `<input type="text" value="${l.reference || ''}" onchange="invLigneChanged('${l.id}','reference',this.value)" style="width:100%;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.8rem;font-family:monospace" />` : `<span class="td-ref" style="font-size:.78rem">${l.reference}</span>`}</td>
                  <td>${isEnCours ? `<input type="text" value="${l.lot || ''}" onchange="invLigneChanged('${l.id}','lot',this.value)" style="width:100%;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.78rem;font-family:monospace" />` : `<span class="td-lot">${fmt(l.lot)}</span>`}</td>
                  <td>${isEnCours ? `<input type="text" value="${l.depot || ''}" onchange="invLigneChanged('${l.id}','depot',this.value)" style="width:70px;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem" />` : badgeDepot(l.depot)}</td>
                  <td>${isEnCours ? `<input type="text" value="${l.rangee || ''}" onchange="invLigneChanged('${l.id}','rangee',this.value)" style="width:65px;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem" />` : `${fmt(l.rangee)}`}</td>
                  <td class="td-qte">${l.quantite_theorique ?? 0}</td>
                  <td>${isEnCours ? `<input type="number" min="0" value="${l.quantite_reelle ?? 0}" onchange="invLigneChanged('${l.id}','quantite_reelle',this.value)" style="width:65px;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" />` : `<span class="td-qte">${l.quantite_reelle ?? 0}</span>`}</td>
                  <td class="td-qte" id="inv-ecart-${l.id}" style="color:${ecart < 0 ? 'var(--danger)' : ecart > 0 ? 'var(--success)' : 'var(--text-secondary)'}">${ecart > 0 ? '+'+ecart : ecart}</td>
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
                <div class="form-row">
                  <div class="form-group" style="margin-bottom:0"><label>Dépôt</label>
                    <input type="text" value="${l.depot || ''}" onchange="invLigneChanged('${l.id}','depot',this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" /></div>
                  <div class="form-group" style="margin-bottom:0"><label>Rangée</label>
                    <input type="text" value="${l.rangee || ''}" onchange="invLigneChanged('${l.id}','rangee',this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" /></div>
                </div>
              ` : `<div style="font-size:.85rem;color:var(--text-secondary)">Lot : ${fmt(l.lot)} | ${l.depot || '—'} / ${l.rangee || '—'}</div>`}
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

    // Chercher si la référence + lot existe déjà en stock
    let query = sb.from('stock').select('id').eq('reference', ligne.reference);
    if (ligne.lot) {
      query = query.eq('lot', ligne.lot);
    } else {
      query = query.is('lot', null);
    }
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      // Mettre à jour la quantité
      await sb.from('stock').update({
        quantite: ligne.quantite_reelle,
        depot: ligne.depot || undefined,
        rangee: ligne.rangee || undefined,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
      mis_a_jour++;
    } else {
      // Créer la référence si elle n'existe pas
      await sb.from('stock').insert({
        reference: ligne.reference,
        lot: ligne.lot || null,
        depot: ligne.depot || null,
        rangee: ligne.rangee || null,
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
        <button class="btn-success" onclick="validateInvPhoto()">✓ Importer dans l'inventaire</button>
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

  const prompt = `Tu analyses une feuille manuscrite d'inventaire de stock pour un entrepôt d'ascenseurs.
Même conventions que d'habitude :
- Références : x35/530/67 → 35SO530E00067, x36/570/09 → 36SO570E00009, x38/70/30 → 38SO070E00030
- Quantités en bâtons : I=1, II=2, Γ=2, Π=3, □=4, □barré=5
- Zones : D2A6 = Dépôt "2" Rangée "6", RENO 3 = Dépôt "RENO" Rangée "3"
- " = même référence que la ligne précédente

Retourne UNIQUEMENT un JSON valide :
[{"reference": "35SO530E00067", "lot": "4500224268", "quantite": 1, "depot": "2", "rangee": "6"}, ...]
Si valeur absente, mets null.`;

  try {
    const response = await fetch('/.netlify/functions/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
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
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('JSON introuvable');
    invPhotoRows = JSON.parse(match[0]);

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
    `;
    wrap.appendChild(div);
  });
}

function addInvRow() {
  invPhotoRows.push({ reference: '', lot: '', quantite: 0, depot: '', rangee: '' });
  renderInvCards();
  document.getElementById('inv-results-wrap').classList.remove('hidden');
}

function removeInvRow(i) {
  invPhotoRows.splice(i, 1);
  renderInvCards();
}

async function validateInvPhoto() {
  if (!invPhotoRows.length || !invPhotoId) return;

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
      depot: row.depot || null,
      rangee: row.rangee || null,
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
let importPhotoData = null; // { base64, type }
let importRows = [];        // lignes extraites par Claude
let importType = 'sortie';  // 'entree' ou 'sortie'
let importDate = new Date().toISOString().slice(0, 10);

function renderImportPhoto() {
  const el = document.getElementById('page-import-photo');
  el.innerHTML = `
    <div class="card form-card" style="max-width:720px">
      <div class="card-header"><div class="card-title">Import par photo</div></div>
      <p style="font-size:.88rem;color:var(--text-secondary);margin-bottom:1.2rem">
        Prenez en photo une feuille manuscrite d'entrées ou de sorties. Claude va lire les références, lots, quantités et zones automatiquement.
      </p>

      <div class="form-section-title">Type de mouvement & date</div>
      <div class="form-row">
        <div class="form-group"><label>Type *</label>
          <select id="ip-type" onchange="importType=this.value">
            <option value="sortie">Sortie (enlèvement client)</option>
            <option value="entree">Entrée (réception conteneur)</option>
          </select>
        </div>
        <div class="form-group"><label>Date *</label>
          <input type="date" id="ip-date" value="${importDate}" onchange="importDate=this.value" />
        </div>
      </div>

      <div class="form-section-title">Photo de la feuille</div>
      <div id="ip-drop-zone" class="ip-drop-zone" onclick="document.getElementById('ip-file').click()">
        <div id="ip-preview-wrap">
          <div class="ip-drop-icon">📷</div>
          <p>Appuyez pour prendre une photo ou choisir depuis la galerie</p>
        </div>
        <input type="file" id="ip-file" accept="image/*" style="display:none" onchange="onImportPhotoSelected(this)" />
      </div>

      <div id="ip-analyse-wrap" class="hidden" style="margin-top:1rem">
        <button class="btn-primary" id="ip-analyse-btn" onclick="analyseImportPhoto()">
          🔍 Analyser la photo
        </button>
      </div>
    </div>

    <div id="ip-results-wrap" class="hidden" style="margin-top:1rem">
      <div class="card" style="max-width:720px">
        <div class="card-header">
          <div class="card-title">Vérification — <span id="ip-results-count"></span></div>
          <div style="display:flex;gap:.5rem">
            <button class="btn-secondary btn-sm" onclick="addImportRow()">+ Ligne</button>
            <button class="btn-success" onclick="validateImport()">✓ Valider l'import</button>
          </div>
        </div>
        <p style="font-size:.82rem;color:var(--text-secondary);margin-bottom:.8rem">
          Vérifiez et corrigez si nécessaire avant de valider.
        </p>
        <!-- Vue tableau (desktop) -->
        <div class="table-wrapper stock-table-view">
          <table>
            <thead><tr>
              <th>Référence</th><th>Lot</th><th>Qté</th><th>Dépôt</th><th>Rangée</th><th></th>
            </tr></thead>
            <tbody id="ip-tbody"></tbody>
          </table>
        </div>
        <!-- Vue cartes (mobile/tablette) -->
        <div class="stock-card-view" id="ip-cards"></div>
      </div>
    </div>
  `;
}

async function onImportPhotoSelected(input) {
  const file = input.files[0];
  if (!file) return;

  // Afficher prévisualisation
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('ip-preview-wrap').innerHTML = `
      <img src="${e.target.result}" style="max-width:100%;max-height:300px;border-radius:8px;object-fit:contain" />
      <p style="font-size:.8rem;color:var(--text-secondary);margin-top:.5rem">Appuyez pour changer la photo</p>
    `;
  };
  reader.readAsDataURL(file);

  // Compresser et stocker en base64
  const compressed = await compressImage(file, 1600, 0.85);
  const b64 = await new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result.split(',')[1]);
    r.readAsDataURL(compressed);
  });
  importPhotoData = { base64: b64, mediaType: 'image/jpeg' };
  document.getElementById('ip-analyse-wrap').classList.remove('hidden');
}

async function analyseImportPhoto() {
  if (!importPhotoData) return;
  const btn = document.getElementById('ip-analyse-btn');
  btn.textContent = '⏳ Analyse en cours…';
  btn.disabled = true;

  const prompt = `Tu analyses une feuille manuscrite de gestion de stock pour un entrepôt d'ascenseurs.

RÉFÉRENCES — format exact à reconstituer (toutes suivent le même schéma) :
- "x35/530/67" → "35SO530E00067"
- "y35/530/76" → "35SO530E00076"
- "x36/570/09" → "36SO570E00009"
- "x38/70/30" → "38SO070E00030" (même schéma : "38SO" + 3 chiffres + "E" + 5 chiffres, donc 70 devient 070)
- Le préfixe x/y/v/etc devant n'est qu'une coche, ignore-le complètement
- Format général : [2 premiers chiffres]SO[3 chiffres]E[5 chiffres], avec zéros de remplissage à gauche

NUMÉROS DE LOT — attention particulière :
- Les chiffres "7" et "9" sont fréquemment confondus dans cette écriture manuscrite
- Un "7" a une barre horizontale en haut et descend tout droit ou légèrement courbé
- Un "9" a une boucle fermée en haut
- Vérifie chaque chiffre 7/9 individuellement en comparant sa forme avec les autres occurrences du même chiffre sur la feuille

QUANTITÉS — notation en bâtons, very important, lis attentivement :
- "I" ou "l" ou "1" (un seul trait vertical) = 1
- "II" ou "11" (deux traits verticaux) = 2
- "Γ" ou "r" ou "L" cursif (forme de crochet/équerre) = 2
- "Π" ou "n" (forme de portique, deux traits + barre du haut) = 3
- "□" (carré simple) = 4
- "□ barré" ou "carré avec diagonale" = 5
- Compte soigneusement le nombre de traits verticaux distincts pour chaque symbole

ZONES :
- "D2A6" = Dépôt "2" Rangée "6"
- "RENO 8" = Dépôt "RENO" Rangée "8"
- "RACK D2" = Dépôt "2" Rangée "RACK" (le numéro après D = le dépôt, RACK = la rangée)

AUTRES RÈGLES :
- Les x/coches devant une ligne = référence déjà préparée, ignore juste le symbole mais garde la ligne
- Le symbole " ou // sous une référence = même référence que la ligne du dessus
- Une accolade } regroupant plusieurs lignes avec une seule zone à droite = cette zone s'applique à toutes les lignes regroupées

Extrais TOUTES les lignes de la feuille et retourne UNIQUEMENT un JSON valide (sans markdown, sans texte autour) de ce format :
[
  {"reference": "35SO530E00067", "lot": "4500224268", "quantite": 1, "depot": "2", "rangee": "6"},
  ...
]

Si une valeur est illisible ou absente, mets null. Ne mets jamais de commentaires dans le JSON. Vérifie deux fois chaque quantité en bâtons et chaque chiffre 7/9 avant de répondre.`;

  try {
    const response = await fetch('/.netlify/functions/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
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
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('JSON introuvable. Réponse : ' + text.slice(0, 200));
    importRows = JSON.parse(match[0]);

    btn.textContent = '🔍 Analyser la photo';
    btn.disabled = false;
    renderImportTable();

  } catch(e) {
    toast('Erreur d\'analyse : ' + e.message, 'error');
    btn.textContent = '🔍 Analyser la photo';
    btn.disabled = false;
  }
}

function renderImportTable() {
  document.getElementById('ip-results-wrap').classList.remove('hidden');
  document.getElementById('ip-results-count').textContent = `${importRows.length} ligne${importRows.length > 1 ? 's' : ''} détectée${importRows.length > 1 ? 's' : ''}`;

  const tbody = document.getElementById('ip-tbody');
  tbody.innerHTML = '';
  importRows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${row.reference || ''}" onchange="importRows[${i}].reference=this.value" style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem;font-family:monospace" /></td>
      <td><input type="text" value="${row.lot || ''}" onchange="importRows[${i}].lot=this.value" style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.82rem;font-family:monospace" /></td>
      <td><input type="number" value="${row.quantite ?? 1}" min="1" onchange="importRows[${i}].quantite=parseFloat(this.value)" style="width:60px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" /></td>
      <td><input type="text" value="${row.depot || ''}" onchange="importRows[${i}].depot=this.value" style="width:70px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" /></td>
      <td><input type="text" value="${row.rangee || ''}" onchange="importRows[${i}].rangee=this.value" style="width:70px;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" /></td>
      <td><button class="btn-danger btn-sm" onclick="removeImportRow(${i})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });

  // Vue cartes pour mobile
  const cardsWrap = document.getElementById('ip-cards');
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
          <input type="text" value="${row.reference || ''}" onchange="importRows[${i}].reference=this.value;syncImportTable()" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem;font-family:monospace" />
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:.6rem">
            <label>N° de lot</label>
            <input type="text" value="${row.lot || ''}" onchange="importRows[${i}].lot=this.value;syncImportTable()" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.88rem;font-family:monospace" />
          </div>
          <div class="form-group" style="margin-bottom:.6rem">
            <label>Quantité</label>
            <input type="number" value="${row.quantite ?? 1}" min="1" onchange="importRows[${i}].quantite=parseFloat(this.value)" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0">
            <label>Dépôt</label>
            <input type="text" value="${row.depot || ''}" onchange="importRows[${i}].depot=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Rangée</label>
            <input type="text" value="${row.rangee || ''}" onchange="importRows[${i}].rangee=this.value" style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:4px;font-size:.9rem" />
          </div>
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

function addImportRow() {
  importRows.push({ reference: '', lot: '', quantite: 1, depot: '', rangee: '' });
  renderImportTable();
}

function removeImportRow(i) {
  importRows.splice(i, 1);
  renderImportTable();
}

async function validateImport() {
  if (!importRows.length) { toast('Aucune ligne à importer.', 'error'); return; }

  const type = document.getElementById('ip-type').value;
  const date = document.getElementById('ip-date').value;
  const auteur = currentProfile?.prenom || currentUser?.email;

  let errors = 0;
  for (const row of importRows) {
    if (!row.reference || !row.quantite) { errors++; continue; }

    // Mettre à jour le stock
    if (type === 'sortie') {
      const { data: existing } = await sb.from('stock').select('id, quantite')
        .eq('reference', row.reference)
        .maybeSingle();
      if (existing) {
        const newQte = Math.max(0, existing.quantite - row.quantite);
        await sb.from('stock').update({ quantite: newQte, updated_at: new Date().toISOString() }).eq('id', existing.id);
      }
    } else {
      const { data: existing } = await sb.from('stock').select('id, quantite')
        .eq('reference', row.reference)
        .maybeSingle();
      if (existing) {
        await sb.from('stock').update({ quantite: existing.quantite + row.quantite, updated_at: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await sb.from('stock').insert({
          reference: row.reference, lot: row.lot || null,
          depot: row.depot || null, rangee: row.rangee || null,
          quantite: row.quantite
        });
      }
    }

    // Enregistrer le mouvement
    await sb.from('mouvements').insert({
      date_mouvement: date, type_mouvement: type,
      reference: row.reference, lot: row.lot || null,
      depot: row.depot || null, rangee: row.rangee || null,
      quantite: row.quantite, auteur, source: 'import_photo',
      remarque: 'Import par photo'
    });
  }

  const ok = importRows.length - errors;
  toast(`${ok} mouvement${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''} avec succès !`);

  // Reset
  importRows = [];
  importPhotoData = null;
  renderImportPhoto();
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
      <button class="btn-primary" onclick="openNewBonModal()">+ Nouveau bon</button>
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

  // Vérifier la disponibilité pour chaque ligne
  const lignesAvecDispo = await Promise.all((lignes || []).map(async l => {
    const { data: stockRow } = await sb.from('stock').select('quantite, quantite_reservee')
      .eq('reference', l.reference)
      .maybeSingle();
    const dispo = stockRow ? stockRow.quantite - (stockRow.quantite_reservee || 0) + l.quantite : -1;
    return { ...l, stockExiste: !!stockRow, qteDispo: stockRow ? stockRow.quantite : 0 };
  }));

  const isEnCours = bon.statut === 'en_cours';

  openModal(`Bon — ${fmtDate(bon.date_prevue)} → ${bon.destinataire}`, `
    <div style="margin-bottom:1rem">
      <span class="badge ${bon.statut === 'valide' ? 'badge-entree' : 'badge-deplacement'}">${bon.statut === 'valide' ? 'Validé' : 'En cours'}</span>
      ${bon.numero_bl ? `<span style="margin-left:.6rem;font-family:monospace;font-size:.85rem;color:var(--text-secondary)">${bon.numero_bl}</span>` : ''}
      ${bon.remarque ? `<p style="font-size:.85rem;color:var(--text-secondary);margin-top:.5rem">${bon.remarque}</p>` : ''}
    </div>

    <div class="table-wrapper">
      <table>
        <thead><tr><th>Référence</th><th>Lot</th><th>Dépôt</th><th>Rangée</th><th>Qté</th><th>Statut</th>${isEnCours ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${lignesAvecDispo.length ? lignesAvecDispo.map(l => `
            <tr>
              <td class="td-ref">${l.reference}</td>
              <td class="td-lot">${fmt(l.lot)}</td>
              <td>${badgeDepot(l.depot)}</td>
              <td>${fmt(l.rangee)}</td>
              <td class="td-qte">${l.quantite}</td>
              <td>${isEnCours
                  ? (!l.stockExiste || l.qteDispo < l.quantite
                      ? `<span class="badge badge-sortie">⚠️ Indisponible</span>`
                      : `<span class="badge badge-entree">OK</span>`)
                  : (l.indisponible
                      ? `<span class="badge badge-sortie">⚠️ ${(l.quantite_preparee || 0) > 0 ? `Préparé ${l.quantite_preparee}/${l.quantite}` : 'Non préparé'}</span>`
                      : `<span class="badge badge-entree">OK</span>`)}</td>
              ${isEnCours ? `<td><button class="btn-danger btn-sm" onclick="removeBonLigne('${l.id}','${bonId}')">✕</button></td>` : ''}
            </tr>
          `).join('') : `<tr><td colspan="${isEnCours ? 7 : 6}" style="text-align:center;color:var(--text-secondary)">Aucune ligne</td></tr>`}
        </tbody>
      </table>
    </div>

    ${isEnCours ? `
      <div class="form-section-title">Ajouter une ligne</div>
      <div class="search-bar">
        <input type="text" id="bon-search" placeholder="Référence ou lot…" oninput="searchStockForBon('${bonId}')" />
      </div>
      <div id="bon-search-results"></div>

      <div class="form-actions" style="margin-top:1.4rem">
        <button class="btn-success" onclick="validerBon('${bonId}')">✓ Valider le bon → générer BL</button>
        <button class="btn-danger" onclick="deleteBon('${bonId}', false)">🗑 Supprimer le bon</button>
        <button class="btn-secondary" onclick="closeModal()">Fermer</button>
      </div>
    ` : `
      <div class="form-actions" style="margin-top:1.4rem">
        <button class="btn-primary" onclick="genererPDF('${bonId}')">📄 Télécharger le BL</button>
        <button class="btn-danger" onclick="deleteBon('${bonId}', true)">🗑 Supprimer (annuler le BL)</button>
        <button class="btn-secondary" onclick="closeModal()">Fermer</button>
      </div>
    `}
  `);
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
          // Restaurer la quantité déduite (elle n'est plus réservée car déjà validée)
          await sb.from('stock').update({
            quantite: stockRow.quantite + l.quantite,
            updated_at: new Date().toISOString()
          }).eq('id', l.stock_id);
        } else {
          // Juste libérer la réservation
          await sb.from('stock').update({
            quantite_reservee: Math.max(0, (stockRow.quantite_reservee || 0) - l.quantite)
          }).eq('id', l.stock_id);
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
  closeModal();
  renderBons();
}

let bonSearchDebounce = null;
async function searchStockForBon(bonId) {
  const q = document.getElementById('bon-search').value.trim();
  const res = document.getElementById('bon-search-results');
  clearTimeout(bonSearchDebounce);
  if (q.length < 2) { res.innerHTML = ''; return; }

  bonSearchDebounce = setTimeout(async () => {
    const { data } = await sb.from('stock').select('*')
      .or(`reference.ilike.%${q}%,lot.ilike.%${q}%`)
      .order('reference').limit(8);

    if (!data?.length) {
      res.innerHTML = `<p style="font-size:.85rem;color:var(--text-secondary);margin:.5rem 0">
        Aucun article trouvé en stock. <button class="btn-secondary btn-sm" onclick="addBonLigneManuelle('${bonId}', '${q.replace(/'/g,"\\'")}')">Ajouter "${q}" quand même (indisponible)</button>
      </p>`;
      return;
    }

    res.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Référence</th><th>Lot</th><th>Dépôt</th><th>Dispo</th><th>Qté</th><th></th></tr></thead>
      <tbody>${data.map((r, i) => `
        <tr>
          <td class="td-ref">${fmt(r.reference)}</td>
          <td class="td-lot">${fmt(r.lot)}</td>
          <td>${badgeDepot(r.depot)}</td>
          <td class="td-qte">${(r.quantite - (r.quantite_reservee || 0)).toFixed(0)}</td>
          <td><input type="number" id="bon-qte-${i}" value="1" min="1" style="width:55px;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px" /></td>
          <td><button class="btn-primary btn-sm" onclick='addBonLigne("${bonId}", ${JSON.stringify(r).replace(/'/g,"&#39;")}, ${i})'>Ajouter</button></td>
        </tr>
      `).join('')}</tbody>
    </table></div>`;
  }, 300);
}

async function addBonLigne(bonId, stockRow, inputIndex) {
  const qte = parseFloat(document.getElementById(`bon-qte-${inputIndex}`).value) || 1;

  const { error } = await sb.from('bon_lignes').insert({
    bon_id: bonId, stock_id: stockRow.id,
    reference: stockRow.reference, lot: stockRow.lot,
    depot: stockRow.depot, rangee: stockRow.rangee,
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
  closeModal();
  renderBons();
}

async function genererPDF(bonId) {
  const { data: bon } = await sb.from('bons_preparation').select('*').eq('id', bonId).single();
  const { data: lignes } = await sb.from('bon_lignes').select('*').eq('bon_id', bonId).order('created_at');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // En-tête
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('BON DE LIVRAISON', 14, 20);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`N° ${bon.numero_bl}`, 14, 30);
  doc.text(`Date : ${fmtDate(bon.date_prevue)}`, 14, 37);
  doc.text(`Destinataire : ${bon.destinataire}`, 14, 44);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('SODIMAS — Gestion de stock entrepôt (Mozart Distribution)', 14, 54);
  doc.setTextColor(0);

  // Tableau
  let y = 65;
  doc.setFillColor(30, 35, 51);
  doc.setTextColor(255);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFontSize(9);
  doc.text('Référence', 17, y + 5.5);
  doc.text('Lot', 65, y + 5.5);
  doc.text('Dépôt', 102, y + 5.5);
  doc.text('Rangée', 122, y + 5.5);
  doc.text('Qté dem.', 145, y + 5.5);
  doc.text('Statut', 168, y + 5.5);

  doc.setTextColor(0);
  y += 8;

  let hasIndispo = false;

  lignes?.forEach((l, i) => {
    const indispo = l.indisponible;
    if (indispo) hasIndispo = true;

    if (i % 2 === 1) {
      doc.setFillColor(245, 247, 250);
      doc.rect(14, y, 182, 7, 'F');
    }
    if (indispo) {
      doc.setFillColor(254, 226, 226);
      doc.rect(14, y, 182, 7, 'F');
    }

    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(String(l.reference || ''), 17, y + 5);
    doc.text(String(l.lot || '—'), 65, y + 5);
    doc.text(String(l.depot || '—'), 102, y + 5);
    doc.text(String(l.rangee || '—'), 122, y + 5);
    doc.text(String(l.quantite), 148, y + 5);

    if (indispo) {
      doc.setTextColor(200, 30, 30);
      doc.setFontSize(8);
      const qp = l.quantite_preparee || 0;
      const label = qp > 0 ? `Préparé: ${qp}/${l.quantite}` : 'Non préparé';
      doc.text(label, 168, y + 5);
    } else {
      doc.setTextColor(20, 130, 60);
      doc.text('OK', 168, y + 5);
    }

    y += 7;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  doc.setTextColor(0);

  // Note explicative si des lignes sont indisponibles
  if (hasIndispo) {
    y += 8;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(9);
    doc.setTextColor(200, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text('⚠ Certains articles n\'ont pas pu être préparés intégralement', 14, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    doc.setFontSize(8.5);
    doc.text('en raison d\'un stock insuffisant ou nul au moment de la préparation.', 14, y);
    doc.setTextColor(0);
  }

  // Pied de page
  y += 15;
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Document généré le ${new Date().toLocaleDateString('fr-FR')} par ${bon.created_by || ''}`, 14, y);

  doc.save(`${bon.numero_bl || 'bon'}_${bon.destinataire.replace(/\s+/g,'_')}.pdf`);
}
