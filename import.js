/** @typedef {{ id: string, title: string, url: string, folderPath: string, categoryId: string, checked: boolean }} ImportRow */

/** @type {ImportRow[]} */
let rows = [];
/** @type {{ id: number, name: string }[]} */
let categories = [];

function flattenBookmarks(nodes, path = []) {
  const out = [];
  for (const node of nodes) {
    if (node.url) {
      const scheme = (node.url.split(':')[0] || '').toLowerCase();
      if (scheme === 'http' || scheme === 'https') {
        out.push({
          id: node.id,
          title: node.title || node.url,
          url: node.url,
          folderPath: path.length ? path.join(' / ') : '',
        });
      }
    }
    if (node.children) {
      const nextPath =
        node.title && !node.url ? [...path, node.title] : path;
      out.push(...flattenBookmarks(node.children, nextPath));
    }
  }
  return out;
}

function categoryIdForFolder(folderPath) {
  if (!folderPath) return '';
  const leaf = folderPath.split(' / ').pop() || '';
  const match = categories.find(
    (c) => c.name.toLowerCase() === leaf.toLowerCase()
  );
  return match ? String(match.id) : '';
}

function pinItemFromRow(r) {
  const categoryId = r.categoryId ? String(r.categoryId) : '';
  return {
    title: String(r.title || '').trim() || r.url,
    url: String(r.url || '').trim(),
    category_id: categoryId !== '' ? categoryId : null,
  };
}

async function postImportChunk(payload) {
  const body = JSON.stringify(payload);
  const paths = ['api/bookmarks/import', 'api/pins'];
  let lastError = null;
  for (const path of paths) {
    try {
      return await pinspadApi(path, { method: 'POST', body });
    } catch (e) {
      lastError = e;
      const msg = String(e.message || '');
      const tryNext =
        path === 'api/bookmarks/import' &&
        (msg.includes('Not found') || msg.includes('(404)'));
      if (!tryNext) {
        throw e;
      }
    }
  }
  throw lastError || new Error('Import failed.');
}

function fillCategorySelect(select, selected = '') {
  select.innerHTML = '';
  const unc = document.createElement('option');
  unc.value = '';
  unc.textContent = 'Uncategorized';
  select.appendChild(unc);
  for (const c of categories) {
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = c.name;
    select.appendChild(opt);
  }
  select.value = selected;
}

function rowMatchesFilter(row, q) {
  if (!q) return true;
  const hay = `${row.title} ${row.url} ${row.folderPath}`.toLowerCase();
  return hay.includes(q);
}

function updateCounts() {
  const filter = document.getElementById('filter').value.trim().toLowerCase();
  const visible = rows.filter((r) => rowMatchesFilter(r, filter));
  const selected = rows.filter((r) => r.checked).length;
  document.getElementById('counts').textContent =
    `${selected} selected · ${visible.length} shown · ${rows.length} total`;
  document.getElementById('importBtn').disabled = selected === 0;
  document.getElementById('importBtn').textContent =
    selected > 0
      ? `Import ${selected} to PinsPad`
      : 'Import to PinsPad';

  const visibleChecked =
    visible.length > 0 && visible.every((r) => r.checked);
  const selectAll = document.getElementById('selectAll');
  selectAll.indeterminate =
    visible.some((r) => r.checked) && !visibleChecked;
  selectAll.checked = visibleChecked;
}

function renderList() {
  const list = document.getElementById('list');
  const filter = document.getElementById('filter').value.trim().toLowerCase();
  list.innerHTML = '';

  for (const row of rows) {
    const li = document.createElement('li');
    li.className = 'bookmark-row';
    li.dataset.id = row.id;
    if (!rowMatchesFilter(row, filter)) {
      li.classList.add('is-hidden');
    }

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = row.checked;
    check.setAttribute('aria-label', `Import ${row.title}`);
    check.addEventListener('change', () => {
      row.checked = check.checked;
      updateCounts();
    });

    const meta = document.createElement('div');
    meta.className = 'bookmark-meta';
    const title = document.createElement('div');
    title.className = 'bookmark-title';
    title.textContent = row.title;
    title.title = row.title;
    const url = document.createElement('div');
    url.className = 'bookmark-url';
    url.textContent = row.url;
    url.title = row.url;
    meta.appendChild(title);
    meta.appendChild(url);
    if (row.folderPath) {
      const folder = document.createElement('div');
      folder.className = 'bookmark-folder';
      folder.textContent = row.folderPath;
      folder.title = row.folderPath;
      meta.appendChild(folder);
    }

    const cat = document.createElement('select');
    fillCategorySelect(cat, row.categoryId);
    cat.addEventListener('change', () => {
      row.categoryId = cat.value;
    });

    li.appendChild(check);
    li.appendChild(meta);
    li.appendChild(cat);
    list.appendChild(li);
  }
  updateCounts();
}

function setStatus(text, kind = '') {
  const el = document.getElementById('importStatus');
  el.textContent = text;
  el.className = 'import-status' + (kind ? ` ${kind}` : '');
}

async function loadCategories() {
  const data = await pinspadApi('api/categories');
  categories = data.categories || [];
  fillCategorySelect(document.getElementById('bulkCategory'), '');
}

async function loadBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  const flat = flattenBookmarks(tree);
  rows = flat.map((b) => ({
    ...b,
    categoryId: categoryIdForFolder(b.folderPath),
    checked: false,
  }));
}

async function runImport() {
  const selected = rows.filter((r) => r.checked);
  if (!selected.length) return;

  const btn = document.getElementById('importBtn');
  btn.disabled = true;
  const chunkSize = 50;
  let done = 0;
  let failed = 0;
  let sampleError = '';

  try {
    for (let i = 0; i < selected.length; i += chunkSize) {
      const chunk = selected.slice(i, i + chunkSize);
      setStatus(`Importing ${done} / ${selected.length}…`);
      const payload = {
        pins: chunk.map((r) => pinItemFromRow(r)),
      };
      const data = await postImportChunk(payload);
      done += data.created_count ?? 0;
      failed += data.error_count ?? 0;
      const err0 = data.errors?.[0]?.error;
      if (err0) {
        sampleError = err0;
      }
    }
    const ok = failed === 0 && done > 0;
    const partial = done > 0 && failed > 0;
    setStatus(
      ok
        ? `Done — ${done} pin${done === 1 ? '' : 's'} added to PinsPad.`
        : partial
          ? `Imported ${done}; ${failed} failed.${sampleError ? ` (${sampleError})` : ''}`
          : failed > 0
            ? `Import failed for ${failed} item(s).${sampleError ? ` ${sampleError}` : ''}`
            : 'Nothing was imported.',
      ok || partial ? (partial ? 'err' : 'ok') : 'err'
    );
    if (ok) {
      rows = rows.filter((r) => !r.checked);
      renderList();
    }
  } catch (e) {
    let msg = e.message || 'Import failed.';
    if (msg === 'Enter a valid URL.') {
      msg =
        'Server could not import bookmarks (outdated API or invalid URLs). Deploy the latest PinsPad code to pinspad.com, reload the extension, and try again.';
    }
    setStatus(msg, 'err');
  } finally {
    btn.disabled = rows.every((r) => !r.checked);
    updateCounts();
  }
}

function wireUi() {
  document.getElementById('filter').addEventListener('input', () => {
    renderList();
  });

  document.getElementById('selectAll').addEventListener('change', (e) => {
    const filter = document.getElementById('filter').value.trim().toLowerCase();
    const checked = e.target.checked;
    for (const row of rows) {
      if (rowMatchesFilter(row, filter)) {
        row.checked = checked;
      }
    }
    renderList();
  });

  document.getElementById('applyBulk').addEventListener('click', () => {
    const cat = document.getElementById('bulkCategory').value;
    for (const row of rows) {
      if (row.checked) {
        row.categoryId = cat;
      }
    }
    renderList();
  });

  document.getElementById('importBtn').addEventListener('click', runImport);
}

function showError(message) {
  document.getElementById('loading').hidden = true;
  document.getElementById('main').hidden = true;
  const panel = document.getElementById('errorPanel');
  panel.hidden = false;
  document.getElementById('errorText').textContent = message;
}

(async () => {
  wirePinsPadDashboardLinks();
  wireUi();
  try {
    const { token } = await getSettings();
    if (!token) {
      showError('Add your API token in Settings before importing.');
      return;
    }
    await loadCategories();
    await loadBookmarks();
    if (!rows.length) {
      showError('No http/https bookmarks found in this Chrome profile.');
      return;
    }
    document.getElementById('loading').hidden = true;
    document.getElementById('main').hidden = false;
    renderList();
  } catch (e) {
    showError(e.message);
  }
})();
