const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Iconify is packaged locally and the picker supports all collections', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const mainWorldScript = manifest.content_scripts.find(entry => entry.world === 'MAIN');
  const injectSource = fs.readFileSync(path.join(root, 'inject.js'), 'utf8');

  assert.ok(mainWorldScript);
  assert.equal(mainWorldScript.js[0], 'vendor/iconify-icon.min.js');
  assert.ok(fs.existsSync(path.join(root, 'vendor', 'iconify-icon.min.js')));
  assert.match(injectSource, /https:\/\/api\.iconify\.design\/collections/);
  assert.match(injectSource, /https:\/\/api\.iconify\.design\/search/);
  assert.match(injectSource, /id="excaligif-icons-pack"/);
  assert.match(injectSource, /id="excaligif-icons-category"/);
  assert.match(injectSource, /id="excaligif-icons-tag"/);
  assert.match(injectSource, /searchParams\.set\('limit', '999'\)/);
  assert.doesNotMatch(injectSource, /fonts\.googleapis\.com|cdn\.jsdelivr\.net/);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('obsolete local icon metadata is not packaged', () => {
  const root = path.join(__dirname, '..');
  const packageSource = fs.readFileSync(path.join(root, 'package.py'), 'utf8');

  assert.doesNotMatch(packageSource, /icons_metadata\.json|lucide_metadata\.json/);
  assert.equal(fs.existsSync(path.join(root, 'icons_metadata.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'lucide_metadata.json')), false);
});
