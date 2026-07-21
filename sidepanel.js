const PIN_LIST_LIMIT = 50;

function showMsg(text, ok) {
  const el = document.getElementById('msg');
  el.hidden = false;
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}

function hideLoading() {
  document.getElementById('loading').hidden = true;
}

function showLoading(message = 'Checking connection…') {
  const text = document.querySelector('#loading .loading-text');
  if (text) text.textContent = message;
  document.getElementById('loading').hidden = false;
  document.getElementById('setupGate').hidden = true;
  document.getElementById('appMain').hidden = true;
}

function showSetup(message) {
  hideLoading();
  document.getElementById('setupText').textContent = message;
  document.getElementById('setupGate').hidden = false;
  document.getElementById('appMain').hidden = true;
}

function showApp() {
  hideLoading();
  document.getElementById('setupGate').hidden = true;
  document.getElementById('appMain').hidden = false;
}

const SETUP_NO_TOKEN =
  'Add your PinsPad API token in extension Settings. Create a token on the website (account menu → Extension & API), then paste it here. Use Open Dashboard to sign in on the web.';

async function verifyConnection() {
  const { token } = await getSettings();
  if (!token || !String(token).trim()) {
    showSetup(SETUP_NO_TOKEN);
    return false;
  }
  try {
    await pinspadApi('api/ping');
    return true;
  } catch (e) {
    const detail = e.message ? ` ${e.message}` : '';
    showSetup(
      `Could not reach PinsPad or your API token is invalid.${detail} Update it in Settings.`
    );
    return false;
  }
}

async function loadTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const titleEl = document.getElementById('title');
  const urlEl = document.getElementById('url');
  if (!tab) {
    titleEl.value = '';
    urlEl.value = '';
    return;
  }
  titleEl.value = tab.title || '';
  urlEl.value = tab.url || '';
}

function isQuickSaveVisible() {
  const app = document.getElementById('appMain');
  return app && !app.hidden;
}

function bindActiveTabSync() {
  const syncFromActiveTab = () => {
    if (!isQuickSaveVisible()) return;
    loadTab().catch(() => {});
  };

  chrome.tabs.onActivated.addListener(() => {
    syncFromActiveTab();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url && !changeInfo.title && changeInfo.status !== 'complete') return;
    chrome.tabs.query({ active: true, currentWindow: true }, ([active]) => {
      if (active?.id === tabId) syncFromActiveTab();
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncFromActiveTab();
  });
}

function fillCategorySelect(select, { includeAll = false } = {}) {
  select.innerHTML = '';
  if (includeAll) {
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All categories';
    select.appendChild(all);
  } else {
    const unc = document.createElement('option');
    unc.value = '';
    unc.textContent = 'Uncategorized';
    select.appendChild(unc);
  }
}

async function loadCategories() {
  const saveSelect = document.getElementById('saveCategory');
  const listSelect = document.getElementById('listCategory');
  fillCategorySelect(saveSelect, { includeAll: false });
  fillCategorySelect(listSelect, { includeAll: true });

  const data = await pinspadApi('api/categories');
  for (const c of data.categories || []) {
    for (const select of [saveSelect, listSelect]) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    }
  }
}

function pinsQueryForListCategory(categoryValue) {
  const params = new URLSearchParams({ sort: 'visits' });
  if (categoryValue) {
    params.set('category_id', categoryValue);
  }
  return `api/pins?${params}`;
}

function renderPinList(pins) {
  const list = document.getElementById('pinList');
  const empty = document.getElementById('pinsEmpty');
  list.innerHTML = '';

  const slice = (pins || []).slice(0, PIN_LIST_LIMIT);
  if (!slice.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const p of slice) {
    const li = document.createElement('li');
    li.className = 'pin-row';

    const a = document.createElement('a');
    a.className = 'pin-link';
    a.href = p.url;
    a.title = p.title;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openPin(p);
    });

    if (p.favicon_url) {
      const img = document.createElement('img');
      img.className = 'pin-favicon';
      img.src = p.favicon_url;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      a.appendChild(img);
    } else {
      const ph = document.createElement('span');
      ph.className = 'pin-favicon placeholder';
      ph.setAttribute('aria-hidden', 'true');
      a.appendChild(ph);
    }

    const text = document.createElement('span');
    text.className = 'pin-text';
    const title = document.createElement('span');
    title.className = 'pin-title';
    title.textContent = p.title || p.url;
    const host = document.createElement('span');
    host.className = 'pin-host';
    host.textContent = p.domain || p.url;
    text.append(title, host);

    const visits = document.createElement('span');
    visits.className = 'pin-visits';
    visits.textContent = `${p.visit_count ?? 0}`;

    a.append(text, visits);
    li.appendChild(a);
    list.appendChild(li);
  }
}

async function openPin(pin) {
  chrome.tabs.create({ url: pin.url });
  pinspadApi(`api/pins/${pin.id}/visit`, { method: 'POST', body: '{}' }).catch(() => {});
}

async function loadPinList() {
  const status = document.getElementById('pinsStatus');
  const listSelect = document.getElementById('listCategory');
  status.hidden = false;
  status.textContent = 'Loading…';
  try {
    const data = await pinspadApi(pinsQueryForListCategory(listSelect.value));
    renderPinList(data.pins);
    status.textContent = '';
    status.hidden = true;
  } catch (e) {
    status.textContent = e.message || 'Could not load pins.';
    document.getElementById('pinList').innerHTML = '';
    document.getElementById('pinsEmpty').hidden = true;
  }
}

document.getElementById('listCategory').addEventListener('change', () => {
  loadPinList();
});

document.getElementById('saveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  try {
    await pinspadApi('api/pins', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('title').value.trim(),
        url: document.getElementById('url').value.trim(),
        note: document.getElementById('note').value.trim(),
        category_id: document.getElementById('saveCategory').value || null,
      }),
    });
    showMsg('Saved to PinsPad.', true);
    await loadPinList();
  } catch (err) {
    showMsg(err.message, false);
  } finally {
    btn.disabled = false;
  }
});

let bootstrapGen = 0;

async function bootstrap() {
  const gen = ++bootstrapGen;
  const refreshSetupBtn = document.getElementById('btnRefreshSetup');
  if (refreshSetupBtn) refreshSetupBtn.disabled = true;

  showLoading();

  if (!(await verifyConnection())) {
    if (gen !== bootstrapGen) return;
    if (refreshSetupBtn) refreshSetupBtn.disabled = false;
    return;
  }
  if (gen !== bootstrapGen) return;

  showApp();
  try {
    await loadTab();
    await loadCategories();
    await loadPinList();
  } catch (e) {
    showSetup(
      `Could not load your PinsPad data.${e.message ? ` ${e.message}` : ''} Check Settings.`
    );
  } finally {
    if (gen === bootstrapGen && refreshSetupBtn) refreshSetupBtn.disabled = false;
  }
}

function bindRefreshControls() {
  document.getElementById('btnRefreshSetup')?.addEventListener('click', () => bootstrap());
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.prototype.hasOwnProperty.call(changes, 'token')) {
    bootstrap();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const setupVisible = !document.getElementById('setupGate').hidden;
  if (setupVisible) bootstrap();
});

wirePinsPadDashboardLinks();
bindRefreshControls();
bindActiveTabSync();
bootstrap();
