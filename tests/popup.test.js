const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('popup reads the manifest version and reports flow-only runtime as active', async () => {
  const elements = new Map();
  const messages = [];
  for (const id of [
    'statusBanner',
    'statusText',
    'gifToggle',
    'animatedSvgToggle',
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
        return { version: '5.0.0' };
      }
    },
    tabs: {
      async query() {
        return [{ id: 1, url: 'https://excalidraw.com/' }];
      },
      sendMessage(tabId, message, callback) {
        messages.push(message);
        if (message.action === 'getStatus') {
          callback({
            connected: true,
            enabled: false,
            activeGifCount: 0,
            activeAnimatedSvgCount: 2,
            animatedElementCount: 2,
            settings: { gifsEnabled: false, animatedSvgsEnabled: true, flowEnabled: true, gifSpeed: 1 }
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

  assert.equal(elements.get('versionLabel').textContent, 'v5.0.0');
  assert.equal(elements.get('gifToggle').checked, false);
  assert.equal(elements.get('animatedSvgToggle').checked, true);
  assert.equal(elements.get('flowToggle').checked, true);
  assert.equal(elements.get('gifSettingsGroup').style.display, 'none');
  assert.equal(elements.get('gifCount').textContent, 2);
  assert.equal(elements.get('engineStatus').textContent, 'Running');

  elements.get('animatedSvgToggle').checked = false;
  elements.get('animatedSvgToggle').onchange();
  assert.deepEqual({ ...messages.at(-1).settings }, {
    gifsEnabled: false,
    animatedSvgsEnabled: false,
    flowEnabled: true,
    gifSpeed: 1
  });
});

test('popup includes a safe Buy me a coffee link', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
  assert.match(html, /https:\/\/donate\.stripe\.com\/4gMdRa7XW6dt8Ph9KX9Ve01/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('popup shows current usage instructions and the author GitHub link', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
  assert.match(html, /Press <b>B<\/b> to open the Iconify Library/);
  assert.match(html, /https:\/\/github\.com\/klysman08/);
  assert.doesNotMatch(html, /Antigravity pair-programming/);
});
