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
    gifSpeed: 2
  });

  assert.equal(core.normalizeSettings({}).animatedSvgsEnabled, true);
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
    glowIntensity: 'strong'
  });
});

test('accepts every extended motion style', () => {
  for (const style of ['comet', 'electricity', 'wave', 'dual']) {
    assert.equal(core.normalizeElementConfig({ style }).style, style);
  }
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
            entries[fileName] = {
              kind: 'file',
              name: fileName,
              content: '',
              getFile: async () => ({
                size: 100,
                lastModified: 1000,
                text: async () => entries[fileName].content
              }),
              createWritable: async () => ({
                write: async (data) => { entries[fileName].content = data; },
                close: async () => {}
              })
            };
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
      'nested.excalidraw': {
        kind: 'file',
        name: 'nested.excalidraw',
        content: '{"type":"excalidraw","elements":[]}',
        getFile: async () => ({ size: 50, lastModified: 2000, text: async () => '{"type":"excalidraw","elements":[]}' })
      }
    }),
    'root-draw.excalidraw': {
      kind: 'file',
      name: 'root-draw.excalidraw',
      content: '{"type":"excalidraw","elements":[]}',
      getFile: async () => ({ size: 80, lastModified: 3000, text: async () => '{"type":"excalidraw","elements":[]}' })
    },
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

  await core.writeDrawingFile(mockRoot, 'subfolder/new.excalidraw', 'test-content');
  const readContent = await core.readDrawingFile(mockRoot, 'subfolder/new.excalidraw');
  assert.equal(readContent, 'test-content');

  await core.deleteDrawingFile(mockRoot, 'subfolder/new.excalidraw');
  await assert.rejects(async () => {
    await core.readDrawingFile(mockRoot, 'subfolder/new.excalidraw');
  });
});

