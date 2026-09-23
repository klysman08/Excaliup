const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../excaliup-core.js');
const flow = require('../excaliup-flow.js');

function createMockContext() {
  const calls = { stroke: 0, fill: 0, arc: 0, lineTo: 0, save: 0, restore: 0 };
  let shadowBlur = 0;
  let maxShadowBlur = 0;
  const ctx = {
    calls,
    get maxShadowBlur() {
      return maxShadowBlur;
    },
    get shadowBlur() {
      return shadowBlur;
    },
    set shadowBlur(value) {
      shadowBlur = value;
      maxShadowBlur = Math.max(maxShadowBlur, value);
    },
    globalAlpha: 1,
    lineWidth: 1,
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() { calls.lineTo++; },
    arc(x, y, radius) {
      assert.ok(radius >= 0, 'arc radius must never be negative');
      calls.arc++;
    },
    stroke() { calls.stroke++; },
    fill() { calls.fill++; },
    setLineDash() {},
    save() { calls.save++; },
    restore() { calls.restore++; }
  };
  return ctx;
}

const element = { strokeColor: '#1971c2', strokeWidth: 2, opacity: 100 };
const straight = core.getPathGeometry([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
const view = { zoom: 1, sampleScale: 1, bounds: { minX: -50, minY: -50, maxX: 1200, maxY: 200 } };

test('path cursor and in-place sampler match getPointAtLength', () => {
  const geometry = core.getPathGeometry([
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 30 }, { x: -5, y: 30 }
  ]);
  const cursor = core.createPathCursor(geometry);
  const out = { x: 0, y: 0, dx: 0, dy: 0 };
  for (const distance of [-4, 0, 3, 10, 11, 25, 40, 12, 2, 55, 90]) {
    const expected = core.getPointAtLength(geometry, distance);
    assert.deepEqual({ ...cursor.at(distance, out) }, expected);
    assert.deepEqual({ ...core.samplePathAtLength(geometry, distance, out) }, expected);
  }
  assert.deepEqual(
    { ...core.createPathCursor(core.getPathGeometry([])).at(5, out) },
    { x: 0, y: 0, dx: 0, dy: 0 }
  );
});

test('every flow style renders without shadowBlur for all glow levels and directions', () => {
  const renderer = flow.createFlowRenderer({ core });
  for (const style of flow.STYLES) {
    for (const glowIntensity of ['none', 'subtle', 'medium', 'strong']) {
      for (const offset of [0, 37.5, -120]) {
        const ctx = createMockContext();
        const config = core.normalizeElementConfig({ style, glowIntensity });
        assert.equal(renderer.draw(ctx, element, straight, offset, config, view), true, style);
        assert.equal(ctx.maxShadowBlur, 0, `${style} must not use shadowBlur`);
        assert.equal(ctx.calls.save, ctx.calls.restore, `${style} balances save/restore`);
        const drawn = ctx.calls.stroke + ctx.calls.fill;
        assert.ok(drawn > 0, `${style} (${glowIntensity}) draws something`);
      }
    }
  }
});

test('trail effects batch their segments into a handful of strokes', () => {
  const renderer = flow.createFlowRenderer({ core });
  for (const style of ['comet', 'gradient']) {
    const ctx = createMockContext();
    renderer.draw(ctx, element, straight, 12, core.normalizeElementConfig({ style, glowIntensity: 'strong' }), view);
    // 5 buckets x (halo + core) at most; the old renderer issued hundreds.
    assert.ok(ctx.calls.stroke <= 12, `${style} used ${ctx.calls.stroke} strokes`);
    assert.ok(ctx.calls.lineTo > 20, `${style} still traces its trails`);
  }
});

test('dots glow with two halo passes instead of shadowBlur', () => {
  const renderer = flow.createFlowRenderer({ core });
  const glowing = createMockContext();
  renderer.draw(glowing, element, straight, 0, core.normalizeElementConfig({ style: 'particles' }), view);
  // 20 dots: two halo passes plus the solid dots, one circle per fill.
  assert.equal(glowing.calls.arc, 60);
  assert.equal(glowing.calls.fill, 60);

  const plain = createMockContext();
  renderer.draw(plain, element, straight, 0, core.normalizeElementConfig({ style: 'particles', glowIntensity: 'none' }), view);
  assert.equal(plain.calls.arc, 20);
});

test('level of detail skips tiny elements, culls offscreen dots and drops glow when zoomed out', () => {
  const renderer = flow.createFlowRenderer({ core });
  const tiny = createMockContext();
  const config = core.normalizeElementConfig({ style: 'particles' });
  const short = core.getPathGeometry([{ x: 0, y: 0 }, { x: 20, y: 0 }]);
  assert.equal(renderer.draw(tiny, element, short, 0, config, { ...view, zoom: 0.1 }), false);
  assert.equal(tiny.calls.fill + tiny.calls.stroke, 0);

  const culled = createMockContext();
  renderer.draw(culled, element, straight, 0, config, { ...view, bounds: { minX: 0, minY: -10, maxX: 200, maxY: 10 } });
  const culledDots = culled.calls.arc / 3;
  assert.ok(culledDots > 0 && culledDots < 8, `drew ${culledDots} dots`);

  const zoomedOut = createMockContext();
  renderer.draw(zoomedOut, element, straight, 0, config, { ...view, zoom: 0.2, bounds: null });
  // No glow passes, and spacing is stretched so dots stay a few screen pixels apart.
  assert.equal(zoomedOut.calls.fill, zoomedOut.calls.arc);
  assert.ok(zoomedOut.calls.arc > 0 && zoomedOut.calls.arc <= 20);
});

test('renderer styles match the core style list', () => {
  assert.deepEqual([...flow.STYLES].sort(), [...core.FLOW_STYLE_IDS].sort());
});

test('effect color overrides the stroke color', () => {
  const renderer = flow.createFlowRenderer({ core });
  const fills = [];
  const ctx = createMockContext();
  Object.defineProperty(ctx, 'fillStyle', { set(value) { fills.push(value); }, get() { return fills.at(-1); } });
  renderer.draw(ctx, element, straight, 0, core.normalizeElementConfig({ style: 'particles', color: '#f08c00' }), view);
  assert.deepEqual([...new Set(fills)], ['#f08c00']);

  fills.length = 0;
  renderer.draw(ctx, element, straight, 0, core.normalizeElementConfig({ style: 'particles' }), view);
  assert.deepEqual([...new Set(fills)], [element.strokeColor]);
});

test('fully transparent elements are skipped', () => {
  const renderer = flow.createFlowRenderer({ core });
  const ctx = createMockContext();
  const config = core.normalizeElementConfig({ style: 'comet' });
  assert.equal(renderer.draw(ctx, { ...element, opacity: 0 }, straight, 0, config, view), false);
});
