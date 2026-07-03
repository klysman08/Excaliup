const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = require('../excaligif-core.js');

test('injected runtime boots without a canvas and keeps GIF and flow settings independent', () => {
  const listeners = new Map();
  const dispatchedEvents = [];
  const storedValues = new Map();
  const document = {
    hidden: false,
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      return true;
    },
    querySelector() {
      return null;
    },
    getElementById() {
      return null;
    }
  };
  const window = {
    ExcaliGifCore: core,
    addEventListener() {},
    devicePixelRatio: 1
  };
  const context = {
    AbortController,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    HTMLElement: class HTMLElement {},
    Window: class Window {},
    clearInterval() {},
    clearTimeout() {},
    console: { log() {}, error() {} },
    document,
    localStorage: {
      getItem(key) {
        return storedValues.get(key) || null;
      },
      setItem(key, value) {
        storedValues.set(key, value);
      }
    },
    performance,
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
    setInterval() {
      return 1;
    },
    setTimeout() {
      return 1;
    },
    window
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'inject.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'inject.js' });

  listeners.get('ExcaliGifUpdateSettings')({
    detail: { gifsEnabled: false, flowEnabled: true, gifSpeed: 99 }
  });
  listeners.get('ExcaliGifQueryStatus')();

  const response = dispatchedEvents.find((event) => event.type === 'ExcaliGifStatusResponse');
  assert.ok(response);
  assert.equal(response.detail.enabled, false);
  assert.deepEqual({ ...response.detail.settings }, {
    gifsEnabled: false,
    flowEnabled: true,
    gifSpeed: 2
  });
});
