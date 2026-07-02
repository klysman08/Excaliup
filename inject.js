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
    flowSpeed: 'medium'
  };

  let overlayAnimationFrameId = null;
  let flowOffset = 0;

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
          const delay = info.delay * 10 || 100; // default to 100ms
          
          this.frames.push({
            image: frameCanvas,
            delay: delay
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
      this.timer = setTimeout(() => this.tick(), frame.delay);
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
  }

  function checkInstance() {
    const app = findExcalidrawInstance();
    if (app && app !== currentApp) {
      console.log("[ExcaliGif] Hooked Excalidraw instance!");
      currentApp = app;
      hookImageCache(app);
      
      // Start flow overlay loop if enabled on startup
      if (isEnabled && currentSettings.flowEnabled) {
        startOverlayLoop();
      }
    }
    scanAndCleanupGifs();
  }

  // Helper functions for path and flow animations
  function shouldAnimateElement(el, allElements) {
    if (el.isDeleted) return false;
    if (el.type !== 'arrow' && el.type !== 'line') return false;
    if (!el.points || el.points.length < 2) return false;
    
    // Dash / Dotted style triggers flow automatically
    if (el.strokeStyle === 'dashed' || el.strokeStyle === 'dotted') {
      return true;
    }
    
    // Label triggers flow: checks if arrow text contains '>>', '[flow]', 'flow', '~>'
    if (el.boundElements) {
      for (const bound of el.boundElements) {
        if (bound.type === 'text') {
          const textEl = allElements.find(e => e.id === bound.id && !e.isDeleted);
          if (textEl && textEl.text) {
            const lowerText = textEl.text.toLowerCase();
            if (lowerText.includes('>>') || lowerText.includes('[flow]') || lowerText.includes('flow') || lowerText.includes('~>')) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
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

  function startOverlayLoop() {
    if (overlayAnimationFrameId) return;
    
    let lastTime = 0;
    
    function step(timestamp) {
      if (!lastTime) lastTime = timestamp;
      const dt = timestamp - lastTime;
      lastTime = timestamp;
      
      let speed = 2; // medium
      if (currentSettings.flowSpeed === 'slow') speed = 0.8;
      if (currentSettings.flowSpeed === 'fast') speed = 4;
      
      flowOffset += speed * (dt / 16.666);
      
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
      if (shouldAnimateElement(el, elements)) {
        const absPoints = getPathPoints(el);
        const geometry = getPathGeometry(absPoints);
        
        if (geometry.totalLength > 0) {
          if (currentSettings.flowStyle === 'particles') {
            drawParticles(ctx, el, geometry, offset);
          } else if (currentSettings.flowStyle === 'dashes') {
            drawDashes(ctx, el, geometry, offset);
          }
        }
      }
    }
    
    ctx.restore();
  }

  function drawParticles(ctx, el, geometry, offset) {
    const strokeColor = el.strokeColor || '#1e1e1e';
    const strokeWidth = el.strokeWidth || 2;
    
    ctx.save();
    ctx.fillStyle = strokeColor;
    
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 6;
    
    const spacing = 50; // pixels
    const radius = Math.max(2.5, strokeWidth * 0.85);
    const totalLength = geometry.totalLength;
    
    let d = offset % spacing;
    while (d < totalLength) {
      const pt = getPointAtLength(geometry, d);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
      d += spacing;
    }
    
    ctx.restore();
  }

  function drawDashes(ctx, el, geometry, offset) {
    const strokeColor = el.strokeColor || '#1e1e1e';
    const strokeWidth = el.strokeWidth || 2;
    
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth + 0.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.setLineDash([8, 8]);
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

  // Poll for Excalidraw instance
  setInterval(checkInstance, 1000);

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
      settings: currentSettings
    };
    document.dispatchEvent(new CustomEvent('ExcaliGifStatusResponse', { detail: reply }));
  });
})();

