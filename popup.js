function showMsg(text, ok) {
  const el = document.getElementById('msg');
  el.hidden = false;
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}

function hideLoading() {
  document.getElementById('loading').hidden = true;
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
  document.getElementById('title').value = tab?.title || '';
  document.getElementById('url').value = tab?.url || '';
}

async function loadCategories() {
  const select = document.getElementById('category');
  select.innerHTML = '<option value="">Uncategorized</option>';
  const data = await pinspadApi('api/categories');
  for (const c of data.categories || []) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  }
}

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
        category_id: document.getElementById('category').value || null,
      }),
    });
    showMsg('Saved to PinsPad.', true);
    setTimeout(() => window.close(), 700);
  } catch (err) {
    showMsg(err.message, false);
  } finally {
    btn.disabled = false;
  }
});

(async () => {
  wirePinsPadDashboardLinks();
  if (!(await verifyConnection())) {
    return;
  }
  showApp();
  try {
    await loadTab();
    await loadCategories();
  } catch (e) {
    showSetup(
      `Could not load your PinsPad data.${e.message ? ` ${e.message}` : ''} Check Settings.`
    );
  }
})();
