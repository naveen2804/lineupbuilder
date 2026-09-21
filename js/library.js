// Saved lineups, kept in this browser's localStorage.

const LIB_KEY = 'lineupbuilder.library.v1';

const fmtDate = (t) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const newId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isLineup = (e) => e && typeof e === 'object' && e.data && e.data.v === 2 && Array.isArray(e.data.slots) && e.data.players;

/**
 * api: { el, icon, toast, snapshot(), currentId(), setCurrentId(id), load(data, id),
 *        thumb(), summary(), defaultName(), hasContent() }
 */
export function createLibrary(api) {
  const { el, icon, toast } = api;
  const modal = document.getElementById('libraryModal');
  const listEl = document.getElementById('libList');
  const nameInput = document.getElementById('libName');
  const updateBtn = document.getElementById('libUpdate');
  const statusEl = document.getElementById('libStatus');
  const button = document.getElementById('libraryBtn');
  let list = read();
  let renaming = null;

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(LIB_KEY));
      return Array.isArray(v) ? v.filter(isLineup) : [];
    } catch {
      return [];
    }
  }

  function write() {
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(list));
      return true;
    } catch {
      toast('Browser storage is full — delete some saved lineups and try again');
      list = read();
      return false;
    }
  }

  const current = () => list.find((e) => e.id === api.currentId()) || null;

  function isDirty() {
    const cur = current();
    if (!cur) return api.hasContent();
    return JSON.stringify(cur.data) !== JSON.stringify(api.snapshot());
  }

  function updateIndicator() {
    const dirty = isDirty();
    button.classList.toggle('dirty', dirty && (!!current() || api.hasContent()));
    button.title = current() ? (dirty ? `“${current().name}” — unsaved changes` : `“${current().name}” — saved`) : 'Saved lineups';
  }

  function stamp(entry) {
    entry.data = api.snapshot();
    entry.summary = api.summary();
    entry.thumb = api.thumb();
    entry.savedAt = Date.now();
    return entry;
  }

  function saveNew(name) {
    const entry = stamp({ id: newId(), name: name.trim() || api.defaultName() });
    list.unshift(entry);
    if (!write()) return;
    api.setCurrentId(entry.id);
    toast(`Saved “${entry.name}”`);
    refresh();
  }

  function update(id) {
    const entry = list.find((e) => e.id === id);
    if (!entry) return;
    stamp(entry);
    list = [entry, ...list.filter((e) => e !== entry)];
    if (!write()) return;
    api.setCurrentId(entry.id);
    toast(`Saved “${entry.name}”`);
    refresh();
  }

  function openEntry(id) {
    const entry = list.find((e) => e.id === id);
    if (!entry) return;
    if (entry.id !== api.currentId() && isDirty() && api.hasContent() && !window.confirm('Open this lineup? Unsaved changes to the current lineup will be lost.')) return;
    api.load(JSON.parse(JSON.stringify(entry.data)), entry.id);
    close();
    toast(`Opened “${entry.name}”`);
  }

  function duplicate(id) {
    const entry = list.find((e) => e.id === id);
    if (!entry) return;
    const copy = { ...JSON.parse(JSON.stringify(entry)), id: newId(), name: `${entry.name} (copy)`, savedAt: Date.now() };
    list.splice(list.indexOf(entry) + 1, 0, copy);
    if (write()) refresh();
  }

  function remove(id) {
    const entry = list.find((e) => e.id === id);
    if (!entry || !window.confirm(`Delete “${entry.name}”? This can't be undone.`)) return;
    list = list.filter((e) => e !== entry);
    if (!write()) return;
    if (api.currentId() === id) api.setCurrentId(null);
    refresh();
  }

  function rename(id, name) {
    const entry = list.find((e) => e.id === id);
    renaming = null;
    if (entry && name.trim() && name.trim() !== entry.name) {
      entry.name = name.trim();
      write();
    }
    refresh();
  }

  function exportAll() {
    if (!list.length) return toast('Nothing to export yet');
    const blob = new Blob([JSON.stringify({ app: 'lineupbuilder', version: 1, exportedAt: new Date().toISOString(), lineups: list }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `lineups-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`Exported ${list.length} lineup${list.length === 1 ? '' : 's'}`);
  }

  async function importFile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = (Array.isArray(parsed) ? parsed : parsed.lineups || []).filter(isLineup);
      if (!incoming.length) return toast('No lineups found in that file');
      list = [...incoming.map((e) => ({ ...e, id: newId(), name: e.name || 'Imported lineup', savedAt: e.savedAt || Date.now() })), ...list];
      if (write()) {
        toast(`Imported ${incoming.length} lineup${incoming.length === 1 ? '' : 's'}`);
        refresh();
      }
    } catch {
      toast('That file could not be read');
    }
  }

  /* --------------------------------------------------------------- ui */

  function card(entry) {
    const isCurrent = entry.id === api.currentId();
    const s = entry.summary || {};
    let nameEl;
    if (renaming === entry.id) {
      nameEl = el('input', { class: 'input lib-rename', value: entry.name, maxlength: '60', 'aria-label': 'Lineup name' });
      nameEl.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') rename(entry.id, nameEl.value);
        if (e.key === 'Escape') {
          renaming = null;
          refresh();
        }
      });
      nameEl.addEventListener('blur', () => renaming === entry.id && rename(entry.id, nameEl.value));
      requestAnimationFrame(() => {
        nameEl.focus();
        nameEl.select();
      });
    } else nameEl = el('strong', { class: 'lib-name', title: entry.name }, entry.name);

    const iconBtn = (name, label, fn) => el('button', { type: 'button', class: 'icon-btn', title: label, 'aria-label': `${label} ${entry.name}`, onclick: fn }, icon(name));
    return el(
      'article',
      { class: `lib-item${isCurrent ? ' current' : ''}` },
      el('button', { type: 'button', class: 'lib-thumb', 'aria-label': `Open ${entry.name}`, onclick: () => openEntry(entry.id) }, entry.thumb ? el('img', { src: entry.thumb, alt: '' }) : null, isCurrent ? el('span', { class: 'lib-badge' }, 'Open now') : null),
      el(
        'div',
        { class: 'lib-info' },
        nameEl,
        el('small', {}, [s.team || 'Untitled team', s.label, s.count].filter(Boolean).join(' · ')),
        el('small', { class: 'lib-date' }, `Saved ${fmtDate(entry.savedAt)}`),
      ),
      el(
        'div',
        { class: 'lib-actions' },
        el('button', { type: 'button', class: 'btn sm', onclick: () => openEntry(entry.id) }, 'Open'),
        iconBtn('pencil', 'Rename', () => {
          renaming = entry.id;
          refresh();
        }),
        iconBtn('copy', 'Duplicate', () => duplicate(entry.id)),
        iconBtn('trash', 'Delete', () => remove(entry.id)),
      ),
    );
  }

  function refresh() {
    updateIndicator();
    if (modal.hidden) return;
    const cur = current();
    const dirty = isDirty();
    updateBtn.hidden = !cur;
    if (cur) updateBtn.lastChild.textContent = dirty ? `Update “${cur.name}”` : 'Up to date';
    updateBtn.disabled = !cur || !dirty;
    statusEl.replaceChildren(
      el('strong', {}, cur ? cur.name : 'Current lineup'),
      el('small', { class: dirty ? 'warn' : '' }, cur ? (dirty ? 'Unsaved changes' : 'All changes saved') : 'Not saved yet'),
    );
    listEl.replaceChildren(
      ...(list.length
        ? list.map(card)
        : [el('div', { class: 'lib-empty' }, el('strong', {}, 'No saved lineups yet'), el('span', {}, 'Name your lineup above and press Save to keep it here.'))]),
    );
  }

  function openModal(focusName = false) {
    modal.hidden = false;
    document.body.classList.add('modal-open');
    renaming = null;
    nameInput.value = current()?.name || api.defaultName();
    refresh();
    if (focusName) requestAnimationFrame(() => {
      nameInput.focus();
      nameInput.select();
    });
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  document.getElementById('libSaveForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveNew(nameInput.value);
  });
  updateBtn.prepend(icon('save'));
  updateBtn.addEventListener('click', () => current() && update(current().id));
  document.getElementById('libExport').addEventListener('click', exportAll);
  const fileInput = document.getElementById('libFile');
  document.getElementById('libImport').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) importFile(fileInput.files[0]);
    fileInput.value = '';
  });
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  button.addEventListener('click', () => openModal());

  return {
    open: openModal,
    close,
    isOpen: () => !modal.hidden,
    isDirty,
    updateIndicator,
    // Ctrl/⌘+S: update the open lineup, or ask for a name the first time.
    quickSave() {
      if (current()) update(current().id);
      else openModal(true);
    },
  };
}
