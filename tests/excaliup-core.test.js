const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../excaliup-core.js');

test('normalizes settings and rejects invalid values', () => {
  assert.deepEqual(core.normalizeSettings({
    gifsEnabled: false,
    animatedSvgsEnabled: false,
    flowEnabled: 'yes',
    gifSpeed: 99,
    ignored: true
  }), {
    gifsEnabled: false,
    animatedSvgsEnabled: false,
    flowEnabled: true,
    gifSpeed: 2,
    respectReducedMotion: true
  });

  assert.equal(core.normalizeSettings({}).animatedSvgsEnabled, true);
  assert.equal(core.normalizeSettings({ respectReducedMotion: false }).respectReducedMotion, false);
  assert.equal(
    core.normalizeSettings({}, { ...core.DEFAULT_SETTINGS, respectReducedMotion: false }).respectReducedMotion,
    false
  );
});

test('normalizes element configuration enums and ranges', () => {
  assert.deepEqual(core.normalizeElementConfig({
    style: 'unknown',
    speed: 'fast',
    direction: 'sideways',
    particleSize: 8,
    particleSpacing: 4,
    glowIntensity: 'strong'
  }), {
    style: 'particles',
    speed: 'fast',
    direction: 'forward',
    particleSize: 5,
    particleSpacing: 20,
    glowIntensity: 'strong',
    color: null
  });
});

test('normalizes effect colors and keeps null as "match the line"', () => {
  assert.equal(core.normalizeElementConfig({ color: '#E03131' }).color, '#e03131');
  assert.equal(core.normalizeElementConfig({ color: '#abc' }).color, '#aabbcc');
  assert.equal(core.normalizeElementConfig({ color: 'red' }).color, null);
  assert.equal(core.normalizeElementConfig({ color: 'url(javascript:1)' }).color, null);
  assert.equal(core.normalizeElementConfig({}, { color: '#123456' }).color, '#123456');
  assert.equal(core.normalizeElementConfig({ color: null }, { color: '#123456' }).color, null);
});

test('accepts every motion style and maps retired ones', () => {
  for (const style of core.FLOW_STYLE_IDS) {
    assert.equal(core.normalizeElementConfig({ style }).style, style);
  }
  assert.deepEqual([...core.FLOW_STYLE_IDS].sort(), ['comet', 'dashes', 'dual', 'gradient', 'particles', 'ripple', 'train', 'wave']);
  assert.equal(core.normalizeElementConfig({ style: 'snake' }).style, 'comet');
  assert.equal(core.normalizeElementConfig({ style: 'electricity' }).style, 'wave');
});

test('detects native and CSS animated SVG markup', () => {
  assert.equal(core.isAnimatedSvgMarkup('<svg><animate attributeName="opacity" dur="1s" /></svg>'), true);
  assert.equal(core.isAnimatedSvgMarkup('<svg><animateTransform attributeName="transform" /></svg>'), true);
  assert.equal(core.isAnimatedSvgMarkup('<svg><style>@keyframes spin { to { opacity: 0 } } path { animation: spin 1s infinite; }</style></svg>'), true);
  assert.equal(core.isAnimatedSvgMarkup('<svg><path d="M0 0h10v10z" /></svg>'), false);
  assert.equal(core.isAnimatedSvgMarkup('<animate attributeName="opacity" />'), false);
});

test('sizes inserted SVG icons for a 100% canvas while preserving aspect ratio', () => {
  const square = core.sizeSvgForCanvas('<svg width="1em" height="1em" viewBox="0 0 24 24"><path /></svg>');
  assert.match(square, /width="96" height="96"/);
  assert.doesNotMatch(square, /1em/);

  const wide = core.sizeSvgForCanvas('<svg viewBox="0 0 32 16"><path /></svg>');
  assert.match(wide, /width="96" height="48"/);

  const tall = core.sizeSvgForCanvas('<svg viewBox="0 0 16 32"><path /></svg>');
  assert.match(tall, /width="48" height="96"/);

  assert.deepEqual(core.getSvgIntrinsicSize(square), { width: 96, height: 96 });
  assert.deepEqual(core.getSvgIntrinsicSize(wide), { width: 96, height: 48 });
  assert.deepEqual(core.getSvgIntrinsicSize('<svg width="1em" height="1em" viewBox="0 0 24 12" />'), {
    width: 96,
    height: 48
  });
});

test('builds rotated path points around the element center', () => {
  const points = core.getPathPoints({
    x: 10,
    y: 20,
    angle: Math.PI / 2,
    points: [[0, 0], [10, 0]]
  });

  assert.ok(Math.abs(points[0].x - 15) < 1e-9);
  assert.ok(Math.abs(points[0].y - 15) < 1e-9);
  assert.ok(Math.abs(points[1].x - 15) < 1e-9);
  assert.ok(Math.abs(points[1].y - 25) < 1e-9);
});

test('handles zero-length segments and finds points with binary lookup', () => {
  const geometry = core.getPathGeometry([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 }
  ]);

  assert.equal(geometry.segments.length, 2);
  assert.equal(geometry.totalLength, 20);
  assert.deepEqual(core.getPointAtLength(geometry, 15), { x: 10, y: 5, dx: 0, dy: 1 });
  assert.deepEqual(core.getPointAtLength(geometry, 20), { x: 10, y: 10, dx: 0, dy: 1 });
  assert.deepEqual(core.getPointAtLength(core.getPathGeometry([]), 5), { x: 0, y: 0, dx: 0, dy: 0 });
});

test('samples rounded linear elements as curves through their control points', () => {
  const points = core.getPathPoints({
    x: 10,
    y: 20,
    angle: 0,
    roundness: { type: 2 },
    points: [[0, 0], [50, 50], [100, 0]]
  });

  assert.ok(points.length > 3);
  assert.deepEqual(points[0], { x: 10, y: 20 });
  assert.deepEqual(points.at(-1), { x: 110, y: 20 });
  assert.ok(points.some((point) => point.x === 60 && point.y === 70));
  assert.ok(points.some((point) => point.x > 10 && point.x < 60 && point.y > 20));
});

test('computes viewport bounds and culls offscreen geometry', () => {
  const viewport = core.getViewportBounds(800, 600, 2, -100, -50, 20);
  assert.deepEqual(viewport, { minX: 90, minY: 40, maxX: 510, maxY: 360 });
  assert.equal(core.intersectsBounds(viewport, { minX: 120, minY: 60, maxX: 150, maxY: 90 }), true);
  assert.equal(core.intersectsBounds(viewport, { minX: 600, minY: 60, maxX: 650, maxY: 90 }), false);
});

test('batches GIF refreshes without changing semantic element fields', () => {
  const gif = { id: 'gif', type: 'image', fileId: 'file-a', version: 7, updated: 123 };
  const otherGif = { id: 'other', type: 'image', fileId: 'file-b', version: 8, updated: 456 };
  const arrow = { id: 'arrow', type: 'arrow', version: 2, updated: 789 };
  const result = core.buildGifRefreshElements([gif, otherGif, arrow], new Set(['file-a']));

  assert.equal(result.changed, true);
  assert.equal(result.refreshedCount, 1);
  assert.notEqual(result.elements[0], gif);
  assert.equal(result.elements[1], otherGif);
  assert.equal(result.elements[2], arrow);
  assert.equal(result.elements[0].version, 7);
  assert.equal(result.elements[0].updated, 123);
});

test('adaptive frame budget degrades and recovers with hysteresis', () => {
  const budget = new core.AdaptiveFrameBudget({
    windowDuration: 100,
    overloadedWindowsToReduce: 2,
    healthyWindowsToRecover: 2
  });

  budget.record(1, 10, 30);
  budget.record(101, 10, 30);
  assert.equal(budget.mode, 'full');
  budget.record(201, 10, 30);
  assert.equal(budget.mode, 'reduced');

  budget.record(301, 1, 20);
  assert.equal(budget.mode, 'reduced');
  budget.record(401, 1, 20);
  assert.equal(budget.mode, 'full');
});

test('sanitizes file and folder names safely', () => {
  assert.equal(core.sanitizeFileName('my/cool:diagram*?.excalidraw'), 'my-cool-diagram--.excalidraw');
  assert.equal(core.sanitizeFileName('   spaced name   '), 'spaced name');
  assert.equal(core.sanitizeFileName('', 'fallback-draw'), 'fallback-draw');
  assert.equal(core.sanitizeFileName(null, 'default'), 'default');
});

test('normalizes vault relative paths', () => {
  assert.equal(core.normalizeVaultPath('\\subfolder\\nested\\file.excalidraw'), 'subfolder/nested/file.excalidraw');
  assert.equal(core.normalizeVaultPath('///root///nested///'), 'root/nested');
  assert.equal(core.normalizeVaultPath(''), '');
});

test('serializes and parses Excalidraw scenes compliant with standard .excalidraw JSON', () => {
  const scene = {
    elements: [{ id: 'rect1', type: 'rectangle', x: 10, y: 20 }],
    appState: { viewBackgroundColor: '#1e1e1e', name: 'Architecture' },
    files: {
      'file-1': { id: 'file-1', dataURL: 'data:image/svg+xml;base64,test', mimeType: 'image/svg+xml' }
    }
  };

  const serialized = core.serializeExcalidrawScene(scene);
  const parsedJson = JSON.parse(serialized);
  assert.equal(parsedJson.type, 'excalidraw');
  assert.equal(parsedJson.version, 2);
  assert.equal(parsedJson.elements.length, 1);
  assert.equal(parsedJson.appState.viewBackgroundColor, '#1e1e1e');
  assert.equal(parsedJson.files['file-1'].id, 'file-1');

  const parsedScene = core.parseExcalidrawScene(serialized);
  assert.deepEqual(parsedScene.elements, scene.elements);
  assert.equal(parsedScene.appState.name, 'Architecture');
  assert.equal(parsedScene.files['file-1'].mimeType, 'image/svg+xml');

  assert.equal(core.parseExcalidrawScene('invalid-json'), null);
  assert.equal(core.parseExcalidrawScene(null), null);
});

test('normalizes vault metadata and deduplicates favorites', () => {
  const metadata = core.normalizeVaultMetadata({
    favorites: ['sub/draw1.excalidraw', 'sub/draw1.excalidraw', '\\sub\\draw2.excalidraw', 123],
    lastOpenedFile: '\\sub\\draw1.excalidraw',
    activeFilter: 'favorites'
  });

  assert.deepEqual(metadata.favorites, ['sub/draw1.excalidraw', 'sub/draw2.excalidraw']);
  assert.equal(metadata.lastOpenedFile, 'sub/draw1.excalidraw');
  assert.equal(metadata.activeFilter, 'favorites');
});

test('scans mock directory structure and resolves drawing files', async () => {
  function createMockFile(fileName, content = '') {
    const fileObj = {
      kind: 'file',
      name: fileName,
      content: content,
      getFile: async () => ({
        size: fileObj.content.length || 50,
        lastModified: 1000,
        text: async () => fileObj.content
      }),
      createWritable: async () => ({
        write: async (data) => { fileObj.content = data; },
        close: async () => {}
      })
    };
    return fileObj;
  }

  function createMockDir(name, entries = {}) {

    return {
      kind: 'directory',
      name,
      entries: async function* () {
        for (const [key, val] of Object.entries(entries)) {
          yield [key, val];
        }
      },
      getDirectoryHandle: async (subName, { create } = {}) => {
        if (!entries[subName]) {
          if (create) {
            entries[subName] = createMockDir(subName);
          } else {
            throw new Error(`Directory ${subName} not found`);
          }
        }
        return entries[subName];
      },
      getFileHandle: async (fileName, { create } = {}) => {
        if (!entries[fileName]) {
          if (create) {
            entries[fileName] = createMockFile(fileName, '');
          } else {
            throw new Error(`File ${fileName} not found`);
          }
        }
        return entries[fileName];
      },
      removeEntry: async (entryName) => {
        delete entries[entryName];
      }
    };
  }

  const mockRoot = createMockDir('root', {
    'subfolder': createMockDir('subfolder', {
      'nested.excalidraw': createMockFile('nested.excalidraw', '{"type":"excalidraw","elements":[]}')
    }),
    'root-draw.excalidraw': createMockFile('root-draw.excalidraw', '{"type":"excalidraw","elements":[]}'),
    'ignored.txt': {
      kind: 'file',
      name: 'ignored.txt',
      getFile: async () => ({ size: 10, lastModified: 1000 })
    }
  });

  const rootScan = await core.scanVaultDirectory(mockRoot, '');
  assert.equal(rootScan.folders.length, 1);
  assert.equal(rootScan.folders[0].name, 'subfolder');
  assert.equal(rootScan.files.length, 1);
  assert.equal(rootScan.files[0].name, 'root-draw.excalidraw');

  const allDrawings = await core.scanAllVaultDrawings(mockRoot, '');
  assert.equal(allDrawings.length, 2);

  const allFolders = await core.scanAllVaultFolders(mockRoot, '');
  assert.equal(allFolders.length, 1);
  assert.equal(allFolders[0].path, 'subfolder');

  // Test moving drawing file
  await core.writeDrawingFile(mockRoot, 'root-draw.excalidraw', 'root-content');
  const moveRes = await core.moveDrawingFile(mockRoot, 'root-draw.excalidraw', 'subfolder');
  assert.equal(moveRes.success, true);
  assert.equal(moveRes.moved, true);
  assert.equal(moveRes.newRelativePath, 'subfolder/root-draw.excalidraw');

  const movedContent = await core.readDrawingFile(mockRoot, 'subfolder/root-draw.excalidraw');
  assert.equal(movedContent, 'root-content');
  await assert.rejects(async () => {
    await core.readDrawingFile(mockRoot, 'root-draw.excalidraw');
  });

  // Test moving drawing file back to root
  const moveBackRes = await core.moveDrawingFile(mockRoot, 'subfolder/root-draw.excalidraw', '');
  assert.equal(moveBackRes.success, true);
  assert.equal(moveBackRes.moved, true);
  assert.equal(moveBackRes.newRelativePath, 'root-draw.excalidraw');
  const rootContentAfterMoveBack = await core.readDrawingFile(mockRoot, 'root-draw.excalidraw');
  assert.equal(rootContentAfterMoveBack, 'root-content');

  // Test moving to same location
  const noopMove = await core.moveDrawingFile(mockRoot, 'root-draw.excalidraw', '');
  assert.equal(noopMove.moved, false);

  // Test folder deletion
  await core.createVaultSubfolder(mockRoot, 'temp-folder');
  const foldersAfterCreate = await core.scanAllVaultFolders(mockRoot, '');
  assert.equal(foldersAfterCreate.length, 2);

  await core.deleteVaultFolder(mockRoot, 'temp-folder');
  const foldersAfterDelete = await core.scanAllVaultFolders(mockRoot, '');
  assert.equal(foldersAfterDelete.length, 1);

  // Test cannot delete root folder
  await assert.rejects(async () => {
    await core.deleteVaultFolder(mockRoot, '');
  });
});




function createMemoryVault(files) {
  function createDir(entries) {
    return {
      kind: 'directory',
      entries: async function* () {
        for (const entry of Object.entries(entries)) yield entry;
      },
      async getDirectoryHandle(name, { create } = {}) {
        if (!entries[name]) {
          if (!create) throw new Error(`Directory ${name} not found`);
          entries[name] = createDir({});
        }
        return entries[name];
      },
      async getFileHandle(name, { create } = {}) {
        if (!entries[name]) {
          if (!create) throw new Error(`File ${name} not found`);
          entries[name] = createFile('');
        }
        return entries[name];
      },
      async removeEntry(name) {
        delete entries[name];
      }
    };
  }

  function createFile(content) {
    const file = {
      kind: 'file',
      content,
      getFile: async () => ({ size: file.content.length, lastModified: 1, text: async () => file.content }),
      createWritable: async () => ({
        write: async (data) => { file.content = data; },
        close: async () => {}
      })
    };
    return file;
  }

  const root = createDir({});
  return {
    root,
    async seed() {
      for (const [filePath, content] of Object.entries(files)) {
        await core.writeDrawingFile(root, filePath, content);
      }
      return root;
    }
  };
}

test('finds unique drawing paths without overwriting existing files', async () => {
  const vault = createMemoryVault({
    'Plan.excalidraw': 'a',
    'Plan (2).excalidraw': 'b',
    'work/Plan (Copy).excalidraw': 'c'
  });
  const root = await vault.seed();

  assert.equal(await core.drawingFileExists(root, 'Plan.excalidraw'), true);
  assert.equal(await core.drawingFileExists(root, 'missing/Plan.excalidraw'), false);
  assert.equal(await core.getUniqueDrawingPath(root, 'Fresh.excalidraw'), 'Fresh.excalidraw');
  assert.equal(await core.getUniqueDrawingPath(root, 'Plan.excalidraw'), 'Plan (3).excalidraw');
  assert.equal(
    await core.getUniqueDrawingPath(root, 'work/Plan (Copy).excalidraw', (stem, index) => `Plan (Copy ${index})`),
    'work/Plan (Copy 2).excalidraw'
  );
});

test('renames and moves drawings but refuses to overwrite', async () => {
  const vault = createMemoryVault({
    'alpha.excalidraw': 'alpha',
    'beta.excalidraw': 'beta',
    'archive/alpha.excalidraw': 'old alpha'
  });
  const root = await vault.seed();

  await assert.rejects(
    core.renameDrawingFile(root, 'alpha.excalidraw', 'beta.excalidraw'),
    { name: 'VaultEntryExistsError' }
  );
  assert.equal(await core.readDrawingFile(root, 'alpha.excalidraw'), 'alpha');

  assert.equal(await core.renameDrawingFile(root, 'alpha.excalidraw', 'gamma.excalidraw'), 'gamma.excalidraw');
  assert.equal(await core.readDrawingFile(root, 'gamma.excalidraw'), 'alpha');
  assert.equal(await core.drawingFileExists(root, 'alpha.excalidraw'), false);

  assert.equal(await core.renameDrawingFile(root, 'gamma.excalidraw', 'Gamma.excalidraw'), 'Gamma.excalidraw');
  assert.equal(await core.readDrawingFile(root, 'Gamma.excalidraw'), 'alpha');
  const listing = await core.scanVaultDirectory(root, '');
  assert.deepEqual(listing.files.map((file) => file.name).sort(), ['Gamma.excalidraw', 'beta.excalidraw']);

  await core.writeDrawingFile(root, 'alpha.excalidraw', 'new alpha');
  await assert.rejects(
    core.moveDrawingFile(root, 'alpha.excalidraw', 'archive'),
    { name: 'VaultEntryExistsError' }
  );
  assert.equal(await core.readDrawingFile(root, 'archive/alpha.excalidraw'), 'old alpha');
  assert.equal(await core.readDrawingFile(root, 'alpha.excalidraw'), 'new alpha');
});

test('sanitizing names strips leading dots and control characters', () => {
  assert.equal(core.sanitizeFileName('..'), 'untitled');
  assert.equal(core.sanitizeFileName('.hidden plan'), 'hidden plan');
  assert.equal(core.sanitizeFileName('tab\tname'), 'tab name');
});
