import { BUILD_ID } from './buildid.js';
import { GAME_CATALOGUE, GAME_IDS } from './catalogue.js';
import { inspectInventory, formatDiagnostic } from './diagnostics.js';
import { chooseDirectory, collectDirectoryFiles, filesFromDataTransfer, filesFromInput, describeSelection } from './files.js';
import {
  forgetDirectoryHandle,
  queryDirectoryPermission,
  requestDirectoryPermission,
  reusableDirectory,
  saveDirectoryHandle,
} from './idb.js';
import { applyValidation, createLauncherState, selectPrimary } from './selection.js';

const gameSelect = document.querySelector('#game');
const fileInput = document.querySelector('#files');
const folderInput = document.querySelector('#folder-files');
const dropZone = document.querySelector('#drop-zone');
const chooseFolder = document.querySelector('#choose-folder');
const reuseFolder = document.querySelector('#reuse-folder');
const forgetFolder = document.querySelector('#forget-folder');
const copyReport = document.querySelector('#copy-report');
const status = document.querySelector('#status');
const report = document.querySelector('#report');
const identities = document.querySelector('#identities');
const gameCards = Array.from(document.querySelectorAll('.game-card'));
const primaryWorld = document.querySelector('#primary-world');
const build = document.querySelector('#build');

let savedHandle = null;
let savedPermission = 'missing';
let diagnosticText = '';
let launcherState = createLauncherState();
const selectedFilesByGame = new Map();
let lastInventory = null;

build.textContent = BUILD_ID;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function formatBytes(value) {
  return new Intl.NumberFormat().format(value);
}

function renderIdentities() {
  const game = GAME_CATALOGUE[gameSelect.value];
  identities.replaceChildren();

  const summary = document.createElement('div');
  summary.className = 'identity-summary';
  summary.innerHTML = `<h3>${game.title}</h3>
    <dl><div><dt>Region</dt><dd>${game.region}</dd></div>
    <div><dt>Revision</dt><dd>${game.revision}</dd></div>
    ${game.set ? `<div><dt>MAME set</dt><dd>${game.set}</dd></div>` : ''}</dl>`;
  identities.append(summary);

  const notes = document.createElement('ul');
  notes.className = 'notes';
  for (const note of game.notes) {
    const item = document.createElement('li');
    item.textContent = note;
    notes.append(item);
  }
  identities.append(notes);

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Filename or member</th><th>Bytes</th><th>SHA-256</th><th>Input form</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const identity of [...game.accepted, ...(game.alternateForms ?? [])]) {
    const row = document.createElement('tr');
    for (const value of [
      identity.name ?? 'No filename identity; identify by size and digest',
      formatBytes(identity.size), identity.sha256, identity.inputForm,
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrap';
  wrapper.append(table);
  identities.append(wrapper);
}

function renderLauncher() {
  for (const card of gameCards) {
    const gameId = card.dataset.gameId;
    const enabled = launcherState.validated[gameId] === true;
    card.disabled = !enabled;
    card.setAttribute('aria-pressed', String(launcherState.primary === gameId));
    card.dataset.selected = launcherState.primary === gameId ? 'true' : 'false';
    card.querySelector('.card-state').textContent = enabled
      ? 'Identity validated'
      : (gameId === 'ddpdoj' ? 'ROM set required' : 'ROM required');
  }
  primaryWorld.textContent = launcherState.primary
    ? GAME_CATALOGUE[launcherState.primary].title
    : 'None selected';
}

function renderSelectedDiagnostic() {
  if (!lastInventory) {
    diagnosticText = '';
    report.textContent = 'Choose files or a folder to calculate local checksums.';
    copyReport.disabled = true;
    return;
  }
  const summary = lastInventory.games[gameSelect.value];
  diagnosticText = formatDiagnostic(summary);
  report.textContent = diagnosticText;
  copyReport.disabled = false;
}

function resetInventory() {
  lastInventory = null;
  selectedFilesByGame.clear();
  for (const gameId of GAME_IDS) {
    launcherState = applyValidation(launcherState, gameId, false);
  }
  renderLauncher();
  renderSelectedDiagnostic();
}

async function validate(files, source) {
  if (!files.length) {
    resetInventory();
    setStatus(`No files were found in ${source}. If a dropped folder was not exposed by this browser, use Choose a folder instead.`, 'bad');
    return;
  }
  const selection = describeSelection(files);
  setStatus(`Hashing ${selection.count} file${selection.count === 1 ? '' : 's'} once, then matching every game locally (${formatBytes(selection.totalBytes)} bytes)...`, 'working');
  report.textContent = '';
  copyReport.disabled = true;
  try {
    const inventory = await inspectInventory(files);
    lastInventory = inventory;
    for (const gameId of GAME_IDS) {
      const summary = inventory.games[gameId];
      launcherState = applyValidation(launcherState, gameId, summary.complete);
      if (summary.acceptedFiles.length) selectedFilesByGame.set(gameId, summary.acceptedFiles);
      else selectedFilesByGame.delete(gameId);
    }
    renderLauncher();
    renderSelectedDiagnostic();
    const unlocked = GAME_IDS.filter((gameId) => inventory.games[gameId].complete)
      .map((gameId) => GAME_CATALOGUE[gameId].title);
    setStatus(unlocked.length
      ? `Validated game cards: ${unlocked.join(', ')}. The identity selector changes the detailed report view; unrelated extras do not relock valid games.`
      : 'No complete game identity set was found. Select a game above to inspect its missing, duplicate, and extra-file diagnostics.',
    unlocked.length ? 'good' : 'bad');
  } catch (error) {
    resetInventory();
    setStatus(`Could not inspect the selection: ${error.message}`, 'bad');
  }
}

fileInput.addEventListener('change', () => validate(filesFromInput(fileInput), 'the file selection'));
folderInput.addEventListener('change', () => validate(filesFromInput(folderInput), 'the folder selection'));
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  fileInput.click();
});
for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dropZone.dataset.active = 'true';
  });
}
for (const eventName of ['dragleave', 'dragend']) {
  dropZone.addEventListener(eventName, () => { dropZone.dataset.active = 'false'; });
}
dropZone.addEventListener('drop', async (event) => {
  event.preventDefault();
  dropZone.dataset.active = 'false';
  try {
    await validate(await filesFromDataTransfer(event.dataTransfer), 'the dropped selection');
  } catch (error) {
    setStatus(`Could not read the dropped selection: ${error.message}. Use Choose a folder if folder dropping is unsupported.`, 'bad');
  }
});
for (const card of gameCards) {
  card.addEventListener('click', () => {
    launcherState = selectPrimary(launcherState, card.dataset.gameId);
    renderLauncher();
    setStatus(`${GAME_CATALOGUE[card.dataset.gameId].title} selected as the primary world. Launch and cross-game characters are not enabled yet.`, 'good');
  });
}
gameSelect.addEventListener('change', () => {
  renderIdentities();
  renderSelectedDiagnostic();
  if (lastInventory) {
    const summary = lastInventory.games[gameSelect.value];
    setStatus(summary.complete
      ? `${GAME_CATALOGUE[gameSelect.value].title} is complete and its card is unlocked.`
      : `${GAME_CATALOGUE[gameSelect.value].title} remains locked. See its selected diagnostic view below.`,
    summary.complete ? 'good' : 'bad');
  } else {
    setStatus('Ready for local validation. No files have been read.', '');
  }
});

chooseFolder.hidden = typeof globalThis.showDirectoryPicker !== 'function';
chooseFolder.addEventListener('click', async () => {
  try {
    const handle = await chooseDirectory();
    await saveDirectoryHandle(handle);
    savedHandle = handle;
    savedPermission = 'granted';
    updateSavedFolderControls();
    await validate(await collectDirectoryFiles(handle), 'the selected folder');
  } catch (error) {
    if (error.name === 'AbortError') {
      setStatus('Folder choice cancelled. No files were read.', '');
    } else {
      setStatus(`Folder access failed: ${error.message}`, 'bad');
    }
  }
});

function updateSavedFolderControls() {
  const exists = Boolean(savedHandle);
  reuseFolder.hidden = !exists;
  forgetFolder.hidden = !exists;
  reuseFolder.textContent = savedPermission === 'prompt'
    ? 'Allow and reuse saved folder'
    : 'Reuse saved folder';
}

reuseFolder.addEventListener('click', async () => {
  if (!savedHandle) return;
  try {
    let permission = await queryDirectoryPermission(savedHandle);
    if (permission === 'prompt') permission = await requestDirectoryPermission(savedHandle);
    savedPermission = permission;
    if (permission !== 'granted') {
      setStatus('The saved folder is not readable. Choose files or a folder again, or grant access when prompted.', 'bad');
      updateSavedFolderControls();
      return;
    }
    await validate(await collectDirectoryFiles(savedHandle), 'the saved folder');
  } catch (error) {
    setStatus(`The saved folder can no longer be used: ${error.message}`, 'bad');
  }
});

forgetFolder.addEventListener('click', async () => {
  try {
    await forgetDirectoryHandle();
  } catch (error) {
    setStatus(`Could not remove the saved handle: ${error.message}`, 'bad');
    return;
  }
  savedHandle = null;
  savedPermission = 'missing';
  updateSavedFolderControls();
  setStatus('Saved folder handle removed. ROM bytes were never stored.', 'good');
});

copyReport.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(diagnosticText);
    setStatus('Diagnostic copied. It contains names, sizes, and checksums, but no ROM bytes or local paths.', 'good');
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`, 'bad');
  }
});

async function discoverSavedFolder() {
  try {
    const saved = await reusableDirectory();
    savedHandle = saved.handle;
    savedPermission = saved.permission;
    updateSavedFolderControls();
    if (savedHandle) {
      setStatus(savedPermission === 'granted'
        ? 'A readable saved folder is available. Reuse it when ready.'
        : 'A saved folder exists. Reuse it to request permission from a click.', '');
    }
  } catch (error) {
    setStatus(`Saved-folder storage is unavailable: ${error.message}. File selection still works.`, '');
  }
}

renderIdentities();
renderLauncher();
updateSavedFolderControls();
discoverSavedFolder();
