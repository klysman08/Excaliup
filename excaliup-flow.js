(function(root, factory) {
  const api = factory(root && root.ExcaliupCore ? root.ExcaliupCore : null);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.defineProperty(root, 'ExcaliupFlow', {
      value: api,
      configurable: true
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(globalCore) {
  'use strict';

  // Flow effect renderers for arrows and lines.
  //
  // Performance model: the expensive part of the old renderer was a canvas
  // shadowBlur on every dot or segment. Here every effect is drawn in a few
  // batched paths (one per alpha/width bucket), and glow is faked with wide,
  // translucent halo passes of the same batched path. shadowBlur is never used.

  const GLOW_PIXELS = Object.freeze({ none: 0, subtle: 3, medium: 6, strong: 14 });
  const HALO_ALPHA = 0.22;
  // How far (relative to the glow size) a halo stroke extends past the line.
  const HALO_SPREAD = 0.9;
  const BUCKET_COUNT = 5;
  const MIN_GLOW_ZOOM = 0.4;
  const MIN_SCREEN_SPACING = 6;
  const MIN_SCREEN_SIZE = 4;

  function getGlowPixels(config) {
    const value = GLOW_PIXELS[config && config.glowIntensity];
    return value === undefined ? GLOW_PIXELS.medium : value;
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function quantizeLog2(value, stepsPerOctave, min, max) {
    const safe = Math.min(max, Math.max(min, value || 1));
    return Math.pow(2, Math.round(Math.log2(safe) * stepsPerOctave) / stepsPerOctave);
  }

  function createBuckets() {
    const buckets = [];
    for (let index = 0; index < BUCKET_COUNT; index++) buckets.push({ coords: [], used: false });
    return buckets;
  }

  function resetBuckets(buckets) {
    for (const bucket of buckets) {
      bucket.coords.length = 0;
      bucket.used = false;
    }
  }

  // Stores segments as polylines; a NaN pair separates runs so consecutive
  // segments that share an endpoint become a single lineTo chain.
  function pushSegment(bucket, x1, y1, x2, y2) {
    const coords = bucket.coords;
    const length = coords.length;
    bucket.used = true;
    if (length >= 2 && coords[length - 2] === x1 && coords[length - 1] === y1) {
      coords.push(x2, y2);
      return;
    }
    if (length) coords.push(NaN, NaN);
    coords.push(x1, y1, x2, y2);
  }

  function tracePolylines(ctx, coords) {
    ctx.beginPath();
    let move = true;
    for (let index = 0; index < coords.length; index += 2) {
      const x = coords[index];
      const y = coords[index + 1];
      if (x !== x) {
        move = true;
        continue;
      }
      if (move) {
        ctx.moveTo(x, y);
        move = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
  }

  // Strokes the current path with an optional halo pass underneath.
  function strokeWithGlow(ctx, alpha, width, glow) {
    if (glow > 0) {
      ctx.globalAlpha = alpha * HALO_ALPHA;
      ctx.lineWidth = width + glow * HALO_SPREAD;
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function createFlowRenderer(options = {}) {
    const Core = options.core || globalCore;
    if (!Core || typeof Core.createPathCursor !== 'function') {
      throw new Error('ExcaliupFlow requires ExcaliupCore');
    }
    const buckets = createBuckets();
    const dotCenters = [];
    const point = { x: 0, y: 0, dx: 0, dy: 0 };
    const previous = { x: 0, y: 0, dx: 0, dy: 0 };

    // --- Per-draw state (set in draw) ---
    let bounds = null;
    let zoom = 1;
    let sampleScale = 1;
    let baseAlpha = 1;

    function inView(x, y, padding) {
      if (!bounds) return true;
      return (
        x >= bounds.minX - padding &&
        x <= bounds.maxX + padding &&
        y >= bounds.minY - padding &&
        y <= bounds.maxY + padding
      );
    }

    function stepCount(sceneLength, maxSteps, minSteps) {
      const screenSteps = Math.ceil((sceneLength * zoom) / 3);
      const cap = Math.max(minSteps, Math.round(maxSteps * sampleScale));
      return Math.max(minSteps, Math.min(cap, screenSteps));
    }

    function effectiveSpacing(spacing) {
      return Math.max(spacing, MIN_SCREEN_SPACING / zoom);
    }

    // `visit(emit)` calls `emit(x, y)` for every dot centre. Each dot is its
    // own single-circle fill: Chrome rasterizes those on a fast oval path,
    // while one path holding many circles is ~3x slower. Glow adds two larger
    // translucent passes instead of shadowBlur.
    function drawDots(ctx, color, radius, glow, alpha, visit) {
      dotCenters.length = 0;
      visit((x, y) => dotCenters.push(x, y));
      if (!dotCenters.length) return;

      ctx.fillStyle = color;
      const fillPass = (dotRadius, passAlpha) => {
        ctx.globalAlpha = passAlpha;
        for (let index = 0; index < dotCenters.length; index += 2) {
          ctx.beginPath();
          ctx.arc(dotCenters[index], dotCenters[index + 1], dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      if (glow > 0) {
        fillPass(radius + glow * 0.75, alpha * 0.1);
        fillPass(radius + glow * 0.4, alpha * 0.2);
      }
      fillPass(radius, alpha);
    }

    function drawBucketStrokes(ctx, color, glow, levelFor) {
      ctx.strokeStyle = color;
      for (let index = 0; index < buckets.length; index++) {
        const bucket = buckets[index];
        if (!bucket.used) continue;
        const level = levelFor(index);
        if (level.alpha <= 0.01) continue;
        tracePolylines(ctx, bucket.coords);
        strokeWithGlow(ctx, level.alpha * baseAlpha, level.width, glow);
      }
    }

    // --- Styles ---

    function drawParticles(ctx, el, geometry, offset, config, context) {
      const radius = Math.max(1.5, context.strokeWidth * 0.85 * context.size);
      const spacing = effectiveSpacing(config.particleSpacing || 50);
      const cursor = Core.createPathCursor(geometry);
      const padding = radius + context.glow;
      drawDots(ctx, context.color, radius, context.glow, baseAlpha, (emit) => {
        for (let d = positiveModulo(offset, spacing); d < geometry.totalLength; d += spacing) {
          cursor.at(d, point);
          if (inView(point.x, point.y, padding)) emit(point.x, point.y);
        }
      });
    }

    function drawDashes(ctx, el, geometry, offset, config, context) {
      const width = (context.strokeWidth + 0.8) * context.size;
      const dashSize = Math.max(4, 8 * context.size, MIN_SCREEN_SPACING / zoom);
      ctx.strokeStyle = context.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([dashSize, dashSize]);
      ctx.lineDashOffset = -offset;

      if (!geometry.path && typeof Path2D !== 'undefined') {
        geometry.path = new Path2D();
        const firstPoint = geometry.segments[0].start;
        geometry.path.moveTo(firstPoint.x, firstPoint.y);
        for (const segment of geometry.segments) geometry.path.lineTo(segment.end.x, segment.end.y);
      }

      const stroke = (alpha, lineWidth) => {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lineWidth;
        if (geometry.path) {
          ctx.stroke(geometry.path);
        } else {
          ctx.beginPath();
          const firstPoint = geometry.segments[0].start;
          ctx.moveTo(firstPoint.x, firstPoint.y);
          for (const segment of geometry.segments) ctx.lineTo(segment.end.x, segment.end.y);
          ctx.stroke();
        }
      };
      if (context.glow > 0) stroke(baseAlpha * HALO_ALPHA, width + context.glow * HALO_SPREAD);
      stroke(baseAlpha, width);
      ctx.setLineDash([]);
    }

    function drawGradientPulse(ctx, el, geometry, offset, config, context) {
      const totalLength = geometry.totalLength;
      const width = (context.strokeWidth + 2) * context.size;
      const sweepLength = 80 * context.size;
      const sweepSpacing = Math.max(sweepLength + 20, (config.particleSpacing || 50) * 2);
      const steps = stepCount(sweepLength, 20, 4);
      const stepLength = sweepLength / steps;
      const cursor = Core.createPathCursor(geometry);
      const padding = width + context.glow;

      resetBuckets(buckets);
      for (let start = positiveModulo(offset * 1.5, sweepSpacing); start < totalLength + sweepLength; start += sweepSpacing) {
        for (let index = 0; index < steps; index++) {
          const d1 = start + index * stepLength;
          const d2 = d1 + stepLength;
          if (d1 > totalLength || d2 < 0) continue;
          const alpha = Math.sin((index / steps) * Math.PI) * 0.85;
          if (alpha <= 0.01) continue;

          cursor.at(Math.max(0, Math.min(d1, totalLength)), previous);
          cursor.at(Math.max(0, Math.min(d2, totalLength)), point);
          if (!inView(previous.x, previous.y, padding) && !inView(point.x, point.y, padding)) continue;
          const bucket = Math.min(BUCKET_COUNT - 1, Math.round((alpha / 0.85) * (BUCKET_COUNT - 1)));
          pushSegment(buckets[bucket], previous.x, previous.y, point.x, point.y);
        }
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawBucketStrokes(ctx, context.color, context.glow, (index) => ({
        alpha: Math.max(0.12, index / (BUCKET_COUNT - 1)) * 0.85,
        width
      }));
    }

    function drawRippleWave(ctx, el, geometry, offset, config, context) {
      const spacing = effectiveSpacing(config.particleSpacing || 50);
      const maxRadius = (8 + context.strokeWidth * 2) * context.size;
      const cursor = Core.createPathCursor(geometry);
      const padding = maxRadius + context.glow;
      ctx.strokeStyle = context.color;

      // Every ripple shares the same phase, so each ring index is one batch.
      for (let ring = 0; ring < 3; ring++) {
        const phase = ((offset * 0.06) + ring * 0.33) % 1;
        const normalizedPhase = phase < 0 ? phase + 1 : phase;
        const radius = normalizedPhase * maxRadius;
        const alpha = (1 - normalizedPhase) * 0.6;
        if (alpha <= 0.02 || radius <= 0) continue;

        ctx.beginPath();
        let any = false;
        for (let d = positiveModulo(offset * 0.8, spacing); d < geometry.totalLength; d += spacing) {
          cursor.at(d, point);
          if (!inView(point.x, point.y, padding)) continue;
          ctx.moveTo(point.x + radius, point.y);
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
          any = true;
        }
        if (!any) continue;
        const width = Math.max(1, context.strokeWidth * 0.4 * context.size * (1 - normalizedPhase));
        strokeWithGlow(ctx, alpha * baseAlpha, width, context.glow * alpha);
      }
    }

    function drawPacketTrain(ctx, el, geometry, offset, config, context) {
      const spacing = effectiveSpacing(config.particleSpacing || 50);
      const packetLength = 10 * context.size;
      const packetWidth = (context.strokeWidth + 2) * context.size;
      const cursor = Core.createPathCursor(geometry);
      const padding = packetLength + context.glow;
      // Chevron outline in local space, rotated by the segment direction.
      const local = [
        packetLength / 2, 0,
        -packetLength / 2, -packetWidth / 2,
        -packetLength / 4, 0,
        -packetLength / 2, packetWidth / 2
      ];

      ctx.beginPath();
      let any = false;
      for (let d = positiveModulo(offset * 1.2, spacing); d < geometry.totalLength; d += spacing) {
        cursor.at(d, point);
        if (!inView(point.x, point.y, padding)) continue;
        const cos = point.dx;
        const sin = point.dy;
        for (let index = 0; index < local.length; index += 2) {
          const x = point.x + local[index] * cos - local[index + 1] * sin;
          const y = point.y + local[index] * sin + local[index + 1] * cos;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        any = true;
      }
      if (!any) return;

      if (context.glow > 0) {
        ctx.strokeStyle = context.color;
        ctx.lineJoin = 'round';
        ctx.globalAlpha = baseAlpha * HALO_ALPHA;
        ctx.lineWidth = context.glow * HALO_SPREAD;
        ctx.stroke();
      }
      ctx.globalAlpha = baseAlpha;
      ctx.fillStyle = context.color;
      ctx.fill();
    }

    // Comet tails: tapered trails that fade toward the tail.
    // `headDistance` walks forward; each trail is sampled tail -> head so the
    // cursor only ever moves forward.
    function collectTaperedTrails(geometry, offsetDistance, trailLength, trailSpacing, steps, padding) {
      const totalLength = geometry.totalLength;
      const stepLength = trailLength / steps;
      const cursor = Core.createPathCursor(geometry);
      resetBuckets(buckets);

      for (let head = offsetDistance; head < totalLength + trailLength; head += trailSpacing) {
        let hasPrevious = false;
        for (let sample = steps; sample >= 0; sample--) {
          const distance = head - sample * stepLength;
          if (distance > totalLength + stepLength) break;
          cursor.at(Math.max(0, Math.min(distance, totalLength)), point);
          if (hasPrevious && sample < steps) {
            // Segment between samples (sample + 1) and sample.
            const farDistance = distance - stepLength;
            const segmentIndex = sample;
            if (!(distance < 0 || farDistance > totalLength) && segmentIndex < steps) {
              if (inView(previous.x, previous.y, padding) || inView(point.x, point.y, padding)) {
                const strength = 1 - segmentIndex / steps;
                const bucket = Math.min(BUCKET_COUNT - 1, Math.floor(strength * BUCKET_COUNT));
                pushSegment(buckets[bucket], previous.x, previous.y, point.x, point.y);
              }
            }
          }
          previous.x = point.x;
          previous.y = point.y;
          hasPrevious = true;
        }
      }
    }

    function bucketStrength(index) {
      return (index + 0.5) / BUCKET_COUNT;
    }

    function drawComet(ctx, el, geometry, offset, config, context) {
      const spacing = Math.max(70, (config.particleSpacing || 50) * 2.5, MIN_SCREEN_SPACING * 4 / zoom);
      const tailLength = Math.min(120 * context.size, spacing * 0.72);
      const steps = stepCount(tailLength, 24, 5);
      const maxWidth = (context.strokeWidth + 3) * context.size;
      const headOffset = positiveModulo(offset * 1.45, spacing);
      collectTaperedTrails(geometry, headOffset, tailLength, spacing, steps, maxWidth + context.glow);

      ctx.lineCap = 'round';
      drawBucketStrokes(ctx, context.color, context.glow, (index) => {
        const strength = bucketStrength(index);
        return { alpha: strength * strength * 0.8, width: Math.max(0.7, maxWidth * strength) };
      });

      const headRadius = Math.max(2, (context.strokeWidth + 1.5) * context.size);
      const cursor = Core.createPathCursor(geometry);
      drawDots(ctx, context.color, headRadius, context.glow * 1.8, baseAlpha, (emit) => {
        for (let head = headOffset; head <= geometry.totalLength; head += spacing) {
          cursor.at(head, point);
          if (inView(point.x, point.y, headRadius + context.glow * 1.8)) emit(point.x, point.y);
        }
      });
    }

    function drawFlowWave(ctx, el, geometry, offset, config, context) {
      const length = geometry.totalLength;
      const wavelength = Math.max(24, config.particleSpacing || 50);
      const amplitude = (3 + context.strokeWidth * 1.5) * context.size;
      const sampleDistance = Math.max(sampleScale < 1 ? 6 : 4, 2 / zoom);
      const cursor = Core.createPathCursor(geometry);
      const padding = amplitude + context.glow;

      ctx.beginPath();
      let drawing = false;
      let any = false;
      for (let distance = 0; distance <= length + sampleDistance; distance += sampleDistance) {
        const clamped = Math.min(distance, length);
        cursor.at(clamped, point);
        if (!inView(point.x, point.y, padding)) {
          drawing = false;
          if (clamped >= length) break;
          continue;
        }
        const displacement = Math.sin((clamped - offset * 1.5) * Math.PI * 2 / wavelength) * amplitude;
        const x = point.x - point.dy * displacement;
        const y = point.y + point.dx * displacement;
        if (!drawing) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        drawing = true;
        any = true;
        if (clamped >= length) break;
      }
      if (!any) return;

      ctx.strokeStyle = context.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokeWithGlow(ctx, baseAlpha, Math.max(1, context.strokeWidth * 0.75 * context.size), context.glow);
    }

    function drawDualFlow(ctx, el, geometry, offset, config, context) {
      const length = geometry.totalLength;
      const spacing = effectiveSpacing(Math.max(24, config.particleSpacing || 50));
      const radius = Math.max(1.5, context.strokeWidth * 0.8 * context.size);
      const phase = positiveModulo(offset, spacing);
      const laneOffset = radius * 1.5;
      const padding = radius + laneOffset + context.glow;

      // Forward lane: filled dots.
      let cursor = Core.createPathCursor(geometry);
      drawDots(ctx, context.color, radius, context.glow, baseAlpha, (emit) => {
        for (let distance = phase; distance < length; distance += spacing) {
          cursor.at(distance, point);
          if (!inView(point.x, point.y, padding)) continue;
          emit(point.x - point.dy * laneOffset, point.y + point.dx * laneOffset);
        }
      });

      // Reverse lane: hollow rings.
      cursor = Core.createPathCursor(geometry);
      ctx.beginPath();
      let any = false;
      for (let distance = (spacing - phase + spacing / 2) % spacing; distance < length; distance += spacing) {
        cursor.at(distance, point);
        if (!inView(point.x, point.y, padding)) continue;
        const x = point.x + point.dy * laneOffset;
        const y = point.y - point.dx * laneOffset;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        any = true;
      }
      if (!any) return;
      ctx.strokeStyle = context.color;
      strokeWithGlow(ctx, baseAlpha, Math.max(1, radius * 0.6), context.glow * 0.6);
    }

    const RENDERERS = {
      particles: drawParticles,
      dashes: drawDashes,
      gradient: drawGradientPulse,
      ripple: drawRippleWave,
      train: drawPacketTrain,
      comet: drawComet,
      wave: drawFlowWave,
      dual: drawDualFlow
    };

    // Draws one animated element. `view` = { zoom, bounds, sampleScale }.
    // Returns false when the element was skipped by level-of-detail rules.
    function draw(ctx, element, geometry, offset, config, view = {}) {
      if (!geometry || !(geometry.totalLength > 0) || !geometry.segments.length) return false;
      zoom = Math.max(0.01, view.zoom || 1);
      sampleScale = view.sampleScale || 1;
      bounds = view.bounds || null;

      const elementBounds = geometry.bounds;
      if (elementBounds) {
        const screenSize = Math.max(
          elementBounds.maxX - elementBounds.minX,
          elementBounds.maxY - elementBounds.minY
        ) * zoom;
        if (screenSize < MIN_SCREEN_SIZE) return false;
      }

      const opacity = element && typeof element.opacity === 'number' ? element.opacity / 100 : 1;
      baseAlpha = Math.max(0, Math.min(1, opacity));
      if (baseAlpha <= 0) return false;

      const glowPixels = zoom >= MIN_GLOW_ZOOM ? getGlowPixels(config) : 0;
      const context = {
        // A per-effect colour overrides the element's stroke colour.
        color: (config && config.color) || (element && element.strokeColor) || '#1e1e1e',
        strokeWidth: (element && element.strokeWidth) || 2,
        size: ((config && config.particleSize) || 3) / 3,
        // Glow keeps a constant on-screen size, like the old shadowBlur did.
        glow: glowPixels / quantizeLog2(zoom, 2, 0.05, 32)
      };

      const renderer = RENDERERS[config && config.style] || drawParticles;
      ctx.save();
      renderer(ctx, element, geometry, offset, config || {}, context);
      ctx.restore();
      return true;
    }

    return { draw };
  }

  return Object.freeze({
    STYLES: Object.freeze([
      'particles', 'dashes', 'gradient', 'ripple', 'train',
      'comet', 'wave', 'dual'
    ]),
    GLOW_PIXELS,
    getGlowPixels,
    createFlowRenderer
  });
});
