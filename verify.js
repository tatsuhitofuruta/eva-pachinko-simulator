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
    json: false
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--json') {
      options.json = true;
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
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  },
  Math: seededMath,
  Date,
  setTimeout,
  clearTimeout,
  Promise,
  confirm: () => true
};
sandbox.window.document = documentStub;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.Math = seededMath;

vm.createContext(sandbox);
vm.runInContext(`${scriptMatch[1]}\nthis.__verifyApi = { SPECS, expectedProfitYen, simulateFastSession };`, sandbox);

const { SPECS, expectedProfitYen, simulateFastSession } = sandbox.__verifyApi;
const machineKeys = options.machines || Object.keys(SPECS);
const unknownMachineKeys = machineKeys.filter(machineKey => !SPECS[machineKey]);
if (unknownMachineKeys.length > 0) {
  throw new Error(`Unknown machine key(s): ${unknownMachineKeys.join(', ')}`);
}

let failed = false;
const results = [];
for (const machineKey of machineKeys) {
  let totalProfit = 0;
  for (let batch = 0; batch < options.batches; batch++) {
    const machineSeed = 20260611
      + machineKey.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) * 1009
      + batch * 104729;
    setSeed(machineSeed);
    for (let i = 0; i < options.trials; i++) {
      totalProfit += simulateFastSession(machineKey, options.totalSpins, options.rotation1k).finalProfit;
    }
  }
  const actual = Math.round(totalProfit / (options.trials * options.batches));
  const expected = expectedProfitYen(machineKey, options.rotation1k, options.totalSpins);
  const diff = actual - expected;
  const tolerance = Math.max(Math.abs(expected) * 0.05, 1500);
  const ok = Math.abs(diff) <= tolerance;
  failed = failed || !ok;
  const result = {
    machineKey,
    expected,
    actual,
    diff,
    tolerance: Math.round(tolerance),
    trials: options.trials,
    batches: options.batches,
    ok
  };
  results.push(result);
  if (!options.json) {
    console.log(`${ok ? 'OK' : 'NG'} ${machineKey}: expected=${expected.toLocaleString()}円 actual=${actual.toLocaleString()}円 diff=${diff.toLocaleString()}円 tolerance=±${Math.round(tolerance).toLocaleString()}円 trials=${options.trials}x${options.batches}`);
  }
}

if (options.json) {
  console.log(JSON.stringify({ ok: !failed, options, results }, null, 2));
}

if (failed) {
  process.exitCode = 1;
}
