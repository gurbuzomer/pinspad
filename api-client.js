async function getSettings() {
  return chrome.storage.sync.get({ token: '' });
}

async function pinspadApi(path, options = {}) {
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
