const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../excaliup-core.js');

test('normalizes settings and rejects invalid values', () => {
  assert.deepEqual(core.normalizeSettings({
    gifsEnabled: false,
    flowEnabled: 'yes',
    gifSpeed: 99,
    ignored: true
  }), {
    gifsEnabled: false,
    flowEnabled: true,
    gifSpeed: 2
  });
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
