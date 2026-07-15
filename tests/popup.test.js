const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('popup reads the manifest version and reports flow-only runtime as active', async () => {
  const elements = new Map();
  for (const id of [
    'statusBanner',
    'statusText',
    'gifToggle',
    'gifCount',
    'engineStatus',
    'versionLabel',
    'flowToggle',
    'gifSpeed',
    'gifSettingsGroup',
    'animatedCount'
  ]) {
    elements.set(id, { id, style: {}, textContent: '', disabled: false, checked: false, value: '' });
  }

  let onReady;
  const document = {
    addEventListener(name, handler) {
      if (name === 'DOMContentLoaded') onReady = handler;
    },
    getElementById(id) {
      return elements.get(id);
    }
  };
  const chrome = {
    runtime: {
      lastError: null,
      getManifest() {
        return { version: '2.0.0' };
      }
    },
    tabs: {
      async query() {
        return [{ id: 1, url: 'https://excalidraw.com/' }];
      },
      sendMessage(tabId, message, callback) {
        if (message.action === 'getStatus') {
          callback({
            connected: true,
            enabled: false,
            activeGifCount: 0,
            activeAnimatedSvgCount: 2,
            animatedElementCount: 2,
            settings: { gifsEnabled: false, flowEnabled: true, gifSpeed: 1 }
          });
        } else {
          callback({ status: 'forwarded' });
        }
      }
    }
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, console, document }, { filename: 'popup.js' });
  await onReady();

  assert.equal(elements.get('versionLabel').textContent, 'v2.0.0');
  assert.equal(elements.get('gifToggle').checked, false);
  assert.equal(elements.get('flowToggle').checked, true);
  assert.equal(elements.get('gifSettingsGroup').style.display, 'none');
  assert.equal(elements.get('gifCount').textContent, 2);
  assert.equal(elements.get('engineStatus').textContent, 'Running');
});
