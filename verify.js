const fs = require('fs');
const vm = require('vm');

function printUsage() {
  console.log(`Usage: node verify.js [options]

Options:
  --machine=eva15,garo12  Verify one or more machine keys
  --trials=1000          Trials per batch
  --batches=10           Number of deterministic batches
  --spins=2000           Planned spins per session
  --rotation=18          Rotation per 1,000 yen
  --storage-regression   Run localStorage migration and failure-path regression checks
  --json                 Print machine results as JSON
  --help                 Show this help`);
}

function parsePositiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function parsePositiveInt(value, name) {
  const parsed = parsePositiveNumber(value, name);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

function parseOptions(argv) {
  const options = {
    machines: null,
    trials: 1000,
    batches: 10,
    totalSpins: 2000,
    rotation1k: 18,
    storageRegression: false,
    json: false
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--storage-regression') {
      options.storageRegression = true;
    } else if (arg.startsWith('--machine=')) {
      options.machines = arg.slice('--machine='.length).split(',').map(item => item.trim()).filter(Boolean);
    } else if (arg.startsWith('--trials=')) {
      options.trials = parsePositiveInt(arg.slice('--trials='.length), 'trials');
    } else if (arg.startsWith('--batches=')) {
      options.batches = parsePositiveInt(arg.slice('--batches='.length), 'batches');
    } else if (arg.startsWith('--spins=')) {
      options.totalSpins = parsePositiveInt(arg.slice('--spins='.length), 'spins');
    } else if (arg.startsWith('--rotation=')) {
      options.rotation1k = parsePositiveNumber(arg.slice('--rotation='.length), 'rotation');
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

const options = parseOptions(process.argv.slice(2));
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) {
  throw new Error('index.html の script ブロックが見つかりません');
}

const elementDefaults = {
  machine: 'eva15',
  rotation1k: '18',
  totalSpins: '2000',
  speed: '10',
  autoDays: '90',
  operatingCapital: '300000',
  workers: '0',
  dailyWage: '15000',
  exchangeBalls: '25',
  assumedHeldRatio: '50',
  replayLimit: '0'
};
const elements = new Map();

function createClassList() {
  return {
    add() {},
    remove() {},
    toggle() {}
  };
}

function createElement(id = '') {
  return {
    id,
    value: elementDefaults[id] || '',
    textContent: '',
    className: '',
    disabled: false,
    width: 640,
    height: 240,
    style: { setProperty() {} },
    dataset: {},
    classList: createClassList(),
    children: [],
    firstChild: null,
    appendChild(child) {
      this.children.push(child);
      this.firstChild = this.children[0] || null;
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter(item => item !== child);
      this.firstChild = this.children[0] || null;
      return child;
    },
    remove() {},
    replaceChildren(...children) {
      this.children = children;
      this.firstChild = children[0] || null;
    },
    addEventListener() {},
    closest() { return null; },
    getBoundingClientRect() {
      return { width: this.width, height: this.height };
    },
    getContext() {
      return {
        setTransform() {},
        clearRect() {},
        createLinearGradient() { return { addColorStop() {} }; },
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        fill() {},
        stroke() {},
        arc() {},
        fillText() {}
      };
    }
  };
}

const documentStub = {
  body: { dataset: {} },
  addEventListener() {},
  createElement: tag => createElement(tag),
  createDocumentFragment: () => createElement('fragment'),
  createTextNode: text => ({ textContent: text }),
  querySelectorAll: selector => selector === '.management-settings input'
    ? ['operatingCapital', 'workers', 'dailyWage', 'exchangeBalls', 'assumedHeldRatio', 'replayLimit'].map(id => documentStub.getElementById(id))
    : [],
  querySelector: selector => {
    if (!elements.has(selector)) elements.set(selector, createElement(selector));
    return elements.get(selector);
  },
  getElementById: id => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  }
};

const storage = new Map();
let storageSetItemCount = 0;
let storageFailWrites = false;
let stopAfterSleep = false;
const seededMath = Object.create(Math);
let seed = 20260611;
function setSeed(nextSeed) {
  seed = nextSeed >>> 0;
}
seededMath.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

const sandbox = {
  console,
  document: documentStub,
  window: {
    devicePixelRatio: 1,
    addEventListener() {}
  },
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => {
      storageSetItemCount++;
      if (storageFailWrites) throw new Error('injected storage quota failure');
      storage.set(key, value);
    },
    removeItem: key => storage.delete(key)
  },
  Math: seededMath,
  Date,
  setTimeout,
  clearTimeout,
  Promise,
  confirm: () => true
  ,getComputedStyle: () => ({ getPropertyValue: () => '' })
};
sandbox.window.document = documentStub;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.Math = seededMath;
sandbox.setTimeout = (callback, delay) => setTimeout(() => {
  if (stopAfterSleep && delay > 0 && sandbox.__verifyApi) sandbox.__verifyApi.requestStop();
  callback();
}, delay);

vm.createContext(sandbox);
vm.runInContext(`${scriptMatch[1]}\nthis.__verifyApi = {
  SPECS, expectedProfitYen, expectedProfitComponents, expectedGameplayProfitYen,
  gameplayBorderRotation, expectedOperatingProfitYen, normalizeBusinessSettings,
  aggregateOperatingProfit, finalOperatingEffect,
  simulateFastSession, simulateBusinessDay, DATA_KEY, loadAllData, loadScope,
  recordSessionOutcome, startSimulation, startAutoSimulation,
  resetDataCache: () => { dataCache = null; dataLoadError = null; },
  getCache: () => dataCache,
  requestStop: () => { shouldStop = true; },
  getRankingCandidate: () => globalRankingCandidate,
  getRunState: () => ({ isRunning, shouldStop, runMode })
};`, sandbox);

const { SPECS, expectedProfitYen, simulateFastSession } = sandbox.__verifyApi;
const machineKeys = options.machines || Object.keys(SPECS);
const unknownMachineKeys = machineKeys.filter(machineKey => !SPECS[machineKey]);
if (unknownMachineKeys.length > 0) {
  throw new Error(`Unknown machine key(s): ${unknownMachineKeys.join(', ')}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Storage regression: ${message}`);
}

function resultFixture(overrides = {}) {
  return {
    machineKey: 'eva15', rotations: 2000, plannedSpins: 2000,
    finalBalls: 3000, totalInvestment: 10000, hitCount: 1,
    maxChain: 3, maxPayout: 3200, maxDrought: 200, finalProfit: 2000,
    ...overrides
  };
}

function resetStorage(serialized = null) {
  storage.clear();
  if (serialized !== null) storage.set(sandbox.__verifyApi.DATA_KEY, serialized);
  storageSetItemCount = 0;
  storageFailWrites = false;
  sandbox.__verifyApi.resetDataCache();
}

async function runStorageRegression() {
  const api = sandbox.__verifyApi;
  const key = api.DATA_KEY;
  const sparseV2 = JSON.stringify({
    version: 2,
    scopes: { 'eva15:18': { stats: { sessions: 1, invest: 1000, payout: 500 }, history: [
      { date: '2026-01-01', day: 1, invest: 1000, payout: 500, profit: 1000 }
    ], ranking: {} } }
  });
  resetStorage(sparseV2);
  const sparseLoaded = api.loadScope('eva15:18');
  assert(storageSetItemCount === 0 && storage.get(key) === sparseV2, 'v2 load must not write');
  assert(sparseLoaded.history[0].spins === 2000, 'sparse v2 should receive default spins');
  assert(Number.isFinite(sparseLoaded.history[0].expected), 'sparse v2 should receive expected value');
  api.recordSessionOutcome(resultFixture(), 'eva15:18', { refresh: false });
  const sparseV3 = JSON.parse(storage.get(key));
  assert(sparseV3.version === 4 && Array.isArray(sparseV3.scopes['eva15:18'].h), 'explicit save should migrate v2 to compact v4');

  const fullSession = {
    date: '2026-01-01', day: 1, invest: 12000, payout: 3500, profit: 2000,
    spins: 2400, expected: 1234, analyticalExpected: 1200, deviation: 766
  };
  resetStorage(JSON.stringify({ version: 2, scopes: {
    'eva15:18': { stats: { sessions: 1, invest: 12000, payout: 3500 }, history: [fullSession], ranking: {} }
  } }));
  const loadedFull = api.loadScope('eva15:18').history[0];
  assert(JSON.stringify(loadedFull) === JSON.stringify(fullSession), 'full v2 observable history must load without loss');
  api.recordSessionOutcome(resultFixture(), 'eva15:18', { refresh: false });
  const fullV3 = storage.get(key);
  resetStorage(fullV3);
  const reloadedFull = api.loadScope('eva15:18').history[0];
  assert(JSON.stringify(reloadedFull) === JSON.stringify(fullSession), 'v3 reload must expand the existing object contract');

  const largeScope = { stats: { sessions: 36525, invest: 365250000, payout: 109575000, profit: 73050000 }, history: [], ranking: {} };
  for (let index = 0; index < 36525; index++) {
    largeScope.history.push({
      date: `unused-${index}`, day: index + 1, invest: 10000, payout: 3000, profit: 2000,
      spins: 2000, expected: -800, analyticalExpected: -800, deviation: 2800,
      profileId: '1.bko.6y.1e.rs', gameplayProfit: 17000, wage: 15000, operatingProfit: 2000,
      capital: 300000, actualHeldRatio: 0.5, endReason: '完走', dayOffset: index
    });
  }
  resetStorage();
  // Use the production serializer rather than estimating a hand-written JSON shape.
  sandbox.__largeData = {
    version: 4, scopes: { 'eva15:18': largeScope },
    profiles: {}, businessState: { capital: 300000, nextDay: 36525 }
  };
  vm.runInContext('saveAllData(this.__largeData)', sandbox, { filename: 'storage-capacity.vm' });
  const largeBytes = Buffer.byteLength(storage.get(key), 'utf8');
  assert(largeBytes < 5 * 1024 * 1024, `36,525 sessions uses ${largeBytes} bytes`);
  assert(largeBytes <= 2.5 * 1024 * 1024, `36,525 sessions should retain substantial quota headroom (${largeBytes} bytes)`);
  sandbox.__largeData.scopes['eva15:18'].history.forEach((session, index) => {
    const profileIndex = Math.floor(index / 31);
    session.profileId = `${(profileIndex % 3).toString(36)}.${(15000 + profileIndex).toString(36)}.${(250 + profileIndex % 4).toString(36)}.1e.${(profileIndex % 2 ? 1000 : 0).toString(36)}`;
  });
  vm.runInContext('saveAllData(this.__largeData)', sandbox, { filename: 'storage-capacity-monthly-profiles.vm' });
  const monthlyProfileBytes = Buffer.byteLength(storage.get(key), 'utf8');
  assert(monthlyProfileBytes <= 2.5 * 1024 * 1024, `36,525 sessions with 1,200 inline monthly profiles should fit (${monthlyProfileBytes} bytes)`);
  sandbox.__largeData.scopes['eva15:18'].history.forEach((session, index) => {
    session.profileId = `${(index % 21).toString(36)}.${(15000 + index).toString(36)}.${(250 + index % 100).toString(36)}.${(index % 101).toString(36)}.${index.toString(36)}`;
  });
  vm.runInContext('saveAllData(this.__largeData)', sandbox, { filename: 'storage-capacity-unique-profiles.vm' });
  const uniqueProfileBytes = Buffer.byteLength(storage.get(key), 'utf8');
  assert(uniqueProfileBytes <= 2.5 * 1024 * 1024, `36,525 sessions with all-inline unique profiles should fit (${uniqueProfileBytes} bytes)`);

  resetStorage(JSON.stringify({ version: 3, scopes: {} }));
  api.loadAllData();
  storageSetItemCount = 0;
  api.recordSessionOutcome(resultFixture(), 'eva15:18', { refresh: false });
  const afterSuccess = storage.get(key);
  const cachedAfterSuccess = JSON.stringify(api.getCache());
  assert(storageSetItemCount === 1, 'a completed session must call setItem exactly once');
  const savedScope = api.loadScope('eva15:18');
  assert(savedScope.stats.sessions === 1 && savedScope.history.length === 1 && savedScope.ranking.maxChain === 3, 'one save must update stats, history, and ranking together');

  storageFailWrites = true;
  let directFailure = false;
  try { api.recordSessionOutcome(resultFixture({ finalProfit: -1000 }), 'eva15:18', { refresh: false }); } catch { directFailure = true; }
  assert(directFailure && storage.get(key) === afterSuccess, 'failed setItem must preserve persisted bytes');
  assert(JSON.stringify(api.getCache()) === cachedAfterSuccess, 'failed setItem must preserve cached data');

  resetStorage(afterSuccess);
  api.loadAllData();
  const beforeRunBytes = storage.get(key);
  const beforeRunCache = JSON.stringify(api.getCache());
  storageFailWrites = true;
  documentStub.getElementById('totalSpins').value = '1';
  documentStub.getElementById('speed').value = '10';
  await api.startSimulation();
  assert(storage.get(key) === beforeRunBytes && JSON.stringify(api.getCache()) === beforeRunCache, 'single-run storage failure must keep bytes and cache unchanged');
  assert(api.getRunState().isRunning === false && documentStub.getElementById('startBtn').disabled === false, 'single-run failure must recover controls');
  assert(api.getRankingCandidate() === null && documentStub.getElementById('globalRankingResultBtn').disabled, 'single-run storage failure must not leave a ranking candidate');

  resetStorage(afterSuccess);
  api.loadAllData();
  const beforeAutoBytes = storage.get(key);
  const beforeAutoCache = JSON.stringify(api.getCache());
  storageFailWrites = true;
  documentStub.getElementById('autoDays').value = '2';
  await api.startAutoSimulation();
  assert(storage.get(key) === beforeAutoBytes && JSON.stringify(api.getCache()) === beforeAutoCache, 'auto storage failure must keep bytes and cache unchanged');
  assert(api.loadScope('eva15:18').history.length === 1, 'failed auto day must be absent');
  assert(api.getRunState().isRunning === false && documentStub.getElementById('autoRunBtn').disabled === false, 'auto failure must stop and recover controls');
  assert(['operatingCapital', 'workers', 'dailyWage', 'exchangeBalls', 'assumedHeldRatio', 'replayLimit'].every(id => !documentStub.getElementById(id).disabled), 'auto storage failure must restore every management input');

  resetStorage(afterSuccess);
  api.loadAllData();
  documentStub.getElementById('totalSpins').value = '1';
  documentStub.getElementById('speed').value = '10';
  documentStub.getElementById('workers').value = '1';
  documentStub.getElementById('operatingCapital').value = '300000';
  documentStub.getElementById('replayLimit').value = '100';
  setSeed(20260814);
  await api.startSimulation();
  const singleBusinessHistory = api.loadScope('eva15:18').history;
  const singleBusinessEntry = singleBusinessHistory[singleBusinessHistory.length - 1];
  assert(singleBusinessHistory.length === 2 && singleBusinessEntry.wage === 15000, 'single animated day must save one aggregate owner-plus-worker business entry');
  assert(singleBusinessEntry.endReason === '完走' && singleBusinessEntry.actualHeldRatio >= 0, 'single animated day must retain its shared-funding outcome');
  assert(api.getRunState().isRunning === false && documentStub.getElementById('startBtn').disabled === false, 'single business success must restore controls');
  assert(documentStub.getElementById('profitDisplay').textContent === `${singleBusinessEntry.gameplayProfit >= 0 ? '+' : ''}${singleBusinessEntry.gameplayProfit.toLocaleString()}`, 'business final display must use exchange-adjusted gameplay profit');

  resetStorage(afterSuccess);
  api.loadAllData();
  documentStub.getElementById('workers').value = '1';
  documentStub.getElementById('speed').value = '1';
  documentStub.getElementById('totalSpins').value = '2000';
  setSeed(20260815);
  stopAfterSleep = true;
  const stoppedRun = api.startSimulation();
  assert(['operatingCapital', 'workers', 'dailyWage', 'exchangeBalls', 'assumedHeldRatio', 'replayLimit'].every(id => documentStub.getElementById(id).disabled), 'single run must disable every management input');
  await stoppedRun;
  stopAfterSleep = false;
  const stoppedEntry = api.loadScope('eva15:18').history.at(-1);
  assert(stoppedEntry.endReason === '手動停止' && stoppedEntry.spins <= 2000, 'manual stop must save only the owner partial day without later terminal payouts or workers');
  assert(['operatingCapital', 'workers', 'dailyWage', 'exchangeBalls', 'assumedHeldRatio', 'replayLimit'].every(id => !documentStub.getElementById(id).disabled), 'single run must restore every management input after stop');

  resetStorage(afterSuccess);
  api.loadAllData();
  documentStub.getElementById('machine').value = 'eva17';
  documentStub.getElementById('workers').value = '0';
  documentStub.getElementById('totalSpins').value = '2000';
  documentStub.getElementById('speed').value = '1';
  documentStub.getElementById('log').replaceChildren();
  setSeed(27);
  stopAfterSleep = true;
  await api.startSimulation();
  stopAfterSleep = false;
  const tenthStopEntry = api.loadScope('eva17:18').history.at(-1);
  const tenthStopLogs = documentStub.getElementById('log').children.map(child => child.textContent).join('\n');
  assert(tenthStopEntry.endReason === '手動停止' && tenthStopEntry.payout <= 250 && !tenthStopLogs.includes('チャージ'), 'stop after the tenth-spin display must prevent the pending charge draw, payout, and log');
  console.log(`OK storage regression: 1 profile=${largeBytes.toLocaleString()} bytes; 1,200 profiles=${monthlyProfileBytes.toLocaleString()} bytes; unique=${uniqueProfileBytes.toLocaleString()} bytes`);
}

function runBusinessEconomyRegression() {
  const api = sandbox.__verifyApi;
  const base = { capital: 300000, workers: 0, dailyWage: 15000, exchangeBalls: 25, assumedHeldRatio: 0.5, replayLimit: 0 };
  const normalized = api.normalizeBusinessSettings(base);
  assert(normalized.workers === 0 && normalized.capital === 300000, 'business defaults must preserve zero workers and 300,000 yen capital');
  const rounded = api.normalizeBusinessSettings({ ...base, workers: 99, exchangeBalls: 28.24, assumedHeldRatio: 0.506 });
  assert(rounded.workers === 20 && rounded.exchangeBalls === 28.2 && rounded.assumedHeldRatio === 0.51, 'business settings must normalize to UI precision before inline profile serialization');

  const noStart = api.simulateBusinessDay('eva15', 2000, 18, { ...base, workers: 2, dailyWage: 15000, capital: 20000 });
  assert(noStart.endReason === '日当不足' && noStart.seats.length === 0 && noStart.capital === 20000, 'insufficient opening wages must leave the day and capital unchanged');

  setSeed(20260813);
  const staffed = api.simulateBusinessDay('eva15', 1, 18, { ...base, workers: 1, capital: 300000 });
  assert(staffed.seats.length === 2 && staffed.wage === 15000 && staffed.rotations === 2, 'one business day must aggregate the owner and each worker seat after opening wage deduction');

  setSeed(20260812);
  const partial = api.simulateBusinessDay('eva15', 2000, 18, { ...base, capital: 1000, replayLimit: 0 });
  assert(partial.endReason === '資金不足' && partial.rotations < 2000, 'a missing thousand-yen purchase must save a partial day without counting that spin');

  setSeed(20260812);
  const replay = api.simulateBusinessDay('eva15', 2000, 18, { ...base, capital: 1000, replayLimit: 1000 });
  assert(replay.replayUsed > 0 && replay.replayUsed <= 1000, 'replay use must be bounded by the daily limit');
  assert(replay.actualHeldRatio >= 0 && replay.actualHeldRatio <= 1, 'actual held-ball ratio must remain a ratio');

  const funding = { cashRemaining: 1000, replayRemaining: 100 };
  const direct = api.simulateFastSession('eva15', 1, 18, funding);
  assert(direct.replayUsed > 0 && direct.replayUsed <= 100, 'saved balls must be used only at a shortage before cash');
  assert(api.normalizeBusinessSettings({ ...base, exchangeBalls: 20 }).exchangeBalls === 25, 'exchange balls below 25 must be clamped to prevent arbitrage');

  const equal = api.expectedGameplayProfitYen('eva15', 18, 2000, base);
  const nonEqual = api.expectedGameplayProfitYen('eva15', 18, 2000, { ...base, exchangeBalls: 28, assumedHeldRatio: 1 });
  assert(equal !== nonEqual, 'non-equivalent exchange and held-ball ratio must alter theoretical gameplay profit');
  const border = api.gameplayBorderRotation('eva15', 2000, { ...base, exchangeBalls: 28, assumedHeldRatio: 0.5 });
  assert(Number.isFinite(border) && border > 0, 'gameplay border must be a positive finite rotation rate');
  assert(api.aggregateOperatingProfit([{ finalProfit: 1000, operatingProfit: -200 }, { finalProfit: -500, operatingProfit: 300 }]) === 100, 'AUTO summaries must aggregate operating profit rather than gameplay profit');
  assert(api.finalOperatingEffect({ finalProfit: 10000, operatingProfit: -5000 }).type === 'final-minus', 'single final effect must follow operating profit rather than gameplay profit');

  resetStorage(JSON.stringify({ version: 3, scopes: {} }));
  api.loadAllData();
  storageSetItemCount = 0;
  const storedDay = api.simulateBusinessDay('eva15', 1, 18, base);
  api.recordSessionOutcome(storedDay, 'eva15:18', { refresh: false });
  const saved = JSON.parse(storage.get(api.DATA_KEY));
  assert(saved.version === 4 && typeof saved.scopes['eva15:18'].h[0][5] === 'string', 'v4 save must persist an inline reversible settings key');
  assert(storageSetItemCount === 1, 'business day save must use one localStorage write');
  const savedBytes = storage.get(api.DATA_KEY);
  resetStorage(savedBytes);
  const reloaded = api.loadScope('eva15:18').history[0];
  assert(reloaded.profileId && reloaded.operatingProfit === storedDay.operatingProfit && reloaded.capital === storedDay.capital && reloaded.dayOffset === 0, 'v4 roundtrip must retain profile-linked operating results, capital, and global day offset');
  resetStorage(JSON.stringify({ version: 4, profiles: { p0: [1, 15000, 25, 0.5, 1000] }, businessState: { capital: 300000, nextDay: 1 }, scopes: {
    'eva15:18': { s: { sessions: 1, invest: 1000, payout: 500, profit: 2000 }, r: {}, h: [[1000, 500, 2000, 1, 1900, 1900, 100, 'p0', 17000, 15000, 2000, 301000, 500, '完走', 0]] }
  } }));
  const legacyV4 = api.loadScope('eva15:18').history[0];
  api.recordSessionOutcome(storedDay, 'eva15:18', { refresh: false });
  resetStorage(storage.get(api.DATA_KEY));
  const legacyReloaded = api.loadScope('eva15:18').history[0];
  assert(legacyReloaded.wage === legacyV4.wage && legacyReloaded.gameplayProfit === legacyV4.gameplayProfit && legacyReloaded.capital === legacyV4.capital, 'legacy dictionary profiles must inline-migrate without losing observable values');
  console.log('OK business economy regression: funding, replay, exchange, border, v4 persistence');
}

function runProbabilityVerification() {
  let failed = false;
  const results = [];
  for (const machineKey of machineKeys) {
    let totalProfit = 0;
    for (let batch = 0; batch < options.batches; batch++) {
      const machineSeed = 20260611
        + machineKey.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) * 1009
        + batch * 104729;
      setSeed(machineSeed);
      for (let i = 0; i < options.trials; i++) totalProfit += simulateFastSession(machineKey, options.totalSpins, options.rotation1k).finalProfit;
    }
    const actual = Math.round(totalProfit / (options.trials * options.batches));
    const expected = expectedProfitYen(machineKey, options.rotation1k, options.totalSpins);
    const diff = actual - expected;
    const tolerance = Math.max(Math.abs(expected) * 0.05, 1500);
    const ok = Math.abs(diff) <= tolerance;
    failed = failed || !ok;
    const result = { machineKey, expected, actual, diff, tolerance: Math.round(tolerance), trials: options.trials, batches: options.batches, ok };
    results.push(result);
    if (!options.json) console.log(`${ok ? 'OK' : 'NG'} ${machineKey}: expected=${expected.toLocaleString()}円 actual=${actual.toLocaleString()}円 diff=${diff.toLocaleString()}円 tolerance=±${Math.round(tolerance).toLocaleString()}円 trials=${options.trials}x${options.batches}`);
  }
  if (options.json) console.log(JSON.stringify({ ok: !failed, options, results }, null, 2));
  if (failed) process.exitCode = 1;
}

if (options.storageRegression) {
  runStorageRegression().then(() => { runBusinessEconomyRegression(); runProbabilityVerification(); }).catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
} else {
  runBusinessEconomyRegression();
  runProbabilityVerification();
}
