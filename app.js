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
    'import-photo': 'Import par photo'
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  if (window.innerWidth <= 680) closeSidebar();

  const renderers = {
    dashboard: renderDashboard, stock: renderStock,
    entree: renderEntree, sortie: renderSortie,
    deplacement: renderDeplacement, historique: renderHistorique,
    zones: renderZones, inventaire: renderInventaire,
    'import-photo': renderImportPhoto
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
let stockFilters = { q: '', depot: '' };
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
            <th>Qté</th><th>Remarque</th><th></th>
          </tr></thead>
          <tbody id="stock-tbody"></tbody>
        </table>
      </div>`;
    cardWrap.innerHTML = `<div class="stock-card-view" id="stock-cards"></div>`;
  }

  const tbody = document.getElementById('stock-tbody');
  const cards = document.getElementById('stock-cards');

  data.forEach(r => {
    // Ligne tableau
    if (tbody) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-ref" style="cursor:pointer" onclick="openArticle('${r.id}')">${fmt(r.reference)}</td>
        <td class="td-lot">${fmt(r.lot)}</td>
        <td>${badgeDepot(r.depot)}</td>
        <td>${fmt(r.rangee)}</td>
        <td class="td-qte">${r.quantite}</td>
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
  stockFilters = { q: '', depot: '' };
  const s = document.getElementById('stock-search');
  const d = document.getElementById('stock-depot');
  if (s) s.value = '';
  if (d) d.value = '';
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
                  <td><button class="btn-secondary btn-sm" onclick="viewInventaire('${inv.id}')">Voir</button></td>
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
  const { data: lignes } = await sb.from('inventaire_lignes').select('*').eq('inventaire_id', invId);
  const { data: stock } = await sb.from('stock').select('*').order('reference');

  openModal(`Inventaire du ${fmtDate(inv.date_inventaire)}`, `
    <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:1rem">
      Statut : <strong>${inv.statut}</strong> | Par : ${inv.auteur || '—'}
    </p>
    <div class="form-section-title">Saisir les quantités réelles</div>
    <div style="max-height:350px;overflow-y:auto">
      <table>
        <thead><tr><th>Référence</th><th>Dépôt</th><th>Théorique</th><th>Réel</th><th>Écart</th></tr></thead>
        <tbody id="inv-tbody">
          ${stock?.slice(0,30).map(r => {
            const ligne = lignes?.find(l => l.reference === r.reference && l.depot === r.depot);
            const reel = ligne?.quantite_reelle ?? '';
            const ecart = ligne ? (ligne.quantite_reelle - r.quantite) : '';
            return `<tr>
              <td class="td-ref" style="font-size:.78rem">${r.reference}</td>
              <td>${badgeDepot(r.depot)}</td>
              <td class="td-qte">${r.quantite}</td>
              <td><input type="number" min="0" value="${reel}" data-id="${r.id}" data-ref="${r.reference}" data-depot="${r.depot || ''}" data-theorique="${r.quantite}" data-inv="${invId}" style="width:70px;padding:.25rem .4rem;border:1.5px solid var(--border);border-radius:4px;font-size:.85rem" onchange="saveInventaireLigne(this)" /></td>
              <td class="td-qte" id="ecart-${r.id}" style="color:${ecart < 0 ? 'var(--danger)' : ecart > 0 ? 'var(--success)' : 'var(--text-secondary)'}">${ecart !== '' ? (ecart > 0 ? '+'+ecart : ecart) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${inv.statut === 'en_cours' ? `
      <div class="form-actions" style="margin-top:1rem">
        <button class="btn-success" onclick="cloturerInventaire('${invId}')">✓ Clôturer l'inventaire</button>
      </div>
    ` : ''}
  `);
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
  toast('Inventaire clôturé.');
  closeModal();
  renderInventaire();
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
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Référence</th><th>Lot</th><th>Qté</th><th>Dépôt</th><th>Rangée</th><th></th>
            </tr></thead>
            <tbody id="ip-tbody"></tbody>
          </table>
        </div>
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

Contexte :
- Les références ressemblent à : 35SO530E00067, 36SO570E00009, 38170E00030, etc.
- Les numéros de lot ressemblent à : 4500224268, 4600128293, etc.
- Les quantités sont parfois en notation bâton : I=1, II=2, III=3, □=4, □barré=5
- Les zones de stockage : D2A6 = Dépôt 2 Rangée 6, RENO 3 = Dépôt RENO Rangée 3, RACK D2 = Dépôt RACK Rangée 2
- Les x ou coches devant une ligne = référence préparée, à ignorer
- Les guillemets " = même référence que la ligne précédente

Extrais TOUTES les lignes de la feuille et retourne UNIQUEMENT un JSON valide (sans markdown, sans texte autour) de ce format :
[
  {"reference": "35SO530E00067", "lot": "4500224268", "quantite": 1, "depot": "2", "rangee": "6"},
  ...
]

Si une valeur est illisible ou absente, mets null. Ne mets jamais de commentaires dans le JSON.`;

  try {
    const response = await fetch('/.netlify/functions/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
