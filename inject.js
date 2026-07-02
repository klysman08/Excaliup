// ExcaliGif injected script
// Runs in the main context of the page to access React Fiber internals and the Canvas imageCache

(function() {
  console.log("[ExcaliGif] Inject script loaded.");

  let currentApp = null;
  let isEnabled = true; // Enabled by default
  const activeGifs = new Map(); // fileId -> GifPlayer instance

  const currentSettings = {
    gifsEnabled: true,
    flowEnabled: true,
    flowStyle: 'particles',
    flowSpeed: 'medium',
    particleSize: 3,
    particleSpacing: 50,
    glowIntensity: 'medium',
    flowDirection: 'forward',
    gifSpeed: 1
  };

  let overlayAnimationFrameId = null;
  let flowOffset = 0;

  // Per-element animation assignments: elementId -> { style: string }
  const animatedElements = new Map();
  let toolbarElement = null;
  let lastSelectedId = null;

  // Load animated elements from localStorage
  try {
    const saved = localStorage.getItem('excaligif_animated_elements');
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const [id, config] of Object.entries(parsed)) {
        animatedElements.set(id, config);
      }
    }
  } catch (e) {
    console.error("[ExcaliGif] Error loading animated elements:", e);
  }

  function saveAnimatedElements() {
    try {
      const obj = {};
      for (const [id, config] of animatedElements.entries()) {
        obj[id] = config;
      }
      localStorage.setItem('excaligif_animated_elements', JSON.stringify(obj));
    } catch (e) {}
  }

  // Load settings from localStorage if available
  try {
    const saved = localStorage.getItem('excaligif_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(currentSettings, parsed);
      isEnabled = currentSettings.gifsEnabled;
    }
  } catch (e) {
    console.error("[ExcaliGif] Error loading saved settings:", e);
  }


  class GifPlayer {
    constructor(fileId, cacheEntry, app) {
      this.fileId = fileId;
      this.cacheEntry = cacheEntry;
      this.app = app;
      
      this.originalImage = cacheEntry.image;
      this.width = 0;
      this.height = 0;
      this.frames = [];
      this.currentFrameIdx = 0;
      this.timer = null;
      this.activeCanvas = null;
      this.activeCtx = null;
      this.isLoaded = false;
      this.isDestroyed = false;
      
      this.loadPromise = this.init();
    }
    
    async init() {
      const src = this.originalImage.src;
      // Skip empty, invalid, or standard transparent 1x1 GIF placeholder sources
      if (!src || src.startsWith('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')) {
        console.log("[ExcaliGif] Skipping empty/placeholder image source for fileId:", this.fileId);
        return;
      }
      this.lastSrc = src;
      
      try {
        // Reset player state in case of re-initialization
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        this.frames = [];
        this.currentFrameIdx = 0;
        this.isLoaded = false;
        
        console.log("[ExcaliGif] Fetching GIF data for fileId:", this.fileId, "src:", src.substring(0, 100));
        const response = await fetch(src);
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        // window.GifReader is loaded by omggif.js in the page scope
        if (typeof window.GifReader === 'undefined' && typeof GifReader === 'undefined') {
          throw new Error("GifReader is not defined in the scope.");
        }
        const ReaderClass = typeof window.GifReader !== 'undefined' ? window.GifReader : GifReader;
        const reader = new ReaderClass(bytes);
        this.width = reader.width;
        this.height = reader.height;
        
        const numFrames = reader.numFrames();
        console.log(`[ExcaliGif] Decoding GIF: ${this.width}x${this.height}, ${numFrames} frames`);
        if (numFrames <= 0) return;
        
        const accumBuffer = new Uint8ClampedArray(this.width * this.height * 4);
        let backupBuffer = null;
        
        for (let i = 0; i < numFrames; i++) {
          const info = reader.frameInfo(i);
          
          // 1. Handle disposal of previous frame
          if (i > 0) {
            const prevInfo = reader.frameInfo(i - 1);
            if (prevInfo.disposal === 2) {
              // Restore to background (clear the subrect to transparent)
              for (let y = prevInfo.y; y < prevInfo.y + prevInfo.height; y++) {
                for (let x = prevInfo.x; x < prevInfo.x + prevInfo.width; x++) {
                  const idx = (y * this.width + x) * 4;
                  accumBuffer[idx] = 0;
                  accumBuffer[idx + 1] = 0;
                  accumBuffer[idx + 2] = 0;
                  accumBuffer[idx + 3] = 0;
                }
              }
            } else if (prevInfo.disposal === 3 && backupBuffer) {
              // Restore to state before previous frame
              accumBuffer.set(backupBuffer);
            }
          }
          
          // 2. Backup buffer before drawing current frame if its disposal is 3
          if (info.disposal === 3) {
            if (!backupBuffer) {
              backupBuffer = new Uint8ClampedArray(this.width * this.height * 4);
            }
            backupBuffer.set(accumBuffer);
          }
          
          // 3. Decode frame pixels directly into the accumulated buffer
          reader.decodeAndBlitFrameRGBA(i, accumBuffer);
          
          // 4. Draw accumBuffer onto a frame canvas
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = this.width;
          frameCanvas.height = this.height;
          const frameCtx = frameCanvas.getContext('2d');
          const imgData = frameCtx.createImageData(this.width, this.height);
          imgData.data.set(accumBuffer);
          frameCtx.putImageData(imgData, 0, 0);
          
          // Delay is in hundredths of a second (10ms)
          const baseDelay = info.delay * 10 || 100; // default to 100ms
          
          this.frames.push({
            image: frameCanvas,
            delay: baseDelay
          });
        }
        
        // Setup active canvas that Excalidraw draws
        this.activeCanvas = document.createElement('canvas');
        this.activeCanvas.width = this.width;
        this.activeCanvas.height = this.height;
        
        // Mock standard HTMLImageElement properties
        Object.defineProperties(this.activeCanvas, {
          tagName: { value: 'IMG' },
          complete: { value: true },
          naturalWidth: { value: this.width },
          naturalHeight: { value: this.height }
        });
        
        this.activeCtx = this.activeCanvas.getContext('2d');
        this.isLoaded = true;
        
        if (isEnabled) {
          this.start();
        }
      } catch (e) {
        console.error("[ExcaliGif] Error initializing player for fileId " + this.fileId, e);
      }
    }
    
    start() {
      if (this.isDestroyed || !this.isLoaded) return;
      
      // Swap out the image in Excalidraw cache
      this.cacheEntry.image = this.activeCanvas;
      
      // Clear any previous loop
      if (this.timer) clearTimeout(this.timer);
      
      this.tick();
    }
    
    tick() {
      if (this.isDestroyed || !isEnabled) return;
      
      const frame = this.frames[this.currentFrameIdx];
      this.activeCtx.clearRect(0, 0, this.width, this.height);
      this.activeCtx.drawImage(frame.image, 0, 0);
      
      // Force Excalidraw element cache refresh by updating element version immutably
      if (this.app.api) {
        const elements = this.app.api.getSceneElements();
        let changed = false;
        
        const newElements = elements.map(el => {
          if (el.type === 'image' && el.fileId === this.fileId) {
            changed = true;
            return {
              ...el,
              version: el.version + 1,
              updated: Date.now()
            };
          }
          return el;
        });
        
        if (changed) {
          this.app.api.updateScene({ elements: newElements });
        }
      }
      
      this.app.triggerRender(true);
      
      this.currentFrameIdx = (this.currentFrameIdx + 1) % this.frames.length;
      // Apply GIF playback speed multiplier
      const speedMultiplier = currentSettings.gifSpeed || 1;
      const adjustedDelay = Math.max(10, Math.round(frame.delay / speedMultiplier));
      this.timer = setTimeout(() => this.tick(), adjustedDelay);
    }
    
    stop() {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      // Restore original static image
      this.cacheEntry.image = this.originalImage;
    }
    
    destroy() {
      this.isDestroyed = true;
      this.stop();
    }
  }

  // Traverse DOM up to find Excalidraw class instance
  function findExcalidrawInstance() {
    const canvas = document.querySelector('.excalidraw__canvas.interactive');
    if (!canvas) return null;
    const key = Object.keys(canvas).find(k => k.startsWith('__reactFiber$'));
    if (!key) return null;
    let fiber = canvas[key];
    while (fiber) {
      if (fiber.stateNode && !(fiber.stateNode instanceof HTMLElement) && !(fiber.stateNode instanceof Window)) {
        if (fiber.stateNode.imageCache) {
          return fiber.stateNode;
        }
      }
      fiber = fiber.return;
    }
    return null;
  }

  function hookImageCache(app) {
    if (app.imageCache && !app.imageCache.isHookedByExcaliGif) {
      app.imageCache.isHookedByExcaliGif = true;
      const originalSet = app.imageCache.set;
      
      app.imageCache.set = function(fileId, cacheEntry) {
        const res = originalSet.apply(this, arguments);
        if (cacheEntry && cacheEntry.mimeType === 'image/gif') {
          if (!activeGifs.has(fileId)) {
            console.log("[ExcaliGif] Hooked new GIF fileId:", fileId);
            activeGifs.set(fileId, new GifPlayer(fileId, cacheEntry, app));
          } else {
            const player = activeGifs.get(fileId);
            player.cacheEntry = cacheEntry;
            
            // Check if the image source changed from the placeholder to a real URL
            if (cacheEntry.image && cacheEntry.image.src && cacheEntry.image.src !== player.lastSrc) {
              console.log("[ExcaliGif] Image source changed for fileId:", fileId, ". Re-initializing...");
              player.originalImage = cacheEntry.image;
              player.init();
            }
            
            if (isEnabled && player.activeCanvas) {
              cacheEntry.image = player.activeCanvas;
            }
          }
        }
        return res;
      };
      
      // Scan existing GIF cache entries
      for (const [fileId, cacheEntry] of app.imageCache.entries()) {
        if (cacheEntry && cacheEntry.mimeType === 'image/gif' && !activeGifs.has(fileId)) {
          console.log("[ExcaliGif] Hooked existing GIF fileId:", fileId);
          activeGifs.set(fileId, new GifPlayer(fileId, cacheEntry, app));
        }
      }
    }
  }

  function scanAndCleanupGifs() {
    if (!currentApp) return;
    const elements = currentApp.api ? currentApp.api.getSceneElements() : [];
    const activeFileIds = new Set(elements.filter(e => e.type === 'image').map(e => e.fileId));
    
    for (const [fileId, player] of activeGifs.entries()) {
      const cacheEntry = currentApp.imageCache.get(fileId);
      if (!activeFileIds.has(fileId) || !cacheEntry) {
        console.log("[ExcaliGif] Cleaning up player for fileId:", fileId);
        player.destroy();
        activeGifs.delete(fileId);
      }
    }
    
    // Clean up animated element entries for deleted elements
    const sceneIds = new Set(elements.filter(e => !e.isDeleted).map(e => e.id));
    let cleaned = false;
    for (const elId of animatedElements.keys()) {
      if (!sceneIds.has(elId)) {
        animatedElements.delete(elId);
        cleaned = true;
      }
    }
    if (cleaned) saveAnimatedElements();
  }

  function checkInstance() {
    const app = findExcalidrawInstance();
    if (app && app !== currentApp) {
      console.log("[ExcaliGif] Hooked Excalidraw instance!");
      currentApp = app;
      hookImageCache(app);
      
      // Create the in-canvas animation toolbar
      createToolbar();
      
      // Start flow overlay loop if enabled and there are animated elements
      if (isEnabled && currentSettings.flowEnabled && animatedElements.size > 0) {
        startOverlayLoop();
      }
    }
    scanAndCleanupGifs();
  }

  // Helper functions for path and flow animations
  function shouldAnimateElement(el) {
    if (el.isDeleted) return false;
    // Only animate elements explicitly assigned via the in-canvas toolbar
    return animatedElements.has(el.id);
  }

  function getPathPoints(el) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const p of el.points) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    
    const centerX = el.x + (minX + maxX) / 2;
    const centerY = el.y + (minY + maxY) / 2;
    
    const cos = el.angle ? Math.cos(el.angle) : 1;
    const sin = el.angle ? Math.sin(el.angle) : 0;
    
    return el.points.map(p => {
      const ux = el.x + p[0];
      const uy = el.y + p[1];
      if (el.angle) {
        const rx = ux - centerX;
        const ry = uy - centerY;
        return {
          x: centerX + (rx * cos - ry * sin),
          y: centerY + (rx * sin + ry * cos)
        };
      } else {
        return { x: ux, y: uy };
      }
    });
  }

  function getPathGeometry(absPoints) {
    const segments = [];
    let totalLength = 0;
    
    for (let i = 0; i < absPoints.length - 1; i++) {
      const p1 = absPoints[i];
      const p2 = absPoints[i+1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      segments.push({
        start: p1,
        end: p2,
        length: length,
        dx: length > 0 ? dx / length : 0,
        dy: length > 0 ? dy / length : 0
      });
      totalLength += length;
    }
    
    return { segments, totalLength };
  }

  function getPointAtLength(geometry, dist) {
    if (geometry.totalLength === 0 || geometry.segments.length === 0) {
      return { x: 0, y: 0, dx: 0, dy: 0 };
    }
    
    let d = dist % geometry.totalLength;
    if (d < 0) d += geometry.totalLength;
    
    let accumulated = 0;
    for (const seg of geometry.segments) {
      if (accumulated + seg.length >= d) {
        const t = seg.length > 0 ? (d - accumulated) / seg.length : 0;
        return {
          x: seg.start.x + t * (seg.end.x - seg.start.x),
          y: seg.start.y + t * (seg.end.y - seg.start.y),
          dx: seg.dx,
          dy: seg.dy
        };
      }
      accumulated += seg.length;
    }
    
    const lastSeg = geometry.segments[geometry.segments.length - 1];
    return { x: lastSeg.end.x, y: lastSeg.end.y, dx: lastSeg.dx, dy: lastSeg.dy };
  }

  const DEFAULT_ELEMENT_CONFIG = {
    speed: 'medium',
    direction: 'forward',
    particleSize: 3,
    particleSpacing: 50,
    glowIntensity: 'medium'
  };

  function getElementConfig(elId) {
    const elConfig = animatedElements.get(elId) || {};
    return {
      style: elConfig.style || 'particles',
      speed: elConfig.speed || DEFAULT_ELEMENT_CONFIG.speed,
      direction: elConfig.direction || DEFAULT_ELEMENT_CONFIG.direction,
      particleSize: elConfig.particleSize !== undefined ? elConfig.particleSize : DEFAULT_ELEMENT_CONFIG.particleSize,
      particleSpacing: elConfig.particleSpacing !== undefined ? elConfig.particleSpacing : DEFAULT_ELEMENT_CONFIG.particleSpacing,
      glowIntensity: elConfig.glowIntensity || DEFAULT_ELEMENT_CONFIG.glowIntensity
    };
  }

  function getElementOffset(config, globalOffset) {
    let speed = 2; // medium
    if (config.speed === 'slow') speed = 0.8;
    if (config.speed === 'fast') speed = 4;
    
    const direction = config.direction || 'forward';
    if (direction === 'reverse') {
      return -globalOffset * speed;
    } else if (direction === 'bounce') {
      const travel = (globalOffset * speed) % 400;
      if (travel < 200) {
        return travel;
      } else {
        return 400 - travel;
      }
    } else {
      return globalOffset * speed;
    }
  }

  function startOverlayLoop() {
    if (overlayAnimationFrameId) return;
    
    let lastTime = 0;
    
    function step(timestamp) {
      if (!lastTime) lastTime = timestamp;
      const dt = timestamp - lastTime;
      lastTime = timestamp;
      
      // Increment offset monotonically based on elapsed time
      flowOffset += (dt / 16.666);
      
      drawOverlay(flowOffset);
      
      overlayAnimationFrameId = requestAnimationFrame(step);
    }
    
    overlayAnimationFrameId = requestAnimationFrame(step);
  }

  function stopOverlayLoop() {
    if (overlayAnimationFrameId) {
      cancelAnimationFrame(overlayAnimationFrameId);
      overlayAnimationFrameId = null;
    }
    // Clear overlay canvas
    const overlayCanvas = document.getElementById('ExcaliGifOverlayCanvas');
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d');
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
  }

  function drawOverlay(offset) {
    const interactiveCanvas = document.querySelector('.excalidraw__canvas.interactive');
    if (!interactiveCanvas || !currentApp || !isEnabled || !currentSettings.flowEnabled) {
      const overlayCanvas = document.getElementById('ExcaliGifOverlayCanvas');
      if (overlayCanvas) {
        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      }
      return;
    }
    
    let overlayCanvas = document.getElementById('ExcaliGifOverlayCanvas');
    if (!overlayCanvas) {
      overlayCanvas = document.createElement('canvas');
      overlayCanvas.id = 'ExcaliGifOverlayCanvas';
      overlayCanvas.style.position = 'absolute';
      overlayCanvas.style.top = '0';
      overlayCanvas.style.left = '0';
      overlayCanvas.style.pointerEvents = 'none';
      interactiveCanvas.parentNode.insertBefore(overlayCanvas, interactiveCanvas.nextSibling);
      
      if (interactiveCanvas.parentNode && window.getComputedStyle(interactiveCanvas.parentNode).position === 'static') {
        interactiveCanvas.parentNode.style.position = 'relative';
      }
    }
    
    const width = interactiveCanvas.clientWidth;
    const height = interactiveCanvas.clientHeight;
    if (overlayCanvas.width !== width * window.devicePixelRatio || overlayCanvas.height !== height * window.devicePixelRatio) {
      overlayCanvas.width = width * window.devicePixelRatio;
      overlayCanvas.height = height * window.devicePixelRatio;
      overlayCanvas.style.width = `${width}px`;
      overlayCanvas.style.height = `${height}px`;
    }
    
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    ctx.save();
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const zoomVal = currentApp.state.zoom ? currentApp.state.zoom.value : 1;
    const scrollXVal = currentApp.state.scrollX || 0;
    const scrollYVal = currentApp.state.scrollY || 0;
    
    ctx.scale(zoomVal, zoomVal);
    ctx.translate(scrollXVal, scrollYVal);
    
    let elements = [];
    if (currentApp.api) {
      elements = currentApp.api.getSceneElements();
    }
    
    for (const el of elements) {
      if (shouldAnimateElement(el)) {
        const absPoints = getPathPoints(el);
        const geometry = getPathGeometry(absPoints);
        
        if (geometry.totalLength > 0) {
          const config = getElementConfig(el.id);
          const elOffset = getElementOffset(config, offset);
          
          switch (config.style) {
            case 'particles':
              drawParticles(ctx, el, geometry, elOffset, config);
              break;
            case 'dashes':
              drawDashes(ctx, el, geometry, elOffset, config);
              break;
            case 'gradient':
              drawGradientPulse(ctx, el, geometry, elOffset, config);
              break;
            case 'ripple':
              drawRippleWave(ctx, el, geometry, elOffset, config);
              break;
            case 'train':
              drawPacketTrain(ctx, el, geometry, elOffset, config);
              break;
            case 'snake':
              drawSnakeTrail(ctx, el, geometry, elOffset, config);
              break;
            default:
              drawParticles(ctx, el, geometry, elOffset, config);
          }
        }
      }
    }
    
    ctx.restore();
  }

  function getGlowBlur(config) {
    const intensity = config.glowIntensity || 'medium';
    switch (intensity) {
      case 'none': return 0;
      case 'subtle': return 3;
      case 'medium': return 6;
      case 'strong': return 14;
      default: return 6;
    }
  }

  function drawParticles(ctx, el, geometry, offset, config) {
    const strokeColor = el.strokeColor || '#1e1e1e';
    const strokeWidth = el.strokeWidth || 2;
    
    ctx.save();
    ctx.fillStyle = strokeColor;
    
    const glowBlur = getGlowBlur(config);
    if (glowBlur > 0) {
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = glowBlur;
    }
    
    const spacing = config.particleSpacing || 50;
    const sizeFactor = (config.particleSize || 3) / 3;
    const radius = Math.max(1.5, strokeWidth * 0.85 * sizeFactor);
    const totalLength = geometry.totalLength;
    
    let d = ((offset % spacing) + spacing) % spacing;
    while (d < totalLength) {
      const pt = getPointAtLength(geometry, d);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
      d += spacing;
    }
    
    ctx.restore();
  }

  function drawDashes(ctx, el, geometry, offset, config) {
    const strokeColor = el.strokeColor || '#1e1e1e';
    const strokeWidth = el.strokeWidth || 2;
    
    ctx.save();
    ctx.strokeStyle = strokeColor;
    const sizeFactor = (config.particleSize || 3) / 3;
    ctx.lineWidth = (strokeWidth + 0.8) * sizeFactor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const glowBlur = getGlowBlur(config);
    if (glowBlur > 0) {
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = glowBlur;
    }
    
    const dashSize = Math.max(4, 8 * sizeFactor);
    ctx.setLineDash([dashSize, dashSize]);
    ctx.lineDashOffset = -offset;
    
    ctx.beginPath();
    const firstPt = geometry.segments[0].start;
    ctx.moveTo(firstPt.x, firstPt.y);
    for (const seg of geometry.segments) {
      ctx.lineTo(seg.end.x, seg.end.y);
    }
    ctx.stroke();
    
    ctx.restore();
  }

  // ═══════════════════════════════════════════════
  // NEW ANIMATION STYLES
  // ═══════════════════════════════════════════════

  function drawGradientPulse(ctx, el, geometry, offset, config) {
    const strokeColor = el.strokeColor || '#1e1e1e';
    const strokeWidth = el.strokeWidth || 2;
    const totalLength = geometry.totalLength;
    if (totalLength === 0) return;
    
    ctx.save();
    const sizeFactor = (config.particleSize || 3) / 3;
    ctx.lineWidth = (strokeWidth + 2) * sizeFactor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const glowBlur = getGlowBlur(config);
    
    // Draw multiple gradient sweeps along the path
    const sweepLength = 80 * sizeFactor;
    const spacing = config.particleSpacing || 50;
    const sweepSpacing = Math.max(sweepLength + 20, spacing * 2);
    
    let startDist = ((offset * 1.5) % sweepSpacing);
    if (startDist < 0) startDist += sweepSpacing;
    
    while (startDist < totalLength + sweepLength) {
      // Draw a gradient segment
      const steps = 20;
      const stepLen = sweepLength / steps;
      
      for (let i = 0; i < steps; i++) {
        const d1 = startDist + i * stepLen;
        const d2 = startDist + (i + 1) * stepLen;
        
        if (d1 > totalLength || d2 < 0) continue;
        
        const clampD1 = Math.max(0, Math.min(d1, totalLength));
        const clampD2 = Math.max(0, Math.min(d2, totalLength));
        
        const pt1 = getPointAtLength(geometry, clampD1);
        const pt2 = getPointAtLength(geometry, clampD2);
        
        // Fade in at start, fade out at end of sweep
        const t = i / steps;
        const alpha = Math.sin(t * Math.PI) * 0.85;
        
        if (alpha <= 0.01) continue;
        
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = strokeColor;
        if (glowBlur > 0) {
          ctx.shadowColor = strokeColor;
          ctx.shadowBlur = glowBlur * alpha;
        }
        
        ctx.beginPath();
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.stroke();
      }
      
      startDist += sweepSpacing;
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawRippleWave(ctx, el, geometry, offset, config) {
    const strokeColor = el.strokeColor || '#1e1e1e';
    const strokeWidth = el.strokeWidth || 2;
    const totalLength = geometry.totalLength;
    if (totalLength === 0) return;
    
    ctx.save();
    const sizeFactor = (config.particleSize || 3) / 3;
    const glowBlur = getGlowBlur(config);
    const spacing = config.particleSpacing || 50;
    const maxRadius = (8 + strokeWidth * 2) * sizeFactor;
    
    // Place ripple centers along the path at intervals
    let d = ((offset * 0.8) % spacing + spacing) % spacing;
    while (d < totalLength) {
      const pt = getPointAtLength(geometry, d);
      
      // Each ripple has 3 expanding rings
      for (let ring = 0; ring < 3; ring++) {
        const phase = ((offset * 0.06) + ring * 0.33) % 1;
        const radius = phase * maxRadius;
        const alpha = (1 - phase) * 0.6;
        
        if (alpha <= 0.02) continue;
        
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(1, (strokeWidth * 0.4) * sizeFactor * (1 - phase));
        
        if (glowBlur > 0) {
          ctx.shadowColor = strokeColor;
          ctx.shadowBlur = glowBlur * alpha;
        }
        
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      d += spacing;
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawPacketTrain(ctx, el, geometry, offset, config) {
    const strokeColor = el.strokeColor || '#1e1e1e';
    const strokeWidth = el.strokeWidth || 2;
    const totalLength = geometry.totalLength;
    if (totalLength === 0) return;
    
    ctx.save();
    const sizeFactor = (config.particleSize || 3) / 3;
    const glowBlur = getGlowBlur(config);
    const spacing = config.particleSpacing || 50;
    
    ctx.fillStyle = strokeColor;
    if (glowBlur > 0) {
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = glowBlur;
    }
    
    const packetLen = 10 * sizeFactor;
    const packetWidth = (strokeWidth + 2) * sizeFactor;
    
    let d = ((offset * 1.2) % spacing + spacing) % spacing;
    while (d < totalLength) {
      const pt = getPointAtLength(geometry, d);
      const angle = Math.atan2(pt.dy, pt.dx);
      
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(angle);
      
      // Draw a chevron/arrow packet shape
      ctx.beginPath();
      ctx.moveTo(packetLen / 2, 0);
      ctx.lineTo(-packetLen / 2, -packetWidth / 2);
      ctx.lineTo(-packetLen / 4, 0);
      ctx.lineTo(-packetLen / 2, packetWidth / 2);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
      
      d += spacing;
    }
    
    ctx.restore();
  }

  function drawSnakeTrail(ctx, el, geometry, offset, config) {
    const strokeColor = el.strokeColor || '#1e1e1e';
    const strokeWidth = el.strokeWidth || 2;
    const totalLength = geometry.totalLength;
    if (totalLength === 0) return;
    
    ctx.save();
    const sizeFactor = (config.particleSize || 3) / 3;
    const glowBlur = getGlowBlur(config);
    const spacing = config.particleSpacing || 50;
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw tapered, fading trail segments
    const trailLength = spacing * 1.5;
    const trailSpacing = spacing * 2.5;
    const steps = 30;
    const stepLen = trailLength / steps;
    
    let startDist = ((offset * 1.3) % trailSpacing + trailSpacing) % trailSpacing;
    
    while (startDist < totalLength + trailLength) {
      for (let i = 0; i < steps - 1; i++) {
        const d1 = startDist - i * stepLen;
        const d2 = startDist - (i + 1) * stepLen;
        
        if (d1 < 0 || d2 > totalLength) continue;
        
        const clampD1 = Math.max(0, Math.min(d1, totalLength));
        const clampD2 = Math.max(0, Math.min(d2, totalLength));
        
        const pt1 = getPointAtLength(geometry, clampD1);
        const pt2 = getPointAtLength(geometry, clampD2);
        
        // Taper: head is thick, tail thins out
        const taper = 1 - (i / steps);
        const alpha = taper * 0.75;
        const width = Math.max(1, (strokeWidth + 2) * sizeFactor * taper);
        
        if (alpha <= 0.02) continue;
        
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = width;
        
        if (glowBlur > 0) {
          ctx.shadowColor = strokeColor;
          ctx.shadowBlur = glowBlur * taper;
        }
        
        ctx.beginPath();
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.stroke();
      }
      
      startDist += trailSpacing;
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ═══════════════════════════════════════════════
  // IN-CANVAS FLOATING TOOLBAR
  // ═══════════════════════════════════════════════

  const ANIMATION_STYLES = [
    { id: 'particles', label: 'Particles', icon: '●' },
    { id: 'dashes', label: 'Ants', icon: '⋯' },
    { id: 'gradient', label: 'Pulse', icon: '◐' },
    { id: 'ripple', label: 'Ripple', icon: '◎' },
    { id: 'train', label: 'Packet', icon: '▸▸' },
    { id: 'snake', label: 'Snake', icon: '∿' },
  ];

  let panelOpen = false;

  function injectToolbarStyles() {
    if (document.getElementById('excaligif-toolbar-styles')) return;

    if (!document.querySelector('link[href*="Outfit"]')) {
      const fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap';
      document.head.appendChild(fontLink);
    }

    const style = document.createElement('style');
    style.id = 'excaligif-toolbar-styles';
    style.textContent = `
      .excaligif-toolbar {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        user-select: none;
      }
      .excaligif-toolbar.visible {
        display: flex;
        animation: excaligif-fadeIn 0.2s ease-out;
      }
      @keyframes excaligif-fadeIn {
        from { opacity: 0; transform: translateX(-50%) translateY(8px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      
      /* Settings Panel above main toolbar */
      .excaligif-toolbar-panel {
        display: none;
        flex-direction: column;
        gap: 8px;
        background: rgba(18, 18, 26, 0.96);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(140, 90, 220, 0.25);
        border-radius: 14px;
        padding: 12px 14px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.45);
        animation: excaligif-slideUp 0.2s ease-out;
        width: 250px;
      }
      .excaligif-toolbar-panel.visible {
        display: flex;
      }
      @keyframes excaligif-slideUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .excaligif-panel-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .excaligif-panel-row > span {
        font-size: 10px;
        color: rgba(255,255,255,0.45);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        width: 65px;
      }
      
      /* Pill Button Selectors */
      .excaligif-pill-group {
        display: flex;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 8px;
        padding: 2px;
        flex: 1;
        justify-content: space-between;
      }
      .excaligif-pill-group button {
        background: none;
        border: none;
        color: rgba(255,255,255,0.5);
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        padding: 4px 6px;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.15s ease;
        outline: none;
        flex: 1;
        text-align: center;
      }
      .excaligif-pill-group button:hover {
        color: rgba(255,255,255,0.85);
      }
      .excaligif-pill-group button.active {
        background: rgba(140, 90, 220, 0.25);
        border: 1px solid rgba(140, 90, 220, 0.4);
        color: hsl(270, 75%, 70%);
      }
      
      /* Range Inputs */
      .excaligif-range-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
      }
      .excaligif-range-group input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        flex: 1;
        height: 3px;
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
        outline: none;
        cursor: pointer;
      }
      .excaligif-range-group input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 10px;
        height: 10px;
        background: hsl(270, 75%, 64%);
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 6px hsla(270, 75%, 64%, 0.5);
      }
      .excaligif-range-group span {
        font-size: 10px;
        font-weight: 600;
        color: hsl(270, 75%, 70%);
        min-width: 20px;
        text-align: right;
      }
      
      /* Main Toolbar Bar */
      .excaligif-toolbar-main {
        display: flex;
        align-items: center;
        gap: 3px;
        background: rgba(18, 18, 26, 0.92);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(140, 90, 220, 0.25);
        border-radius: 14px;
        padding: 5px 8px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.45), 0 0 16px rgba(140, 90, 220, 0.08);
      }
      .excaligif-toolbar-label {
        font-size: 11px;
        font-weight: 700;
        color: rgba(255,255,255,0.92);
        padding: 0 6px 0 4px;
        letter-spacing: -0.3px;
        white-space: nowrap;
      }
      .excaligif-toolbar-label span {
        color: hsl(270, 75%, 64%);
        text-shadow: 0 0 8px hsla(270, 75%, 64%, 0.3);
      }
      .excaligif-toolbar-divider {
        width: 1px;
        height: 20px;
        background: rgba(255,255,255,0.1);
        margin: 0 3px;
      }
      .excaligif-toolbar-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px 10px;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        background: rgba(255,255,255,0.04);
        color: rgba(255,255,255,0.6);
        font-family: inherit;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.18s ease;
        white-space: nowrap;
        outline: none;
      }
      .excaligif-toolbar-btn:hover {
        background: rgba(140, 90, 220, 0.15);
        border-color: rgba(140, 90, 220, 0.3);
        color: rgba(255,255,255,0.9);
      }
      .excaligif-toolbar-btn.active {
        background: hsl(270, 75%, 64%);
        border-color: hsl(270, 75%, 64%);
        color: #fff;
        box-shadow: 0 0 12px hsla(270, 75%, 64%, 0.35);
        font-weight: 600;
      }
      .excaligif-toolbar-btn.active:hover {
        background: hsl(270, 75%, 58%);
      }
      .excaligif-toolbar-btn.gear {
        padding: 5px 8px;
        font-size: 12px;
      }
      .excaligif-toolbar-btn.gear.active {
        background: rgba(140, 90, 220, 0.2);
        border-color: rgba(140, 90, 220, 0.4);
        color: hsl(270, 75%, 70%);
      }
      .excaligif-toolbar-btn.remove {
        color: rgba(255,255,255,0.35);
        padding: 5px 8px;
        margin-left: 1px;
      }
      .excaligif-toolbar-btn.remove:hover {
        background: rgba(220, 60, 60, 0.2);
        border-color: rgba(220, 60, 60, 0.35);
        color: hsl(0, 80%, 65%);
      }
      .excaligif-toolbar-icon {
        font-size: 12px;
        line-height: 1;
      }
    `;
    document.head.appendChild(style);
  }

  function createToolbar() {
    if (toolbarElement) return;
    injectToolbarStyles();

    const toolbar = document.createElement('div');
    toolbar.className = 'excaligif-toolbar';
    toolbar.id = 'excaligif-toolbar';

    // 1. Settings Panel
    const panel = document.createElement('div');
    panel.className = 'excaligif-toolbar-panel';
    panel.id = 'excaligif-toolbar-panel';

    // Speed Row
    panel.appendChild(createPillRow('Speed', 'speed', [
      { val: 'slow', label: 'Slow' },
      { val: 'medium', label: 'Med' },
      { val: 'fast', label: 'Fast' }
    ]));

    // Direction Row
    panel.appendChild(createPillRow('Direction', 'direction', [
      { val: 'forward', label: 'Forward' },
      { val: 'reverse', label: 'Reverse' },
      { val: 'bounce', label: 'Bounce' }
    ]));

    // Glow Row
    panel.appendChild(createPillRow('Glow', 'glowIntensity', [
      { val: 'none', label: 'None' },
      { val: 'subtle', label: 'Subtle' },
      { val: 'medium', label: 'Med' },
      { val: 'strong', label: 'Strong' }
    ]));

    // Size Slider Row
    panel.appendChild(createSliderRow('Size', 'excaligif-size-input', 'excaligif-size-val', 1, 5, 3, 1, 'particleSize'));

    // Spacing Slider Row
    panel.appendChild(createSliderRow('Spacing', 'excaligif-spacing-input', 'excaligif-spacing-val', 20, 120, 50, 5, 'particleSpacing'));

    toolbar.appendChild(panel);

    // 2. Main Bar
    const mainBar = document.createElement('div');
    mainBar.className = 'excaligif-toolbar-main';

    // Logo label
    const label = document.createElement('div');
    label.className = 'excaligif-toolbar-label';
    label.innerHTML = 'Excali<span>Gif</span>';
    mainBar.appendChild(label);

    // Divider
    const div1 = document.createElement('div');
    div1.className = 'excaligif-toolbar-divider';
    mainBar.appendChild(div1);

    // Style buttons
    for (const animStyle of ANIMATION_STYLES) {
      const btn = document.createElement('button');
      btn.className = 'excaligif-toolbar-btn';
      btn.dataset.style = animStyle.id;
      btn.innerHTML = '<span class="excaligif-toolbar-icon">' + animStyle.icon + '</span>' + animStyle.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onStyleButtonClick(animStyle.id);
      });
      mainBar.appendChild(btn);
    }

    // Divider
    const div2 = document.createElement('div');
    div2.className = 'excaligif-toolbar-divider';
    mainBar.appendChild(div2);

    // Gear button for tuning panel
    const gearBtn = document.createElement('button');
    gearBtn.className = 'excaligif-toolbar-btn gear';
    gearBtn.id = 'excaligif-gear-btn';
    gearBtn.textContent = '⚙️';
    gearBtn.title = 'Tune Animation';
    gearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      panelOpen = !panelOpen;
      updateToolbarPanelVisibility();
    });
    mainBar.appendChild(gearBtn);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'excaligif-toolbar-btn remove';
    removeBtn.dataset.style = 'remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove animation';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onRemoveClick();
    });
    mainBar.appendChild(removeBtn);

    toolbar.appendChild(mainBar);

    document.body.appendChild(toolbar);
    toolbarElement = toolbar;
  }

  function createPillRow(labelName, settingKey, options) {
    const row = document.createElement('div');
    row.className = 'excaligif-panel-row';
    
    const span = document.createElement('span');
    span.textContent = labelName;
    row.appendChild(span);
    
    const group = document.createElement('div');
    group.className = 'excaligif-pill-group';
    group.dataset.setting = settingKey;
    
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.dataset.val = opt.val;
      btn.textContent = opt.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        updateElementSetting(settingKey, opt.val);
      });
      group.appendChild(btn);
    });
    
    row.appendChild(group);
    return row;
  }

  function createSliderRow(labelName, inputId, valId, min, max, val, step, settingKey) {
    const row = document.createElement('div');
    row.className = 'excaligif-panel-row';
    
    const span = document.createElement('span');
    span.textContent = labelName;
    row.appendChild(span);
    
    const group = document.createElement('div');
    group.className = 'excaligif-range-group';
    
    const input = document.createElement('input');
    input.type = 'range';
    input.id = inputId;
    input.min = min;
    input.max = max;
    input.value = val;
    input.step = step;
    
    const valSpan = document.createElement('span');
    valSpan.id = valId;
    valSpan.textContent = val;
    
    input.addEventListener('input', (e) => {
      valSpan.textContent = e.target.value;
      updateElementSetting(settingKey, parseInt(e.target.value, 10));
    });
    
    group.appendChild(input);
    group.appendChild(valSpan);
    row.appendChild(group);
    return row;
  }

  function updateElementSetting(key, val) {
    const el = getSelectedAnimatableElement();
    if (!el) return;
    
    let config = animatedElements.get(el.id);
    if (!config) {
      config = { style: 'particles' };
      animatedElements.set(el.id, config);
    }
    
    config[key] = val;
    saveAnimatedElements();
    updateToolbar();
  }

  function updateToolbarPanelVisibility() {
    if (!toolbarElement) return;
    const panel = document.getElementById('excaligif-toolbar-panel');
    const gearBtn = document.getElementById('excaligif-gear-btn');
    if (!panel || !gearBtn) return;
    
    const el = getSelectedAnimatableElement();
    const config = el ? animatedElements.get(el.id) : null;
    
    if (panelOpen && config) {
      panel.classList.add('visible');
      gearBtn.classList.add('active');
    } else {
      panel.classList.remove('visible');
      gearBtn.classList.remove('active');
    }
  }

  function getSelectedAnimatableElement() {
    if (!currentApp || !currentApp.state) return null;
    const selectedIds = currentApp.state.selectedElementIds;
    if (!selectedIds) return null;

    const ids = Object.keys(selectedIds).filter(id => selectedIds[id]);
    if (ids.length !== 1) return null;

    const elements = currentApp.api ? currentApp.api.getSceneElements() : [];
    const el = elements.find(e => e.id === ids[0] && !e.isDeleted);
    if (!el) return null;

    if (el.type !== 'arrow' && el.type !== 'line') return null;
    if (!el.points || el.points.length < 2) return null;

    return el;
  }

  function updateToolbar() {
    if (!toolbarElement) return;

    const el = getSelectedAnimatableElement();

    if (!el || !isEnabled || !currentSettings.flowEnabled) {
      if (toolbarElement.classList.contains('visible')) {
        toolbarElement.classList.remove('visible');
      }
      lastSelectedId = null;
      panelOpen = false;
      updateToolbarPanelVisibility();
      return;
    }

    // Show toolbar
    if (!toolbarElement.classList.contains('visible') || lastSelectedId !== el.id) {
      toolbarElement.classList.add('visible');
      lastSelectedId = el.id;
    }

    // Update active state on style buttons
    const config = animatedElements.get(el.id);
    const activeStyle = config ? config.style : null;

    const buttons = toolbarElement.querySelectorAll('.excaligif-toolbar-main .excaligif-toolbar-btn:not(.remove):not(.gear)');
    for (const btn of buttons) {
      btn.classList.toggle('active', btn.dataset.style === activeStyle);
    }

    const gearBtn = document.getElementById('excaligif-gear-btn');
    if (gearBtn) {
      gearBtn.style.display = activeStyle ? 'inline-block' : 'none';
      if (!activeStyle) {
        panelOpen = false;
      }
    }

    // Populate Settings Panel inputs
    if (config) {
      const resolved = getElementConfig(el.id);
      
      // Update pill button groups
      updatePills('speed', resolved.speed);
      updatePills('direction', resolved.direction);
      updatePills('glowIntensity', resolved.glowIntensity);
      
      // Update Sliders
      const sizeInput = document.getElementById('excaligif-size-input');
      const sizeVal = document.getElementById('excaligif-size-val');
      if (sizeInput && sizeVal) {
        sizeInput.value = resolved.particleSize;
        sizeVal.textContent = resolved.particleSize;
      }
      
      const spacingInput = document.getElementById('excaligif-spacing-input');
      const spacingVal = document.getElementById('excaligif-spacing-val');
      if (spacingInput && spacingVal) {
        spacingInput.value = resolved.particleSpacing;
        spacingVal.textContent = resolved.particleSpacing;
      }
    }
    
    updateToolbarPanelVisibility();
  }

  function updatePills(settingKey, activeVal) {
    const group = toolbarElement.querySelector(`.excaligif-pill-group[data-setting="${settingKey}"]`);
    if (!group) return;
    const buttons = group.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === activeVal);
    });
  }

  function onStyleButtonClick(styleId) {
    const el = getSelectedAnimatableElement();
    if (!el) return;

    const existing = animatedElements.get(el.id);

    if (existing && existing.style === styleId) {
      // Toggle off if clicking the same style
      animatedElements.delete(el.id);
      panelOpen = false;
    } else {
      // Keep other settings if shifting style, or init defaults
      if (existing) {
        existing.style = styleId;
      } else {
        animatedElements.set(el.id, {
          style: styleId,
          speed: DEFAULT_ELEMENT_CONFIG.speed,
          direction: DEFAULT_ELEMENT_CONFIG.direction,
          particleSize: DEFAULT_ELEMENT_CONFIG.particleSize,
          particleSpacing: DEFAULT_ELEMENT_CONFIG.particleSpacing,
          glowIntensity: DEFAULT_ELEMENT_CONFIG.glowIntensity
        });
      }
    }

    saveAnimatedElements();
    updateToolbar();

    if (animatedElements.size > 0 && isEnabled && currentSettings.flowEnabled) {
      startOverlayLoop();
    }
  }

  function onRemoveClick() {
    const el = getSelectedAnimatableElement();
    if (!el) return;

    animatedElements.delete(el.id);
    panelOpen = false;
    saveAnimatedElements();
    updateToolbar();
  }

  // Poll for Excalidraw instance
  setInterval(checkInstance, 1000);

  // Fast poll for element selection (responsive toolbar updates)
  setInterval(() => {
    if (currentApp) updateToolbar();
  }, 200);

  // Listen for Toggle Event from Content Script
  document.addEventListener('ExcaliGifToggleState', (e) => {
    const targetEnabled = e.detail.enabled;
    if (isEnabled === targetEnabled) return;
    isEnabled = targetEnabled;
    currentSettings.gifsEnabled = isEnabled;
    
    try {
      localStorage.setItem('excaligif_settings', JSON.stringify(currentSettings));
    } catch (err) {}
    
    console.log("[ExcaliGif] Enabled state toggled to:", isEnabled);
    
    if (isEnabled) {
      for (const player of activeGifs.values()) {
        player.start();
      }
      if (currentSettings.flowEnabled) {
        startOverlayLoop();
      }
    } else {
      for (const player of activeGifs.values()) {
        player.stop();
      }
      stopOverlayLoop();
    }
    
    if (currentApp) {
      currentApp.triggerRender(true);
    }
  });

  // Listen for Update Settings Event from Content Script
  document.addEventListener('ExcaliGifUpdateSettings', (e) => {
    const newSettings = e.detail;
    Object.assign(currentSettings, newSettings);
    isEnabled = currentSettings.gifsEnabled;
    
    try {
      localStorage.setItem('excaligif_settings', JSON.stringify(currentSettings));
    } catch (err) {}
    
    console.log("[ExcaliGif] Settings updated:", currentSettings);
    
    if (isEnabled) {
      for (const player of activeGifs.values()) {
        player.start();
      }
    } else {
      for (const player of activeGifs.values()) {
        player.stop();
      }
    }
    
    if (isEnabled && currentSettings.flowEnabled) {
      startOverlayLoop();
    } else {
      stopOverlayLoop();
    }
    
    if (currentApp) {
      currentApp.triggerRender(true);
    }
  });

  // Listen for Query Status Event from Content Script
  document.addEventListener('ExcaliGifQueryStatus', () => {
    const reply = {
      connected: !!currentApp,
      enabled: isEnabled,
      activeGifCount: activeGifs.size,
      animatedElementCount: animatedElements.size,
      settings: currentSettings
    };
    document.dispatchEvent(new CustomEvent('ExcaliGifStatusResponse', { detail: reply }));
  });
})();

