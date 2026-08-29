import { expandArchives } from './archives.js';
import { ARCHIVE_LIMITS } from './archive-policy.js';
import { BUILD_ID } from './buildid.js';
import { GAME_CATALOGUE, GAME_IDS } from './catalogue.js';
import { inspectInventory, formatDiagnostic } from './diagnostics.js';
import {
  chooseDirectory, collectDirectoryFiles, dataTransferIncludesDirectory,
  filesFromDataTransfer, filesFromInput, describeSelection, searchRomCandidates,
} from './files.js';
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
const launchGame = document.querySelector('#launch-game');
const bootStatus = document.querySelector('#boot-status');
const gameScreen = document.querySelector('#game-screen');
const build = document.querySelector('#build');

const ROM_INPUT_SIZES = new Set(Object.values(GAME_CATALOGUE).flatMap((game) => [
  ...game.accepted, ...(game.alternateForms ?? []),
]).map((identity) => identity.size));

let savedHandle = null;
let savedPermission = 'missing';
let diagnosticText = '';
let launcherState = createLauncherState();
const preparedByGame = new Map();
let lastInventory = null;
let activeRuntime = null;
let launching = false;
let intakeGeneration = 0;
let intakeController = null;

function beginIntake() {
  intakeController?.abort();
  const intake = {
    generation: ++intakeGeneration,
    controller: new AbortController(),
  };
  intakeController = intake.controller;
  return intake;
}

function intakeIsCurrent(intake) {
  return intake.generation === intakeGeneration && !intake.controller.signal.aborted;
}

function finishIntake(intake) {
  if (intakeIsCurrent(intake)) intakeController = null;
}

async function localRuntimeClass(gameId) {
  if (gameId === 'batman') return (await import('./batman-local.js')).LocalBatmanRuntime;
  if (gameId === 'gradius') return (await import('./gradius-local.js')).LocalGradiusRuntime;
  if (gameId === 'ddpdoj') return (await import('./ddpdoj-local.js')).LocalDdpdojRuntime;
  throw new RangeError(`Unknown local game ${gameId}.`);
}

function preparedForGame(gameId) {
  const prepared = preparedByGame.get(gameId);
  return prepared && typeof prepared.then !== 'function' ? prepared : null;
}

function releaseInventoryBytes(inventory) {
  for (const item of inventory.items ?? []) delete item.bytes;
  for (const gameId of GAME_IDS) {
    for (const input of inventory.games[gameId].acceptedInputs) delete input.bytes;
  }
}

async function prepareValidatedGame(gameId, summary, intake) {
  const title = GAME_CATALOGUE[gameId].title;
  const preparation = (async () => {
    const Runtime = await localRuntimeClass(gameId);
    if (!intakeIsCurrent(intake)) return null;
    return Runtime.prepare(summary, {
      signal: intake.controller.signal,
      onStatus: (message) => {
        if (intakeIsCurrent(intake)) setStatus(message, 'working');
      },
    });
  })();
  preparedByGame.set(gameId, preparation);
  renderLauncher();
  setStatus(`Preparing ${title} for immediate local play...`, 'working');
  const prepared = await preparation;
  if (!intakeIsCurrent(intake) || preparedByGame.get(gameId) !== preparation) return null;
  if (!prepared) throw new Error(`${title} preparation ended without runtime data.`);
  preparedByGame.set(gameId, prepared);
  launcherState = applyValidation(launcherState, gameId, true);
  renderLauncher();
  return prepared;
}

build.textContent = BUILD_ID;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function stopRuntime() {
  activeRuntime?.stop();
  activeRuntime = null;
  gameScreen.hidden = true;
}

function setBootStatus(message = '') {
  bootStatus.textContent = message;
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

  const requirements = document.createElement('p');
  requirements.className = 'identity-requirements';
  requirements.textContent = game.requirements;
  identities.append(requirements);

  const notes = document.createElement('ul');
  notes.className = 'notes';
  for (const note of game.notes) {
    const item = document.createElement('li');
    item.textContent = note;
    notes.append(item);
  }
  identities.append(notes);

  const appendIdentityTable = (heading, entries) => {
    const title = document.createElement('h4');
    title.textContent = heading;
    identities.append(title);
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Filename or member</th><th>Bytes</th><th>SHA-256</th><th>Input form</th></tr></thead>';
    const body = document.createElement('tbody');
    for (const identity of entries) {
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
  };
  appendIdentityTable(game.accepted.length === 1 ? 'Required ROM' : 'Required complete ROM set',
    game.accepted);
  if (game.alternateForms?.length) {
    appendIdentityTable('Accepted replacement input', game.alternateForms);
  }
}

function renderLauncher() {
  for (const card of gameCards) {
    const gameId = card.dataset.gameId;
    const enabled = launcherState.validated[gameId] === true;
    const cached = preparedByGame.get(gameId);
    const preparing = cached && typeof cached.then === 'function';
    card.disabled = !enabled;
    card.setAttribute('aria-pressed', String(launcherState.primary === gameId));
    card.dataset.selected = launcherState.primary === gameId ? 'true' : 'false';
    card.querySelector('.card-state').textContent = enabled
      ? 'Identity validated'
      : (preparing ? 'Preparing local game data'
        : (gameId === 'ddpdoj' ? 'ROM set required' : 'ROM required'));
  }
  primaryWorld.textContent = launcherState.primary
    ? GAME_CATALOGUE[launcherState.primary].title
    : 'None selected';
  const canLaunch = ['batman', 'gradius', 'ddpdoj'].includes(launcherState.primary)
    && launcherState.validated[launcherState.primary] === true;
  const selectedTitle = launcherState.primary
    ? GAME_CATALOGUE[launcherState.primary].title : null;
  launchGame.disabled = launching || !canLaunch;
  launchGame.textContent = launching
    ? `Preparing local ${selectedTitle}...`
    : (canLaunch
      ? `Launch ${selectedTitle} from local ROM${launcherState.primary === 'ddpdoj' ? 's' : ''}`
      : (launcherState.primary
        ? `${selectedTitle} launch path pending`
        : 'Choose an unlocked game'));
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
  stopRuntime();
  setBootStatus('');
  lastInventory = null;
  preparedByGame.clear();
  for (const gameId of GAME_IDS) {
    launcherState = applyValidation(launcherState, gameId, false);
  }
  renderLauncher();
  renderSelectedDiagnostic();
}

async function validate(files, source, options = {}) {
  const intake = options.intake ?? beginIntake();
  if (!intakeIsCurrent(intake)) return;
  const searched = options.searchFolder ? describeSelection(files) : null;
  const discovery = options.searchFolder ? searchRomCandidates(files, {
    rawSizes: ROM_INPUT_SIZES,
    maxArchiveBytes: ARCHIVE_LIMITS.maxCompressedArchive,
  }) : null;
  if (discovery) files = discovery.files;
  const searchNote = discovery
    ? ` Searched ${searched.count} folder file${searched.count === 1 ? '' : 's'} and ignored ${discovery.ignored} non-candidate${discovery.ignored === 1 ? '' : 's'} without opening them.`
    : '';
  let archiveMemberNote = '';
  if (!files.length) {
    resetInventory();
    setStatus(discovery
      ? `Searched ${searched.count} file${searched.count === 1 ? '' : 's'} in ${source}. No file had an exact supported ROM byte size or a supported ZIP/7z name within ${formatBytes(ARCHIVE_LIMITS.maxCompressedArchive)} bytes. Non-candidates were not opened.`
      : `No files were found in ${source}. If a dropped folder was not exposed by this browser, use Choose a folder instead.`, 'bad');
    finishIntake(intake);
    return;
  }
  const selection = describeSelection(files);
  stopRuntime();
  setBootStatus('');
  lastInventory = null;
  preparedByGame.clear();
  for (const gameId of GAME_IDS) {
    launcherState = applyValidation(launcherState, gameId, false);
  }
  renderLauncher();
  setStatus(discovery
    ? `Found ${selection.count} ROM/archive candidate${selection.count === 1 ? '' : 's'} in ${searched.count} folder file${searched.count === 1 ? '' : 's'}. Checking only those candidates (${formatBytes(selection.totalBytes)} bytes)...`
    : `Checking ${selection.count} local file${selection.count === 1 ? '' : 's'} (${formatBytes(selection.totalBytes)} bytes)...`, 'working');
  report.textContent = '';
  copyReport.disabled = true;
  try {
    const expanded = await expandArchives(files, {
      archiveProbe: options.archiveProbe,
      skipInvalidArchives: Boolean(discovery),
      signal: intake.controller.signal,
      onProgress: (message) => {
        if (intakeIsCurrent(intake)) setStatus(message, 'working');
      },
    });
    if (!intakeIsCurrent(intake)) return;
    if (discovery) {
      const memberSearch = searchRomCandidates(expanded.files, {
        rawSizes: ROM_INPUT_SIZES,
        maxArchiveBytes: ARCHIVE_LIMITS.maxCompressedArchive,
      });
      expanded.files = memberSearch.files;
      archiveMemberNote = memberSearch.ignored
        ? ` Ignored ${memberSearch.ignored} non-ROM archive member${memberSearch.ignored === 1 ? '' : 's'} before hashing.`
        : '';
    }
    const ready = describeSelection(expanded.files);
    setStatus(`Hashing ${ready.count} ROM file${ready.count === 1 ? '' : 's'} once, then matching every game locally (${formatBytes(ready.totalBytes)} bytes)...`, 'working');
    const inventory = await inspectInventory(expanded.files, {
      signal: intake.controller.signal,
    });
    if (!intakeIsCurrent(intake)) return;
    lastInventory = inventory;
    renderSelectedDiagnostic();
    const complete = GAME_IDS.filter((gameId) => inventory.games[gameId].complete);
    for (const gameId of complete) {
      await prepareValidatedGame(gameId, inventory.games[gameId], intake);
      if (!intakeIsCurrent(intake)) return;
    }
    releaseInventoryBytes(inventory);
    const unlocked = complete.map((gameId) => GAME_CATALOGUE[gameId].title);
    const archiveNote = expanded.archives
      ? ` Read ${expanded.members} member${expanded.members === 1 ? '' : 's'} from ${expanded.archives} local archive${expanded.archives === 1 ? '' : 's'}.`
      : '';
    const skippedArchiveNote = expanded.skippedArchives
      ? ` Skipped ${expanded.skippedArchives} invalid archive candidate${expanded.skippedArchives === 1 ? '' : 's'}.`
      : '';
    setStatus(unlocked.length
      ? `Validated game cards: ${unlocked.join(', ')}.${archiveNote}${skippedArchiveNote}${searchNote}${archiveMemberNote} Unrelated extras do not relock valid games.`
      : `No complete game identity set was found.${archiveNote}${skippedArchiveNote}${searchNote}${archiveMemberNote} Open Required ROMs and verification details to inspect missing, duplicate, and extra-file diagnostics.`,
    unlocked.length ? 'good' : 'bad');
  } catch (error) {
    if (!intakeIsCurrent(intake)) return;
    resetInventory();
    setStatus(`Could not inspect the selection: ${error.message}`, 'bad');
  } finally {
    finishIntake(intake);
  }
}

fileInput.addEventListener('change', () => validate(filesFromInput(fileInput), 'the file selection'));
folderInput.addEventListener('change', () => validate(filesFromInput(folderInput),
  'the folder selection', { archiveProbe: 'declared-only', searchFolder: true }));
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
  const intake = beginIntake();
  const searchFolder = dataTransferIncludesDirectory(event.dataTransfer);
  try {
    const files = await filesFromDataTransfer(event.dataTransfer);
    if (!intakeIsCurrent(intake)) return;
    await validate(files, 'the dropped selection', searchFolder ? {
      archiveProbe: 'declared-only', searchFolder: true, intake,
    } : { intake });
  } catch (error) {
    if (!intakeIsCurrent(intake)) return;
    finishIntake(intake);
    setStatus(`Could not read the dropped selection: ${error.message}. Use Choose a folder if folder dropping is unsupported.`, 'bad');
  }
});
for (const card of gameCards) {
  card.addEventListener('click', () => {
    if (activeRuntime && card.dataset.gameId !== launcherState.primary) {
      stopRuntime();
      setBootStatus('Local game stopped because the primary world changed.');
    }
    launcherState = selectPrimary(launcherState, card.dataset.gameId);
    const gameId = card.dataset.gameId;
    const ready = ['batman', 'gradius', 'ddpdoj'].includes(gameId);
    renderLauncher();
    setStatus(ready
      ? `${GAME_CATALOGUE[gameId].title} selected as the primary world. Its validated local input is ready to launch.`
      : `${GAME_CATALOGUE[gameId].title} selected as the primary world. Its local launch path is still being connected.`, 'good');
  });
}
launchGame.addEventListener('click', async () => {
  const gameId = launcherState.primary;
  const prepared = preparedForGame(gameId);
  if (launching || !['batman', 'gradius', 'ddpdoj'].includes(gameId)
      || !lastInventory?.games[gameId].complete || !prepared) return;
  const title = GAME_CATALOGUE[gameId].title;
  stopRuntime();
  launching = true;
  renderLauncher();
  setBootStatus(`Opening ${title} game options...`);
  try {
    const { openLocalShell } = await import('./local-shell.js');
    activeRuntime = openLocalShell({
      gameId,
      summary: lastInventory.games[gameId],
      prepared,
      title,
      opener: launchGame,
      onStatus: setBootStatus,
      onClose: () => { activeRuntime = null; },
    });
    setBootStatus(`${title} is ready. Choose Original, a preset, or customize the game.`);
  } catch (error) {
    stopRuntime();
    setBootStatus(`${title} options could not open: ${error.message}`);
  } finally {
    launching = false;
    renderLauncher();
  }
});

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
  let intake = null;
  try {
    const handle = await chooseDirectory();
    intake = beginIntake();
    await saveDirectoryHandle(handle);
    if (!intakeIsCurrent(intake)) return;
    savedHandle = handle;
    savedPermission = 'granted';
    updateSavedFolderControls();
    const files = await collectDirectoryFiles(handle);
    if (!intakeIsCurrent(intake)) return;
    await validate(files, 'the selected folder', {
      archiveProbe: 'declared-only', searchFolder: true, intake,
    });
  } catch (error) {
    if (intake && !intakeIsCurrent(intake)) return;
    if (intake) finishIntake(intake);
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
  let intake = null;
  try {
    let permission = await queryDirectoryPermission(savedHandle);
    if (permission === 'prompt') permission = await requestDirectoryPermission(savedHandle);
    savedPermission = permission;
    if (permission !== 'granted') {
      setStatus('The saved folder is not readable. Choose files or a folder again, or grant access when prompted.', 'bad');
      updateSavedFolderControls();
      return;
    }
    intake = beginIntake();
    const files = await collectDirectoryFiles(savedHandle);
    if (!intakeIsCurrent(intake)) return;
    await validate(files, 'the saved folder', {
      archiveProbe: 'declared-only', searchFolder: true, intake,
    });
  } catch (error) {
    if (intake && !intakeIsCurrent(intake)) return;
    if (intake) finishIntake(intake);
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
