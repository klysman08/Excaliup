// ExcaliGif injected script
// Runs in the main context of the page to access React Fiber internals and the Canvas imageCache

(function() {
  console.log("[ExcaliGif] Inject script loaded.");

  const Core = window.ExcaliGifCore;
  if (!Core) {
    console.error('[ExcaliGif] Runtime core is unavailable.');
    return;
  }

  let currentApp = null;
  const activeGifs = new Map(); // fileId -> GifPlayer instance
  const currentSettings = { ...Core.DEFAULT_SETTINGS };

  let overlayAnimationFrameId = null;
  let gifSchedulerTimer = null;
  let flowOffset = 0;
  let lastFlowDrawAt = 0;
  const flowFrameBudget = new Core.AdaptiveFrameBudget();
  const geometryCache = new Map();

  // Per-element animation assignments: elementId -> animation configuration
  const animatedElements = new Map();
  let toolbarElement = null;
  let lastSelectedId = null;
  let toolbarRenderSignature = '';
  let animatedElementsRevision = 0;
  let saveAnimatedElementsTimer = null;
  let animationMetadataTimer = null;
  const pendingAnimationMetadata = new Map();
  const pendingAnimationMetadataRemovals = new Set();
  const ANIMATION_METADATA_KEY = 'excaligifAnimation';

  // Load animated elements from localStorage
  try {
    const saved = localStorage.getItem('excaligif_animated_elements');
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const [id, config] of Object.entries(parsed)) {
        animatedElements.set(id, Core.normalizeElementConfig(config));
      }
      animatedElementsRevision++;
    }
  } catch (e) {
    console.error("[ExcaliGif] Error loading animated elements:", e);
  }

  function saveAnimatedElements(immediate = false) {
    const write = () => {
      saveAnimatedElementsTimer = null;
      try {
        const obj = {};
        for (const [id, config] of animatedElements.entries()) {
          obj[id] = config;
        }
        localStorage.setItem('excaligif_animated_elements', JSON.stringify(obj));
      } catch (error) {
        console.error('[ExcaliGif] Error saving animated elements:', error);
      }
    };

    if (saveAnimatedElementsTimer) clearTimeout(saveAnimatedElementsTimer);
    if (immediate) {
      write();
    } else {
      saveAnimatedElementsTimer = setTimeout(write, 150);
    }
  }

  function animationConfigsEqual(first, second) {
    if (!first || !second) return false;
    const firstConfig = Core.normalizeElementConfig(first);
    const secondConfig = Core.normalizeElementConfig(second);
    return Object.keys(DEFAULT_ELEMENT_CONFIG).every((key) => firstConfig[key] === secondConfig[key]);
  }

  function getElementAnimationMetadata(element) {
    const metadata = element && element.customData && element.customData[ANIMATION_METADATA_KEY];
    return metadata && typeof metadata === 'object'
      ? Core.normalizeElementConfig(metadata)
      : null;
  }

  function flushAnimationMetadata() {
    if (animationMetadataTimer) {
      clearTimeout(animationMetadataTimer);
      animationMetadataTimer = null;
    }
    if (
      !currentApp ||
      !currentApp.api ||
      (pendingAnimationMetadata.size === 0 && pendingAnimationMetadataRemovals.size === 0)
    ) {
      return;
    }

    const now = Date.now();
    let changed = false;
    const elements = currentApp.api.getSceneElements();
    const nextElements = elements.map((element) => {
      if (pendingAnimationMetadata.has(element.id)) {
        const config = Core.normalizeElementConfig(pendingAnimationMetadata.get(element.id));
        if (animationConfigsEqual(getElementAnimationMetadata(element), config)) return element;

        changed = true;
        return {
          ...element,
          customData: {
            ...(element.customData || {}),
            [ANIMATION_METADATA_KEY]: config
          },
          version: (element.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 0x7fffffff),
          updated: now
        };
      }

      if (pendingAnimationMetadataRemovals.has(element.id) && getElementAnimationMetadata(element)) {
        const customData = { ...(element.customData || {}) };
        delete customData[ANIMATION_METADATA_KEY];
        changed = true;
        return {
          ...element,
          customData: Object.keys(customData).length > 0 ? customData : undefined,
          version: (element.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 0x7fffffff),
          updated: now
        };
      }

      return element;
    });

    pendingAnimationMetadata.clear();
    pendingAnimationMetadataRemovals.clear();
    if (changed) currentApp.api.updateScene({ elements: nextElements });
  }

  function queueAnimationMetadata(configById, removedIds = [], immediate = false) {
    for (const [elementId, config] of configById.entries()) {
      pendingAnimationMetadataRemovals.delete(elementId);
      pendingAnimationMetadata.set(elementId, Core.normalizeElementConfig(config));
    }
    for (const elementId of removedIds) {
      pendingAnimationMetadata.delete(elementId);
      pendingAnimationMetadataRemovals.add(elementId);
    }

    if (animationMetadataTimer) clearTimeout(animationMetadataTimer);
    if (immediate) {
      flushAnimationMetadata();
    } else {
      animationMetadataTimer = setTimeout(flushAnimationMetadata, 150);
    }
  }

  function syncAnimatedElementsFromScene(elements) {
    const metadataToMigrate = new Map();
    let changed = false;

    for (const element of elements) {
      if (!isAnimatableElement(element)) continue;
      const metadata = getElementAnimationMetadata(element);
      const storedConfig = animatedElements.get(element.id);

      if (metadata) {
        if (!storedConfig || !animationConfigsEqual(storedConfig, metadata)) {
          animatedElements.set(element.id, metadata);
          changed = true;
        }
      } else if (storedConfig) {
        metadataToMigrate.set(element.id, storedConfig);
      }
    }

    if (metadataToMigrate.size > 0) queueAnimationMetadata(metadataToMigrate, [], true);
    if (changed) {
      animatedElementsRevision++;
      toolbarRenderSignature = '';
      saveAnimatedElements(false);
    }
    return changed;
  }

  // Load settings from localStorage if available
  try {
    const saved = localStorage.getItem('excaligif_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(currentSettings, Core.normalizeSettings(parsed, currentSettings));
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
      this.activeCanvas = null;
      this.activeCtx = null;
      this.isLoaded = false;
      this.isDestroyed = false;
      this.isPlaying = false;
      this.nextFrameAt = Infinity;
      this.decodeGeneration = 0;
      this.abortController = null;
      this.loadPromise = this.init();
    }

    async init() {
      const src = this.originalImage.src;
      const generation = ++this.decodeGeneration;
      if (this.abortController) this.abortController.abort();
      this.abortController = null;

      // Skip empty, invalid, or standard transparent 1x1 GIF placeholder sources
      if (!src || src.startsWith('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')) {
        this.lastSrc = src;
        console.log("[ExcaliGif] Skipping empty/placeholder image source for fileId:", this.fileId);
        return;
      }

      const abortController = new AbortController();
      this.abortController = abortController;
      this.lastSrc = src;

      try {
        console.log("[ExcaliGif] Fetching GIF data for fileId:", this.fileId, "src:", src.substring(0, 100));
        const response = await fetch(src, { signal: abortController.signal });
        if (!response.ok && !src.startsWith('data:') && !src.startsWith('blob:')) {
          throw new Error(`GIF request failed with status ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        if (this.isDestroyed || generation !== this.decodeGeneration) return;
        const bytes = new Uint8Array(arrayBuffer);

        // window.GifReader is loaded by omggif.js in the page scope
        if (typeof window.GifReader === 'undefined' && typeof GifReader === 'undefined') {
          throw new Error("GifReader is not defined in the scope.");
        }
        const ReaderClass = typeof window.GifReader !== 'undefined' ? window.GifReader : GifReader;
        const reader = new ReaderClass(bytes);
        const width = reader.width;
        const height = reader.height;
        const numFrames = reader.numFrames();
        console.log(`[ExcaliGif] Decoding GIF: ${width}x${height}, ${numFrames} frames`);
        if (numFrames <= 0) return;

        const decodedFrames = [];
        const accumBuffer = new Uint8ClampedArray(width * height * 4);
        let backupBuffer = null;

        for (let i = 0; i < numFrames; i++) {
          if (this.isDestroyed || generation !== this.decodeGeneration) {
            this.releaseFrames(decodedFrames);
            return;
          }

          const info = reader.frameInfo(i);

          // 1. Handle disposal of previous frame
          if (i > 0) {
            const prevInfo = reader.frameInfo(i - 1);
            if (prevInfo.disposal === 2) {
              // Restore to background (clear the subrect to transparent)
              for (let y = prevInfo.y; y < prevInfo.y + prevInfo.height; y++) {
                for (let x = prevInfo.x; x < prevInfo.x + prevInfo.width; x++) {
                  const idx = (y * width + x) * 4;
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
              backupBuffer = new Uint8ClampedArray(width * height * 4);
            }
            backupBuffer.set(accumBuffer);
          }

          // 3. Decode frame pixels directly into the accumulated buffer
          reader.decodeAndBlitFrameRGBA(i, accumBuffer);

          // 4. Draw accumBuffer onto a frame canvas
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = width;
          frameCanvas.height = height;
          const frameCtx = frameCanvas.getContext('2d');
          const imgData = frameCtx.createImageData(width, height);
          imgData.data.set(accumBuffer);
          frameCtx.putImageData(imgData, 0, 0);

          // Delay is in hundredths of a second (10ms)
          const baseDelay = info.delay * 10 || 100; // default to 100ms

          decodedFrames.push({
            image: frameCanvas,
            delay: baseDelay
          });
        }

        if (this.isDestroyed || generation !== this.decodeGeneration) {
          this.releaseFrames(decodedFrames);
          return;
        }

        this.releaseFrames();
        this.frames = decodedFrames;
        this.width = width;
        this.height = height;
        this.currentFrameIdx = 0;

        // Setup active canvas that Excalidraw draws
        const activeCanvas = document.createElement('canvas');
        activeCanvas.width = width;
        activeCanvas.height = height;

        // Mock standard HTMLImageElement properties
        Object.defineProperties(activeCanvas, {
          tagName: { value: 'IMG' },
          complete: { value: true },
          naturalWidth: { value: width },
          naturalHeight: { value: height }
        });

        if (this.activeCanvas) {
          this.activeCanvas.width = 0;
          this.activeCanvas.height = 0;
        }
        this.activeCanvas = activeCanvas;
        this.activeCtx = activeCanvas.getContext('2d');
        this.isLoaded = true;

        if (currentSettings.gifsEnabled) {
          this.start();
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error("[ExcaliGif] Error initializing player for fileId " + this.fileId, e);
        }
      } finally {
        if (this.abortController === abortController) this.abortController = null;
      }
    }

    releaseFrames(frames = this.frames) {
      for (const frame of frames) {
        if (frame.image && typeof frame.image.close === 'function') {
          frame.image.close();
        } else if (frame.image) {
          frame.image.width = 0;
          frame.image.height = 0;
        }
      }
      if (frames === this.frames) this.frames = [];
    }

    start() {
      if (this.isDestroyed || !this.isLoaded) return;

      // Swap out the image in Excalidraw cache
      this.cacheEntry.image = this.activeCanvas;
      this.isPlaying = true;
      this.nextFrameAt = performance.now();
      scheduleGifTick();
    }

    renderDue(now, tolerance = 4) {
      if (
        this.isDestroyed ||
        !this.isLoaded ||
        !this.isPlaying ||
        !currentSettings.gifsEnabled ||
        this.nextFrameAt - now > tolerance
      ) {
        return false;
      }

      const frame = this.frames[this.currentFrameIdx];
      if (!frame) return false;
      this.activeCtx.clearRect(0, 0, this.width, this.height);
      this.activeCtx.drawImage(frame.image, 0, 0);

      this.currentFrameIdx = (this.currentFrameIdx + 1) % this.frames.length;
      const speedMultiplier = currentSettings.gifSpeed || 1;
      this.nextFrameAt = now + Math.max(10, Math.round(frame.delay / speedMultiplier));
      return true;
    }

    stop() {
      this.isPlaying = false;
      this.nextFrameAt = Infinity;
      // Restore original static image
      if (this.cacheEntry) this.cacheEntry.image = this.originalImage;
      scheduleGifTick();
    }

    destroy() {
      this.stop();
      this.isDestroyed = true;
      this.decodeGeneration++;
      if (this.abortController) this.abortController.abort();
      this.abortController = null;
      this.releaseFrames();
      if (this.activeCanvas) {
        this.activeCanvas.width = 0;
        this.activeCanvas.height = 0;
      }
      this.activeCanvas = null;
      this.activeCtx = null;
      this.isLoaded = false;
    }
  }

  function stopGifScheduler() {
    if (gifSchedulerTimer) {
      clearTimeout(gifSchedulerTimer);
      gifSchedulerTimer = null;
    }
  }

  function scheduleGifTick() {
    stopGifScheduler();
    if (document.hidden || !currentSettings.gifsEnabled || !currentApp) return;

    let nextFrameAt = Infinity;
    for (const player of activeGifs.values()) {
      if (player.isPlaying && player.isLoaded && !player.isDestroyed) {
        nextFrameAt = Math.min(nextFrameAt, player.nextFrameAt);
      }
    }
    if (!Number.isFinite(nextFrameAt)) return;

    const delay = Math.max(0, nextFrameAt - performance.now());
    gifSchedulerTimer = setTimeout(runGifScheduler, delay);
  }

  function runGifScheduler() {
    gifSchedulerTimer = null;
    if (document.hidden || !currentSettings.gifsEnabled || !currentApp) return;

    const now = performance.now();
    const dueFileIds = new Set();
    for (const [fileId, player] of activeGifs.entries()) {
      if (player.renderDue(now)) dueFileIds.add(fileId);
    }

    refreshGifElements(dueFileIds);

    scheduleGifTick();
  }

  function refreshGifElements(fileIds) {
    if (!currentApp || !currentApp.api) return;
    const elements = currentApp.api.getSceneElements();
    const refresh = Core.buildGifRefreshElements(elements, fileIds);
    if (refresh.changed) currentApp.api.updateScene({ elements: refresh.elements });
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
    if (app.imageCache && !app.imageCache.excaligifHook) {
      const originalSet = app.imageCache.set;

      const wrappedSet = function(fileId, cacheEntry) {
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
              player.loadPromise = player.init();
            }

            if (currentSettings.gifsEnabled && player.activeCanvas) {
              cacheEntry.image = player.activeCanvas;
            }
          }
        }
        return res;
      };

      app.imageCache.set = wrappedSet;
      app.imageCache.excaligifHook = { originalSet, wrappedSet };

      // Scan existing GIF cache entries
      for (const [fileId, cacheEntry] of app.imageCache.entries()) {
        if (cacheEntry && cacheEntry.mimeType === 'image/gif' && !activeGifs.has(fileId)) {
          console.log("[ExcaliGif] Hooked existing GIF fileId:", fileId);
          activeGifs.set(fileId, new GifPlayer(fileId, cacheEntry, app));
        }
      }
    }
  }

  function unhookImageCache(app) {
    const hook = app && app.imageCache && app.imageCache.excaligifHook;
    if (!hook) return;
    if (app.imageCache.set === hook.wrappedSet) app.imageCache.set = hook.originalSet;
    delete app.imageCache.excaligifHook;
  }

  function detachCurrentApp() {
    stopGifScheduler();
    stopOverlayLoop();
    if (animationMetadataTimer) clearTimeout(animationMetadataTimer);
    animationMetadataTimer = null;
    pendingAnimationMetadata.clear();
    pendingAnimationMetadataRemovals.clear();
    for (const player of activeGifs.values()) player.destroy();
    activeGifs.clear();
    geometryCache.clear();
    unhookImageCache(currentApp);
    currentApp = null;
    toolbarRenderSignature = '';
  }

  function attachApp(app) {
    if (app === currentApp) return;
    if (currentApp) detachCurrentApp();

    console.log("[ExcaliGif] Hooked Excalidraw instance!");
    currentApp = app;
    hookImageCache(app);
    createToolbar();
    scanAndCleanupGifs();
    updateToolbar(true);
    reconcileRuntime();
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
    
    // Avoid erasing persisted assignments while Excalidraw is still hydrating an empty scene.
    if (elements.length === 0) {
      reconcileFlowRuntime();
      return;
    }

    syncAnimatedElementsFromScene(elements);

    // Clean up animated element entries for deleted elements
    const sceneIds = new Set(elements.filter(e => !e.isDeleted).map(e => e.id));
    let cleaned = false;
    for (const elId of animatedElements.keys()) {
      if (!sceneIds.has(elId)) {
        animatedElements.delete(elId);
        geometryCache.delete(elId);
        cleaned = true;
      }
    }
    if (cleaned) {
      animatedElementsRevision++;
      toolbarRenderSignature = '';
      saveAnimatedElements(true);
    }
    reconcileFlowRuntime();
  }

  function checkInstance() {
    const app = findExcalidrawInstance();
    if (app && app !== currentApp) {
      attachApp(app);
    } else if (!app && currentApp) {
      detachCurrentApp();
    }
    scanAndCleanupGifs();
  }

  // Helper functions for path and flow animations
  function isAnimatableElement(element) {
    return !!(
      element &&
      !element.isDeleted &&
      (element.type === 'arrow' || element.type === 'line') &&
      Array.isArray(element.points) &&
      element.points.length >= 2
    );
  }

  function shouldAnimateElement(el) {
    if (!isAnimatableElement(el)) return false;
    // Only animate elements explicitly assigned via the in-canvas toolbar
    return animatedElements.has(el.id);
  }

  const DEFAULT_ELEMENT_CONFIG = Core.DEFAULT_ELEMENT_CONFIG;
  const getPointAtLength = Core.getPointAtLength;

  function getCachedGeometry(element) {
    const cached = geometryCache.get(element.id);
    if (cached && cached.element === element && cached.version === element.version) {
      return cached.geometry;
    }

    const geometry = Core.getPathGeometry(Core.getPathPoints(element));
    geometryCache.set(element.id, {
      element,
      version: element.version,
      geometry
    });
    return geometry;
  }

  function getSceneElementsMap() {
    if (!currentApp) return new Map();
    if (currentApp.scene && typeof currentApp.scene.getNonDeletedElementsMap === 'function') {
      return currentApp.scene.getNonDeletedElementsMap();
    }
    const elements = currentApp.api ? currentApp.api.getSceneElements() : [];
    return new Map(elements.filter((element) => !element.isDeleted).map((element) => [element.id, element]));
  }

  function getElementConfig(elId) {
    return Core.normalizeElementConfig(animatedElements.get(elId), DEFAULT_ELEMENT_CONFIG);
  }

  function getElementOffset(config, globalOffset) {
    return Core.getElementOffset(config, globalOffset);
  }

  function startOverlayLoop() {
    if (
      overlayAnimationFrameId ||
      document.hidden ||
      !currentApp ||
      !currentSettings.flowEnabled ||
      animatedElements.size === 0
    ) {
      return;
    }

    flowFrameBudget.reset(performance.now());
    lastFlowDrawAt = 0;

    function step(timestamp) {
      overlayAnimationFrameId = null;
      if (
        document.hidden ||
        !currentApp ||
        !currentSettings.flowEnabled ||
        animatedElements.size === 0
      ) {
        stopOverlayLoop();
        return;
      }

      const frameDelta = lastFlowDrawAt ? timestamp - lastFlowDrawAt : flowFrameBudget.frameInterval;
      if (!lastFlowDrawAt || frameDelta >= flowFrameBudget.frameInterval - 1) {
        flowOffset += frameDelta / 16.666;
        const drawStartedAt = performance.now();
        drawOverlay(flowOffset);
        flowFrameBudget.record(timestamp, performance.now() - drawStartedAt, frameDelta);
        lastFlowDrawAt = timestamp;
      }

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
    lastFlowDrawAt = 0;
  }

  function drawOverlay(offset) {
    const interactiveCanvas = document.querySelector('.excalidraw__canvas.interactive');
    if (!interactiveCanvas || !currentApp || !currentSettings.flowEnabled) {
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
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (overlayCanvas.width !== pixelWidth || overlayCanvas.height !== pixelHeight) {
      overlayCanvas.width = pixelWidth;
      overlayCanvas.height = pixelHeight;
      overlayCanvas.style.width = `${width}px`;
      overlayCanvas.style.height = `${height}px`;
    }

    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);

    const zoomVal = currentApp.state.zoom ? currentApp.state.zoom.value : 1;
    const scrollXVal = currentApp.state.scrollX || 0;
    const scrollYVal = currentApp.state.scrollY || 0;
    const viewportBounds = Core.getViewportBounds(width, height, zoomVal, scrollXVal, scrollYVal, 40);

    ctx.scale(zoomVal, zoomVal);
    ctx.translate(scrollXVal, scrollYVal);

    const elementsMap = getSceneElementsMap();
    for (const elementId of animatedElements.keys()) {
      const el = elementsMap.get(elementId);
      if (!el || !shouldAnimateElement(el) || (el.type !== 'arrow' && el.type !== 'line')) continue;

      const geometry = getCachedGeometry(el);
      if (geometry.totalLength > 0 && Core.intersectsBounds(geometry.bounds, viewportBounds)) {
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

    ctx.restore();
  }

  function reconcileRuntime() {
    if (currentSettings.gifsEnabled && !document.hidden) {
      for (const player of activeGifs.values()) {
        if (player.isLoaded && !player.isPlaying) player.start();
      }
      scheduleGifTick();
    } else if (!currentSettings.gifsEnabled) {
      for (const player of activeGifs.values()) {
        if (player.isPlaying) player.stop();
      }
    } else {
      stopGifScheduler();
    }

    reconcileFlowRuntime();
  }

  function hasRenderableAnimatedElements() {
    const elementsMap = getSceneElementsMap();
    for (const elementId of animatedElements.keys()) {
      const element = elementsMap.get(elementId);
      if (element && !element.isDeleted && (element.type === 'arrow' || element.type === 'line')) {
        return true;
      }
    }
    return false;
  }

  function reconcileFlowRuntime() {
    if (
      currentSettings.flowEnabled &&
      !document.hidden &&
      currentApp &&
      hasRenderableAnimatedElements()
    ) {
      startOverlayLoop();
    } else {
      stopOverlayLoop();
    }
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
    
    if (!geometry.path && typeof Path2D !== 'undefined') {
      geometry.path = new Path2D();
      const firstPoint = geometry.segments[0].start;
      geometry.path.moveTo(firstPoint.x, firstPoint.y);
      for (const segment of geometry.segments) geometry.path.lineTo(segment.end.x, segment.end.y);
    }

    if (geometry.path) {
      ctx.stroke(geometry.path);
    } else {
      ctx.beginPath();
      const firstPoint = geometry.segments[0].start;
      ctx.moveTo(firstPoint.x, firstPoint.y);
      for (const segment of geometry.segments) ctx.lineTo(segment.end.x, segment.end.y);
      ctx.stroke();
    }
    
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
      const steps = Math.max(8, Math.round(20 * flowFrameBudget.sampleScale));
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
    const steps = Math.max(12, Math.round(30 * flowFrameBudget.sampleScale));
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
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
      updateElementSetting(settingKey, parseInt(e.target.value, 10), false);
    });
    
    group.appendChild(input);
    group.appendChild(valSpan);
    row.appendChild(group);
    return row;
  }

  function updateElementSetting(key, val, persistImmediately = true) {
    const elements = getSelectedAnimatableElements();
    if (elements.length === 0) return;

    const metadata = new Map();
    for (const element of elements) {
      const config = Core.normalizeElementConfig({
        ...(animatedElements.get(element.id) || DEFAULT_ELEMENT_CONFIG),
        [key]: val
      });
      animatedElements.set(element.id, config);
      metadata.set(element.id, config);
    }

    animatedElementsRevision++;
    saveAnimatedElements(persistImmediately);
    queueAnimationMetadata(metadata, [], persistImmediately);
    if (persistImmediately) {
      toolbarRenderSignature = '';
      updateToolbar(true);
    } else {
      toolbarRenderSignature = `${getSelectionKey(elements)}:${animatedElementsRevision}:${panelOpen}`;
    }
    reconcileFlowRuntime();
  }

  function updateToolbarPanelVisibility() {
    if (!toolbarElement) return;
    const panel = document.getElementById('excaligif-toolbar-panel');
    const gearBtn = document.getElementById('excaligif-gear-btn');
    if (!panel || !gearBtn) return;
    
    const elements = getSelectedAnimatableElements();
    const allAnimated = elements.length > 0 && elements.every((element) => animatedElements.has(element.id));
    
    if (panelOpen && allAnimated) {
      panel.classList.add('visible');
      gearBtn.classList.add('active');
    } else {
      panel.classList.remove('visible');
      gearBtn.classList.remove('active');
    }
  }

  function getSelectedAnimatableElements() {
    if (!currentApp || !currentApp.state) return [];
    const selectedIds = currentApp.state.selectedElementIds;
    if (!selectedIds) return [];

    const ids = Object.keys(selectedIds).filter(id => selectedIds[id]);
    if (ids.length === 0) return [];

    const elementsMap = getSceneElementsMap();
    return ids
      .map((id) => elementsMap.get(id))
      .filter(isAnimatableElement);
  }

  function getSelectionKey(elements) {
    return elements.map((element) => element.id).sort().join(',');
  }

  function getCommonSetting(elements, settingKey) {
    if (elements.length === 0) return null;
    const configs = elements.map((element) => animatedElements.get(element.id));
    if (configs.some((config) => !config)) return null;
    const firstValue = Core.normalizeElementConfig(configs[0])[settingKey];
    return configs.every((config) => Core.normalizeElementConfig(config)[settingKey] === firstValue)
      ? firstValue
      : null;
  }

  function updateToolbar(force = false) {
    if (!toolbarElement) return;

    const elements = getSelectedAnimatableElements();
    if (elements.length > 0) syncAnimatedElementsFromScene(elements);
    const selectionKey = getSelectionKey(elements);
    const signature = elements.length > 0 && currentSettings.flowEnabled
      ? `${selectionKey}:${animatedElementsRevision}:${panelOpen}`
      : `hidden:${currentSettings.flowEnabled}`;
    if (!force && signature === toolbarRenderSignature) return;
    toolbarRenderSignature = signature;

    if (elements.length === 0 || !currentSettings.flowEnabled) {
      if (toolbarElement.classList.contains('visible')) {
        toolbarElement.classList.remove('visible');
      }
      lastSelectedId = null;
      panelOpen = false;
      updateToolbarPanelVisibility();
      return;
    }

    // Show toolbar
    if (!toolbarElement.classList.contains('visible') || lastSelectedId !== selectionKey) {
      toolbarElement.classList.add('visible');
      lastSelectedId = selectionKey;
    }

    // Update active state on style buttons
    const allAnimated = elements.every((element) => animatedElements.has(element.id));
    const activeStyle = allAnimated ? getCommonSetting(elements, 'style') : null;

    const buttons = toolbarElement.querySelectorAll('.excaligif-toolbar-main .excaligif-toolbar-btn:not(.remove):not(.gear)');
    for (const btn of buttons) {
      btn.classList.toggle('active', btn.dataset.style === activeStyle);
    }

    const gearBtn = document.getElementById('excaligif-gear-btn');
    if (gearBtn) {
      gearBtn.style.display = allAnimated ? 'inline-block' : 'none';
      if (!allAnimated) {
        panelOpen = false;
      }
    }

    // Populate Settings Panel inputs
    if (allAnimated) {
      const firstConfig = getElementConfig(elements[0].id);

      // Update pill button groups
      updatePills('speed', getCommonSetting(elements, 'speed'));
      updatePills('direction', getCommonSetting(elements, 'direction'));
      updatePills('glowIntensity', getCommonSetting(elements, 'glowIntensity'));
      
      // Update Sliders
      const sizeInput = document.getElementById('excaligif-size-input');
      const sizeVal = document.getElementById('excaligif-size-val');
      if (sizeInput && sizeVal) {
        const commonSize = getCommonSetting(elements, 'particleSize');
        sizeInput.value = commonSize === null ? firstConfig.particleSize : commonSize;
        sizeVal.textContent = commonSize === null ? 'Mixed' : commonSize;
      }
      
      const spacingInput = document.getElementById('excaligif-spacing-input');
      const spacingVal = document.getElementById('excaligif-spacing-val');
      if (spacingInput && spacingVal) {
        const commonSpacing = getCommonSetting(elements, 'particleSpacing');
        spacingInput.value = commonSpacing === null ? firstConfig.particleSpacing : commonSpacing;
        spacingVal.textContent = commonSpacing === null ? 'Mixed' : commonSpacing;
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
    const elements = getSelectedAnimatableElements();
    if (elements.length === 0) return;

    const shouldRemove = elements.every((element) => {
      const config = animatedElements.get(element.id);
      return config && config.style === styleId;
    });
    const metadata = new Map();
    const removedIds = [];

    if (shouldRemove) {
      for (const element of elements) {
        animatedElements.delete(element.id);
        geometryCache.delete(element.id);
        removedIds.push(element.id);
      }
      panelOpen = false;
    } else {
      for (const element of elements) {
        const existing = animatedElements.get(element.id);
        const config = Core.normalizeElementConfig({
          ...(existing || DEFAULT_ELEMENT_CONFIG),
          style: styleId
        });
        animatedElements.set(element.id, config);
        metadata.set(element.id, config);
      }
    }

    animatedElementsRevision++;
    toolbarRenderSignature = '';
    saveAnimatedElements(true);
    queueAnimationMetadata(metadata, removedIds, true);
    updateToolbar(true);
    reconcileRuntime();
  }

  function onRemoveClick() {
    const elements = getSelectedAnimatableElements();
    if (elements.length === 0) return;

    const removedIds = [];
    for (const element of elements) {
      animatedElements.delete(element.id);
      geometryCache.delete(element.id);
      removedIds.push(element.id);
    }
    panelOpen = false;
    animatedElementsRevision++;
    toolbarRenderSignature = '';
    saveAnimatedElements(true);
    queueAnimationMetadata(new Map(), removedIds, true);
    updateToolbar(true);
    reconcileRuntime();
  }

  // Poll for Excalidraw instance
  setInterval(checkInstance, 1000);

  // Fast poll for element selection (responsive toolbar updates)
  setInterval(() => {
    if (currentApp && !document.hidden) updateToolbar();
  }, 200);

  // Listen for Toggle Event from Content Script
  document.addEventListener('ExcaliGifToggleState', (e) => {
    const targetEnabled = e.detail && e.detail.enabled;
    if (typeof targetEnabled !== 'boolean' || currentSettings.gifsEnabled === targetEnabled) return;
    currentSettings.gifsEnabled = targetEnabled;

    try {
      localStorage.setItem('excaligif_settings', JSON.stringify(currentSettings));
    } catch (error) {
      console.error('[ExcaliGif] Error saving settings:', error);
    }

    console.log("[ExcaliGif] GIF playback toggled to:", targetEnabled);
    reconcileRuntime();
    refreshGifElements(new Set(activeGifs.keys()));
  });

  // Listen for Update Settings Event from Content Script
  document.addEventListener('ExcaliGifUpdateSettings', (e) => {
    const previousSettings = { ...currentSettings };
    Object.assign(currentSettings, Core.normalizeSettings(e.detail, currentSettings));

    try {
      localStorage.setItem('excaligif_settings', JSON.stringify(currentSettings));
    } catch (error) {
      console.error('[ExcaliGif] Error saving settings:', error);
    }

    console.log("[ExcaliGif] Settings updated:", currentSettings);

    reconcileRuntime();
    if (
      previousSettings.gifsEnabled !== currentSettings.gifsEnabled ||
      previousSettings.gifSpeed !== currentSettings.gifSpeed
    ) {
      if (currentSettings.gifsEnabled) {
        const now = performance.now();
        for (const player of activeGifs.values()) {
          if (player.isPlaying) player.nextFrameAt = now;
        }
        scheduleGifTick();
      }
      refreshGifElements(new Set(activeGifs.keys()));
    }

    toolbarRenderSignature = '';
    updateToolbar(true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopGifScheduler();
      stopOverlayLoop();
      if (saveAnimatedElementsTimer) saveAnimatedElements(true);
      return;
    }

    const now = performance.now();
    for (const player of activeGifs.values()) {
      if (player.isPlaying) player.nextFrameAt = now;
    }
    reconcileRuntime();
    updateToolbar(true);
  });

  // Listen for Query Status Event from Content Script
  document.addEventListener('ExcaliGifQueryStatus', () => {
    const reply = {
      connected: !!currentApp,
      enabled: currentSettings.gifsEnabled,
      activeGifCount: activeGifs.size,
      animatedElementCount: animatedElements.size,
      settings: { ...currentSettings }
    };
    document.dispatchEvent(new CustomEvent('ExcaliGifStatusResponse', { detail: reply }));
  });

  window.addEventListener('pagehide', () => {
    if (saveAnimatedElementsTimer) saveAnimatedElements(true);
    if (currentApp) detachCurrentApp();
  });

  checkInstance();
})();

