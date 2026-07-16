async function getSettings() {
  return chrome.storage.sync.get({ token: '' });
}

async function api(path, options = {}) {
  const { token } = await getSettings();
  if (!token) {
    throw new Error('Enter your API token in Settings first.');
  }
  const url = `${PINSPAD_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Error (${res.status})`);
  }
  return data;
}

function showMsg(text, ok) {
  const el = document.getElementById('msg');
  el.hidden = false;
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}

async function loadTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('title').value = tab?.title || '';
  document.getElementById('url').value = tab?.url || '';
}

async function loadCategories() {
  const select = document.getElementById('category');
  select.innerHTML = '<option value="">Uncategorized</option>';
  try {
    const data = await api('api/categories');
    for (const c of data.categories || []) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    }
  } catch (e) {
    showMsg(e.message, false);
  }
}

document.getElementById('saveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  try {
    await api('api/pins', {
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
  await loadTab();
  await loadCategories();
})();
