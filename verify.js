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
  autoDays: '90'
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
    style: {},
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
  querySelectorAll: () => [],
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

vm.createContext(sandbox);
vm.runInContext(`${scriptMatch[1]}\nthis.__verifyApi = {
  SPECS, expectedProfitYen, simulateFastSession, DATA_KEY, loadAllData, loadScope,
  recordSessionOutcome, startSimulation, startAutoSimulation,
  resetDataCache: () => { dataCache = null; dataLoadError = null; },
  getCache: () => dataCache,
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
  assert(sparseV3.version === 3 && Array.isArray(sparseV3.scopes['eva15:18'].h), 'explicit save should migrate v2 to compact v3');

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

  const largeScope = { stats: { sessions: 36525, invest: 365250000, payout: 109575000 }, history: [], ranking: {} };
  for (let index = 0; index < 36525; index++) {
    largeScope.history.push({
      date: `unused-${index}`, day: index + 1, invest: 10000, payout: 3000, profit: 2000,
      spins: 2000, expected: -800, analyticalExpected: -800, deviation: 2800
    });
  }
  resetStorage();
  // Use the production serializer rather than estimating a hand-written JSON shape.
  sandbox.__largeData = { version: 3, scopes: { 'eva15:18': largeScope } };
  vm.runInContext('saveAllData(this.__largeData)', sandbox, { filename: 'storage-capacity.vm' });
  const largeBytes = Buffer.byteLength(storage.get(key), 'utf8');
  assert(largeBytes < 5 * 1024 * 1024, `36,525 sessions uses ${largeBytes} bytes`);
  assert(largeBytes <= 2.5 * 1024 * 1024, `36,525 sessions should retain substantial quota headroom (${largeBytes} bytes)`);

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
  console.log(`OK storage regression: compact 36,525-session payload=${largeBytes.toLocaleString()} bytes`);
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
  runStorageRegression().then(runProbabilityVerification).catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
} else {
  runProbabilityVerification();
}
