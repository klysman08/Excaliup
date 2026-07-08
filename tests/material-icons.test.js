const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('content.js listens for ExcaliGifGetIconsData and responds via custom event', async () => {
  const listeners = new Map();
  const dispatchedEvents = [];
  
  // Mock content.js environment
  const chrome = {
    runtime: {
      onMessage: {
        addListener() {}
      },
      getURL(file) {
        return `mock-extension-url://${file}`;
      }
    }
  };

  const document = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      return true;
    }
  };

  // Mock global fetch
  const mockMetadata = { categories: ['Action'], icons: [{ n: 'home', c: 'Action', t: [], i: true, s: true }] };
  const globalFetch = async (url) => {
    assert.equal(url, 'mock-extension-url://icons_metadata.json');
    return {
      json: async () => mockMetadata
    };
  };

  const context = {
    chrome,
    document,
    fetch: globalFetch,
    console: { log() {}, error() {} },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    }
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'content.js' });

  // Verify listeners were registered
  assert.ok(listeners.has('ExcaliGifGetIconsData'));

  // Trigger the event listener
  const handler = listeners.get('ExcaliGifGetIconsData');
  await handler();

  // Verify event response was dispatched
  const responseEvent = dispatchedEvents.find(e => e.type === 'ExcaliGifIconsDataResponse');
  assert.ok(responseEvent);
  assert.equal(responseEvent.detail.success, true);
  assert.deepEqual(responseEvent.detail.data, mockMetadata);
});
