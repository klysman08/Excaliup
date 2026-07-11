(function(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.defineProperty(root, 'ExcaliupCore', {
      value: api,
      configurable: true
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const FLOW_STYLES = new Set([
    'particles', 'dashes', 'gradient', 'ripple', 'train', 'snake',
    'comet', 'electricity', 'wave', 'dual'
  ]);
  const FLOW_SPEEDS = new Set(['slow', 'medium', 'fast']);
  const FLOW_DIRECTIONS = new Set(['forward', 'reverse', 'bounce']);
  const GLOW_INTENSITIES = new Set(['none', 'subtle', 'medium', 'strong']);

  const DEFAULT_SETTINGS = Object.freeze({
    gifsEnabled: true,
    flowEnabled: true,
    gifSpeed: 1
  });

  const DEFAULT_ELEMENT_CONFIG = Object.freeze({
    style: 'particles',
    speed: 'medium',
    direction: 'forward',
    particleSize: 3,
    particleSpacing: 50,
    glowIntensity: 'medium'
  });

  function finiteNumber(value, fallback) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max, fallback) {
    return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
  }

  function normalizeSettings(value, fallback = DEFAULT_SETTINGS) {
    const source = value && typeof value === 'object' ? value : {};
    const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_SETTINGS;

    return {
      gifsEnabled: typeof source.gifsEnabled === 'boolean' ? source.gifsEnabled : !!base.gifsEnabled,
      flowEnabled: typeof source.flowEnabled === 'boolean' ? source.flowEnabled : !!base.flowEnabled,
      gifSpeed: clamp(source.gifSpeed, 0.5, 2, finiteNumber(base.gifSpeed, 1))
    };
  }

  function normalizeElementConfig(value, fallback = DEFAULT_ELEMENT_CONFIG) {
    const source = value && typeof value === 'object' ? value : {};
    const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_ELEMENT_CONFIG;

    const baseStyle = FLOW_STYLES.has(base.style) ? base.style : DEFAULT_ELEMENT_CONFIG.style;
    const baseSpeed = FLOW_SPEEDS.has(base.speed) ? base.speed : DEFAULT_ELEMENT_CONFIG.speed;
    const baseDirection = FLOW_DIRECTIONS.has(base.direction) ? base.direction : DEFAULT_ELEMENT_CONFIG.direction;
    const baseGlow = GLOW_INTENSITIES.has(base.glowIntensity)
      ? base.glowIntensity
      : DEFAULT_ELEMENT_CONFIG.glowIntensity;

    return {
      style: FLOW_STYLES.has(source.style) ? source.style : baseStyle,
      speed: FLOW_SPEEDS.has(source.speed) ? source.speed : baseSpeed,
      direction: FLOW_DIRECTIONS.has(source.direction) ? source.direction : baseDirection,
      particleSize: Math.round(clamp(source.particleSize, 1, 5, finiteNumber(base.particleSize, 3))),
      particleSpacing: Math.round(clamp(
        source.particleSpacing,
        20,
        120,
        finiteNumber(base.particleSpacing, 50)
      )),
      glowIntensity: GLOW_INTENSITIES.has(source.glowIntensity) ? source.glowIntensity : baseGlow
    };
  }

  function getPathPoints(element) {
    if (!element || !Array.isArray(element.points) || element.points.length === 0) {
      return [];
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of element.points) {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
    }

    const originX = finiteNumber(element.x, 0);
    const originY = finiteNumber(element.y, 0);
    const centerX = originX + (minX + maxX) / 2;
    const centerY = originY + (minY + maxY) / 2;
    const angle = finiteNumber(element.angle, 0);
    const cos = angle ? Math.cos(angle) : 1;
    const sin = angle ? Math.sin(angle) : 0;

    const sourcePoints = element.roundness
      ? getRoundedLinearElementPoints(element.points)
      : element.points.map((point) => ({ x: point[0], y: point[1] }));

    return sourcePoints.map((point) => {
      const x = originX + point.x;
      const y = originY + point.y;
      if (!angle) return { x, y };

      const relativeX = x - centerX;
      const relativeY = y - centerY;
      return {
        x: centerX + relativeX * cos - relativeY * sin,
        y: centerY + relativeX * sin + relativeY * cos
      };
    });
  }

  // Excalidraw renders rounded linear elements as a curve through their points.
  // Flatten that curve once so every overlay effect shares the same arc-length
  // geometry instead of following the straight control polygon.
  function getRoundedLinearElementPoints(points) {
    if (!Array.isArray(points) || points.length < 3) {
      return (points || []).map((point) => ({ x: point[0], y: point[1] }));
    }

    const result = [{ x: points[0][0], y: points[0][1] }];
    for (let index = 0; index < points.length - 1; index++) {
      const p0 = points[Math.max(0, index - 1)];
      const p1 = points[index];
      const p2 = points[index + 1];
      const p3 = points[Math.min(points.length - 1, index + 2)];
      const chordLength = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(8, Math.min(48, Math.ceil(chordLength / 6)));

      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        result.push({
          x: 0.5 * (
            2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
          ),
          y: 0.5 * (
            2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
          )
        });
      }
    }
    return result;
  }

  function getPathGeometry(points) {
    const segments = [];
    let totalLength = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of points || []) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    for (let index = 0; index < (points || []).length - 1; index++) {
      const start = points[index];
      const end = points[index + 1];
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const length = Math.hypot(deltaX, deltaY);
      if (length <= 0) continue;

      totalLength += length;
      segments.push({
        start,
        end,
        length,
        endDistance: totalLength,
        dx: deltaX / length,
        dy: deltaY / length
      });
    }

    return {
      segments,
      totalLength,
      bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
    };
  }

  function getPointAtLength(geometry, distance) {
    if (!geometry || geometry.totalLength <= 0 || geometry.segments.length === 0) {
      return { x: 0, y: 0, dx: 0, dy: 0 };
    }

    const normalizedDistance = Math.min(
      geometry.totalLength,
      Math.max(0, finiteNumber(distance, 0))
    );

    let low = 0;
    let high = geometry.segments.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (geometry.segments[middle].endDistance >= normalizedDistance) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }

    const segment = geometry.segments[low];
    const startDistance = segment.endDistance - segment.length;
    const progress = (normalizedDistance - startDistance) / segment.length;
    return {
      x: segment.start.x + progress * (segment.end.x - segment.start.x),
      y: segment.start.y + progress * (segment.end.y - segment.start.y),
      dx: segment.dx,
      dy: segment.dy
    };
  }

  function getElementOffset(config, globalOffset) {
    const speed = config.speed === 'slow' ? 0.8 : config.speed === 'fast' ? 4 : 2;
    if (config.direction === 'reverse') return -globalOffset * speed;
    if (config.direction === 'bounce') {
      const travel = ((globalOffset * speed) % 400 + 400) % 400;
      return travel < 200 ? travel : 400 - travel;
    }
    return globalOffset * speed;
  }

  function getViewportBounds(width, height, zoom, scrollX, scrollY, margin = 0) {
    const safeZoom = Math.max(0.01, finiteNumber(zoom, 1));
    const sceneMargin = Math.max(0, finiteNumber(margin, 0)) / safeZoom;
    const left = -finiteNumber(scrollX, 0);
    const top = -finiteNumber(scrollY, 0);

    return {
      minX: left - sceneMargin,
      minY: top - sceneMargin,
      maxX: left + Math.max(0, finiteNumber(width, 0)) / safeZoom + sceneMargin,
      maxY: top + Math.max(0, finiteNumber(height, 0)) / safeZoom + sceneMargin
    };
  }

  function intersectsBounds(first, second) {
    if (!first || !second) return false;
    return !(
      first.maxX < second.minX ||
      first.minX > second.maxX ||
      first.maxY < second.minY ||
      first.minY > second.maxY
    );
  }

  function buildGifRefreshElements(elements, dueFileIds) {
    const fileIds = dueFileIds instanceof Set ? dueFileIds : new Set(dueFileIds || []);
    if (!Array.isArray(elements) || fileIds.size === 0) {
      return { elements, changed: false, refreshedCount: 0 };
    }

    let refreshedCount = 0;
    const nextElements = elements.map((element) => {
      if (element && element.type === 'image' && fileIds.has(element.fileId)) {
        refreshedCount++;
        return { ...element };
      }
      return element;
    });

    return {
      elements: refreshedCount > 0 ? nextElements : elements,
      changed: refreshedCount > 0,
      refreshedCount
    };
  }

  class AdaptiveFrameBudget {
    constructor(options = {}) {
      this.windowDuration = options.windowDuration || 1000;
      this.overloadedWindowsToReduce = options.overloadedWindowsToReduce || 2;
      this.healthyWindowsToRecover = options.healthyWindowsToRecover || 5;
      this.reset(0);
    }

    reset(timestamp = 0) {
      this.mode = 'full';
      this.windowStartedAt = timestamp;
      this.sampleCount = 0;
      this.totalDrawCost = 0;
      this.missedFrames = 0;
      this.overloadedWindows = 0;
      this.healthyWindows = 0;
    }

    get targetFps() {
      return this.mode === 'full' ? 60 : 30;
    }

    get frameInterval() {
      return 1000 / this.targetFps;
    }

    get sampleScale() {
      return this.mode === 'full' ? 1 : 0.6;
    }

    record(timestamp, drawCost, frameDelta) {
      if (!this.windowStartedAt) this.windowStartedAt = timestamp;
      this.sampleCount++;
      this.totalDrawCost += Math.max(0, finiteNumber(drawCost, 0));
      if (finiteNumber(frameDelta, 0) > this.frameInterval * 1.5) this.missedFrames++;

      if (timestamp - this.windowStartedAt < this.windowDuration) return this.mode;

      const averageCost = this.sampleCount ? this.totalDrawCost / this.sampleCount : 0;
      const missedRatio = this.sampleCount ? this.missedFrames / this.sampleCount : 0;
      const overloaded = averageCost > 8 || missedRatio > 0.2;
      const healthy = averageCost < 4 && missedRatio < 0.1;

      if (this.mode === 'full') {
        this.overloadedWindows = overloaded ? this.overloadedWindows + 1 : 0;
        if (this.overloadedWindows >= this.overloadedWindowsToReduce) {
          this.mode = 'reduced';
          this.overloadedWindows = 0;
          this.healthyWindows = 0;
        }
      } else {
        this.healthyWindows = healthy ? this.healthyWindows + 1 : 0;
        if (this.healthyWindows >= this.healthyWindowsToRecover) {
          this.mode = 'full';
          this.overloadedWindows = 0;
          this.healthyWindows = 0;
        }
      }

      this.windowStartedAt = timestamp;
      this.sampleCount = 0;
      this.totalDrawCost = 0;
      this.missedFrames = 0;
      return this.mode;
    }
  }

  return Object.freeze({
    DEFAULT_SETTINGS,
    DEFAULT_ELEMENT_CONFIG,
    normalizeSettings,
    normalizeElementConfig,
    getPathPoints,
    getPathGeometry,
    getPointAtLength,
    getElementOffset,
    getViewportBounds,
    intersectsBounds,
    buildGifRefreshElements,
    AdaptiveFrameBudget
  });
});
