const statusEl = document.getElementById('status');

function setStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = ok ? 'ok' : 'err';
}

chrome.storage.sync.get({ token: '' }, (data) => {
  document.getElementById('token').value = data.token || '';
});

document.getElementById('optionsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const token = document.getElementById('token').value.trim();
  chrome.storage.sync.set({ token }, () => {
    chrome.storage.sync.remove('baseUrl');
    setStatus('Settings saved.', true);
  });
});

document.getElementById('testBtn').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim();
  if (!token) {
    setStatus('API token is required.', false);
    return;
  }
  try {
    const res = await fetch(`${PINSPAD_BASE_URL}/api/ping`, {
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    setStatus(`Connection OK — ${data.user?.display_name || data.user?.email || 'PinsPad'}`, true);
  } catch (err) {
    setStatus('Connection failed: ' + err.message, false);
  }
});
