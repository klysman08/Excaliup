// Excali Up injected script
// Runs in the main context of the page to access React Fiber internals and the Canvas imageCache

(function() {
  console.log("[Excali Up] Inject script loaded.");

  const Core = window.ExcaliupCore;
  const Flow = window.ExcaliupFlow;
  if (!Core || !Flow) {
    console.error('[Excali Up] Runtime core is unavailable.');
    return;
  }

  let currentApp = null;
  const activeGifs = new Map(); // fileId -> GifPlayer instance
  const activeAnimatedSvgs = new Map(); // fileId -> AnimatedSvgPlayer instance
  const pendingAnimatedSvgImports = [];
  const currentSettings = { ...Core.DEFAULT_SETTINGS };

  // Iconify sidebar state
  let sidebarElement = null;
  let sidebarButton = null;
  let isDraggingIcon = false;
  let draggingIconData = null;
  let iconCollections = null;
  let visibleIcons = [];
  let activePrefix = '';
  let activeCategory = '';
  let activeTag = '';
  let iconView = 'browse';
  let searchQuery = '';
  let currentPage = 1;
  const pageSize = 96;
  const svgCache = new Map();
  let iconSearchTimer = null;
  let iconRequestId = 0;
  let iconCollectionsPromise = null;
  let iconFetchController = null;
  const favoriteIcons = new Set();

  try {
    const savedFavorites = JSON.parse(localStorage.getItem('excaliup_icon_favorites') || '[]');
    if (Array.isArray(savedFavorites)) {
      for (const iconName of savedFavorites) {
        if (typeof iconName === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(iconName)) {
          favoriteIcons.add(iconName);
        }
      }
    }
  } catch (error) {
    console.error('[Excali Up] Error loading favorite icons:', error);
  }

  // How icons are inserted: tinted with the canvas stroke colour (monochrome
  // packs only) or kept as published, and at which size.
  const ICON_INSERT_SIZES = [48, 96, 160];
  const iconInsertPrefs = { color: 'stroke', size: 96 };
  try {
    const savedPrefs = JSON.parse(localStorage.getItem('excaliup_icon_prefs') || '{}');
    if (savedPrefs.color === 'stroke' || savedPrefs.color === 'original') iconInsertPrefs.color = savedPrefs.color;
    if (ICON_INSERT_SIZES.includes(savedPrefs.size)) iconInsertPrefs.size = savedPrefs.size;
  } catch (error) {
    console.error('[Excali Up] Error loading icon preferences:', error);
  }

  function saveIconInsertPrefs() {
    try {
      localStorage.setItem('excaliup_icon_prefs', JSON.stringify(iconInsertPrefs));
    } catch (error) {
      console.error('[Excali Up] Error saving icon preferences:', error);
    }
  }

  function saveFavoriteIcons() {
    try {
      localStorage.setItem('excaliup_icon_favorites', JSON.stringify([...favoriteIcons]));
    } catch (error) {
      console.error('[Excali Up] Error saving favorite icons:', error);
    }
  }

  // --- Local Vault State ---
  let rootVaultHandle = null;
  let vaultMetadata = { ...Core.DEFAULT_VAULT_METADATA };
  let currentVaultRelativePath = '';
  let activeDrawingRelativePath = null;
  let vaultSyncState = 'unlinked'; // 'unlinked' | 'pending' | 'saving' | 'synced' | 'permission-required' | 'error'
  let autoSaveTimer = null;
  let lastSavedSceneHash = '';
  let vaultDrawerElement = null;
  let vaultStatusButton = null;
  let isVaultDrawerOpen = false;
  let vaultSearchQuery = '';
  let vaultCurrentView = 'all'; // 'all' | 'favorites' | 'recent'
  let vaultDirectoryData = { currentPath: '', folders: [], files: [] };
  let vaultAllDrawings = [];

  let overlayAnimationFrameId = null;
  let svgOverlayTimer = null;
  let gifSchedulerTimer = null;
  let flowOffset = 0;
  let lastFlowDrawAt = 0;
  const flowFrameBudget = new Core.AdaptiveFrameBudget();
  const flowRenderer = Flow.createFlowRenderer({ core: Core });
  let overlayInteractiveCanvas = null;
  let overlayCanvasElement = null;
  let overlayContext = null;
  let overlayIsClear = true;
  let lastStaticFrameSignature = '';
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
  const ANIMATION_METADATA_KEY = 'excaliupAnimation';
  const OLD_ANIMATION_METADATA_KEY = 'excaligifAnimation';

  // Load animated elements from localStorage
  try {
    let saved = localStorage.getItem('excaliup_animated_elements');
    if (!saved) {
      saved = localStorage.getItem('excaligif_animated_elements');
    }
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const [id, config] of Object.entries(parsed)) {
        animatedElements.set(id, Core.normalizeElementConfig(config));
      }
      animatedElementsRevision++;
    }
  } catch (e) {
    console.error("[Excali Up] Error loading animated elements:", e);
  }

  function saveAnimatedElements(immediate = false) {
    const write = () => {
      saveAnimatedElementsTimer = null;
      try {
        const obj = {};
        for (const [id, config] of animatedElements.entries()) {
          obj[id] = config;
        }
        localStorage.setItem('excaliup_animated_elements', JSON.stringify(obj));
      } catch (error) {
        console.error('[Excali Up] Error saving animated elements:', error);
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
    let saved = localStorage.getItem('excaliup_settings');
    if (!saved) {
      saved = localStorage.getItem('excaligif_settings');
    }
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(currentSettings, Core.normalizeSettings(parsed, currentSettings));
    }
  } catch (e) {
    console.error("[Excali Up] Error loading saved settings:", e);
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
        console.log("[Excali Up] Skipping empty/placeholder image source for fileId:", this.fileId);
        return;
      }

      const abortController = new AbortController();
      this.abortController = abortController;
      this.lastSrc = src;

      try {
        console.log("[Excali Up] Fetching GIF data for fileId:", this.fileId, "src:", src.substring(0, 100));
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
        console.log(`[Excali Up] Decoding GIF: ${width}x${height}, ${numFrames} frames`);
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
          console.error("[Excali Up] Error initializing player for fileId " + this.fileId, e);
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

  function queueAnimatedSvgImport(markup) {
    if (!Core.isAnimatedSvgMarkup(markup)) return false;
    const now = Date.now();
    while (pendingAnimatedSvgImports.length && pendingAnimatedSvgImports[0].expiresAt <= now) {
      pendingAnimatedSvgImports.shift();
    }
    pendingAnimatedSvgImports.push({ markup, expiresAt: now + 10000 });
    return true;
  }

  function takePendingAnimatedSvgImport() {
    const now = Date.now();
    while (pendingAnimatedSvgImports.length && pendingAnimatedSvgImports[0].expiresAt <= now) {
      pendingAnimatedSvgImports.shift();
    }
    const pending = pendingAnimatedSvgImports.shift();
    return pending ? pending.markup : null;
  }

  function sanitizeAnimatedSvgMarkup(markup) {
    const documentNode = new DOMParser().parseFromString(markup, 'image/svg+xml');
    if (documentNode.querySelector('parsererror') || documentNode.documentElement.localName !== 'svg') {
      throw new Error('Invalid animated SVG');
    }

    for (const node of documentNode.querySelectorAll('script, foreignObject, iframe, object, embed')) {
      node.remove();
    }
    for (const node of documentNode.querySelectorAll('*')) {
      for (const attribute of [...node.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on')) {
          node.removeAttribute(attribute.name);
        } else if ((name === 'href' || name === 'xlink:href') && value && !value.startsWith('#')) {
          node.removeAttribute(attribute.name);
        }
      }
    }

    const svg = documentNode.documentElement;
    for (const animation of svg.querySelectorAll('animate, animateTransform, animateMotion')) {
      animation.setAttribute('repeatCount', 'indefinite');
    }
    const loopStyle = documentNode.createElementNS('http://www.w3.org/2000/svg', 'style');
    loopStyle.textContent = '* { animation-iteration-count: infinite !important; }';
    svg.appendChild(loopStyle);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('preserveAspectRatio', svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet');
    svg.style.display = 'block';
    return svg.outerHTML;
  }

  function ensureAnimatedSvgOverlay() {
    const interactiveCanvas = document.querySelector('.excalidraw__canvas.interactive');
    if (!interactiveCanvas || !interactiveCanvas.parentNode) return null;

    let overlay = document.getElementById('ExcaliGifSvgOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ExcaliGifSvgOverlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.overflow = 'hidden';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '2';
      interactiveCanvas.parentNode.insertBefore(overlay, interactiveCanvas.nextSibling);
      if (window.getComputedStyle(interactiveCanvas.parentNode).position === 'static') {
        interactiveCanvas.parentNode.style.position = 'relative';
      }
    }

    const width = interactiveCanvas.clientWidth;
    const height = interactiveCanvas.clientHeight;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    return overlay;
  }

  function removeAnimatedSvgOverlayIfEmpty() {
    const overlay = document.getElementById('ExcaliGifSvgOverlay');
    if (overlay && !overlay.childElementCount) overlay.remove();
  }

  function stopAnimatedSvgOverlayLoop() {
    if (svgOverlayTimer) {
      clearTimeout(svgOverlayTimer);
      svgOverlayTimer = null;
    }
  }

  function updateAnimatedSvgOverlay() {
    svgOverlayTimer = null;
    if (document.hidden || !currentSettings.animatedSvgsEnabled || !currentApp || !activeAnimatedSvgs.size) return;

    const overlay = ensureAnimatedSvgOverlay();
    if (!overlay) return;
    const elements = currentApp.api.getSceneElements();
    const imagesByFileId = new Map();
    for (const element of elements) {
      if (element.type === 'image' && !element.isDeleted && element.fileId) {
        if (!imagesByFileId.has(element.fileId)) imagesByFileId.set(element.fileId, []);
        imagesByFileId.get(element.fileId).push(element);
      }
    }

    const zoom = currentApp.state.zoom ? currentApp.state.zoom.value : 1;
    const scrollX = currentApp.state.scrollX || 0;
    const scrollY = currentApp.state.scrollY || 0;
    for (const player of activeAnimatedSvgs.values()) {
      const playerElements = player.isPlaying ? imagesByFileId.get(player.fileId) || [] : [];
      player.syncOverlayElements(playerElements);
      for (const element of playerElements) {
        const overlayElement = player.overlayElements.get(element.id);
        if (!overlayElement) continue;
        const scaleX = Array.isArray(element.scale) ? element.scale[0] : 1;
        const scaleY = Array.isArray(element.scale) ? element.scale[1] : 1;
        const left = (element.x + scrollX) * zoom;
        const top = (element.y + scrollY) * zoom;
        const width = Math.abs(element.width * zoom);
        const height = Math.abs(element.height * zoom);
        const angle = element.angle || 0;
        const opacity = element.opacity == null ? 1 : element.opacity / 100;
        const signature = [left, top, width, height, angle, scaleX, scaleY, opacity]
          .map(value => Math.round(value * 1000) / 1000)
          .join(':');

        if (signature !== player.lastTransforms.get(element.id)) {
          player.lastTransforms.set(element.id, signature);
          const style = overlayElement.style;
          style.left = `${left}px`;
          style.top = `${top}px`;
          style.width = `${width}px`;
          style.height = `${height}px`;
          style.opacity = String(opacity);
          style.transform = `rotate(${angle}rad) scale(${scaleX}, ${scaleY})`;
        }
        overlayElement.style.display = 'block';
      }
    }

    // The SVG timeline is browser-native; this timer only tracks Excalidraw transforms.
    svgOverlayTimer = setTimeout(updateAnimatedSvgOverlay, 33);
  }

  function scheduleAnimatedSvgOverlay() {
    if (!svgOverlayTimer && !document.hidden && currentSettings.animatedSvgsEnabled && currentApp) {
      svgOverlayTimer = setTimeout(updateAnimatedSvgOverlay, 0);
    }
  }

  class AnimatedSvgPlayer {
    constructor(fileId, cacheEntry, sourceMarkup = null) {
      this.fileId = fileId;
      this.cacheEntry = cacheEntry;
      this.originalImage = cacheEntry.image;
      this.sourceMarkup = sourceMarkup;
      this.safeMarkup = '';
      this.transparentCanvas = null;
      this.overlayElements = new Map();
      this.svgElements = new Map();
      this.lastTransforms = new Map();
      this.lastSrc = '';
      this.isLoaded = false;
      this.isPlaying = false;
      this.isDestroyed = false;
      this.decodeGeneration = 0;
      this.abortController = null;
      this.loadPromise = this.init();
    }

    async init() {
      const src = this.cacheEntry && this.cacheEntry.image && this.cacheEntry.image.src;
      const generation = ++this.decodeGeneration;
      if (this.abortController) this.abortController.abort();
      this.abortController = null;
      this.lastSrc = src || '';
      this.isLoaded = false;

      if (!src && !this.sourceMarkup) return;
      // Let the image-cache hook register this player before any scene refresh can run.
      await Promise.resolve();
      if (this.isDestroyed || generation !== this.decodeGeneration) return;

      const abortController = new AbortController();
      this.abortController = abortController;
      try {
        let markup = this.sourceMarkup;
        if (!markup) {
          const response = await fetch(src, { signal: abortController.signal });
          if (!response.ok && !src.startsWith('data:') && !src.startsWith('blob:')) {
            throw new Error(`SVG request failed with status ${response.status}`);
          }
          markup = await response.text();
        }
        if (this.isDestroyed || generation !== this.decodeGeneration) return;

        if (!Core.isAnimatedSvgMarkup(markup)) {
          if (activeAnimatedSvgs.get(this.fileId) === this) activeAnimatedSvgs.delete(this.fileId);
          return;
        }

        const intrinsicSize = Core.getSvgIntrinsicSize(markup, 96);
        const safeMarkup = sanitizeAnimatedSvgMarkup(markup);
        if (this.isDestroyed || generation !== this.decodeGeneration) return;

        const width = intrinsicSize.width;
        const height = intrinsicSize.height;
        const transparentCanvas = document.createElement('canvas');
        transparentCanvas.width = width;
        transparentCanvas.height = height;
        Object.defineProperties(transparentCanvas, {
          tagName: { value: 'IMG' },
          complete: { value: true },
          naturalWidth: { value: width },
          naturalHeight: { value: height }
        });

        this.safeMarkup = safeMarkup;
        this.transparentCanvas = transparentCanvas;
        this.isLoaded = true;
        if (currentSettings.animatedSvgsEnabled) this.start();
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error(`[Excali Up] Animated SVG detection failed for ${this.fileId}:`, error);
        }
      } finally {
        if (this.abortController === abortController) this.abortController = null;
      }
    }

    updateCacheEntry(cacheEntry) {
      const incomingImage = cacheEntry && cacheEntry.image;
      this.cacheEntry = cacheEntry;
      if (this.isLoaded && this.transparentCanvas && this.isPlaying) {
        cacheEntry.image = this.transparentCanvas;
        return;
      }
      if (incomingImage) this.originalImage = incomingImage;
      const src = incomingImage && incomingImage.src;
      if (src && src !== this.lastSrc && !this.sourceMarkup) this.loadPromise = this.init();
    }

    syncOverlayElements(elements) {
      const activeElementIds = new Set(elements.map(element => element.id));
      for (const [elementId, overlayElement] of this.overlayElements.entries()) {
        if (!activeElementIds.has(elementId)) {
          overlayElement.remove();
          this.overlayElements.delete(elementId);
          this.svgElements.delete(elementId);
          this.lastTransforms.delete(elementId);
        }
      }

      const overlay = ensureAnimatedSvgOverlay();
      if (!overlay) return;
      for (const element of elements) {
        if (this.overlayElements.has(element.id)) continue;
        const overlayElement = document.createElement('div');
        overlayElement.dataset.fileId = this.fileId;
        overlayElement.dataset.elementId = element.id;
        overlayElement.style.position = 'absolute';
        overlayElement.style.transformOrigin = 'center center';
        overlayElement.style.pointerEvents = 'none';
        overlayElement.style.display = 'none';
        const shadowRoot = overlayElement.attachShadow({ mode: 'closed' });
        shadowRoot.innerHTML = this.safeMarkup;
        overlay.appendChild(overlayElement);
        this.overlayElements.set(element.id, overlayElement);
        this.svgElements.set(element.id, shadowRoot.querySelector('svg'));
      }
    }

    start() {
      if (this.isDestroyed || !this.isLoaded) return;
      if (this.cacheEntry && this.transparentCanvas) this.cacheEntry.image = this.transparentCanvas;
      this.isPlaying = true;
      for (const svgElement of this.svgElements.values()) {
        if (svgElement && typeof svgElement.unpauseAnimations === 'function') svgElement.unpauseAnimations();
      }
      refreshGifElements(new Set([this.fileId]));
      scheduleAnimatedSvgOverlay();
    }

    stop() {
      this.isPlaying = false;
      if (this.cacheEntry && this.originalImage) this.cacheEntry.image = this.originalImage;
      for (const overlayElement of this.overlayElements.values()) overlayElement.style.display = 'none';
      for (const svgElement of this.svgElements.values()) {
        if (svgElement && typeof svgElement.pauseAnimations === 'function') svgElement.pauseAnimations();
      }
      if (!this.isDestroyed) refreshGifElements(new Set([this.fileId]));
    }

    destroy() {
      this.stop();
      this.isDestroyed = true;
      this.decodeGeneration++;
      if (this.abortController) this.abortController.abort();
      this.abortController = null;
      for (const overlayElement of this.overlayElements.values()) overlayElement.remove();
      if (this.transparentCanvas) {
        this.transparentCanvas.width = 0;
        this.transparentCanvas.height = 0;
      }
      this.overlayElements.clear();
      this.svgElements.clear();
      this.lastTransforms.clear();
      this.transparentCanvas = null;
      this.cacheEntry = null;
      this.isLoaded = false;
      removeAnimatedSvgOverlayIfEmpty();
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
            console.log("[Excali Up] Hooked new GIF fileId:", fileId);
            activeGifs.set(fileId, new GifPlayer(fileId, cacheEntry, app));
          } else {
            const player = activeGifs.get(fileId);
            player.cacheEntry = cacheEntry;
            
            // Check if the image source changed from the placeholder to a real URL
            if (cacheEntry.image && cacheEntry.image.src && cacheEntry.image.src !== player.lastSrc) {
              console.log("[Excali Up] Image source changed for fileId:", fileId, ". Re-initializing...");
              player.originalImage = cacheEntry.image;
              player.loadPromise = player.init();
            }

            if (currentSettings.gifsEnabled && player.activeCanvas) {
              cacheEntry.image = player.activeCanvas;
            }
          }
        } else if (cacheEntry && cacheEntry.mimeType === 'image/svg+xml') {
          if (!activeAnimatedSvgs.has(fileId)) {
            const sourceMarkup = takePendingAnimatedSvgImport();
            activeAnimatedSvgs.set(fileId, new AnimatedSvgPlayer(fileId, cacheEntry, sourceMarkup));
          } else {
            activeAnimatedSvgs.get(fileId).updateCacheEntry(cacheEntry);
          }
        }
        return res;
      };

      app.imageCache.set = wrappedSet;
      app.imageCache.excaligifHook = { originalSet, wrappedSet };

      // Scan existing GIF cache entries
      for (const [fileId, cacheEntry] of app.imageCache.entries()) {
        if (cacheEntry && cacheEntry.mimeType === 'image/gif' && !activeGifs.has(fileId)) {
          console.log("[Excali Up] Hooked existing GIF fileId:", fileId);
          activeGifs.set(fileId, new GifPlayer(fileId, cacheEntry, app));
        } else if (cacheEntry && cacheEntry.mimeType === 'image/svg+xml' && !activeAnimatedSvgs.has(fileId)) {
          activeAnimatedSvgs.set(fileId, new AnimatedSvgPlayer(fileId, cacheEntry));
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
    stopAnimatedSvgOverlayLoop();
    if (animationMetadataTimer) clearTimeout(animationMetadataTimer);
    animationMetadataTimer = null;
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    pendingAnimationMetadata.clear();
    pendingAnimationMetadataRemovals.clear();
    for (const player of activeGifs.values()) player.destroy();
    activeGifs.clear();
    for (const player of activeAnimatedSvgs.values()) player.destroy();
    activeAnimatedSvgs.clear();
    pendingAnimatedSvgImports.length = 0;
    geometryCache.clear();
    unhookImageCache(currentApp);
    removeSidebarElements();
    removeVaultUI();
    currentApp = null;
    toolbarRenderSignature = '';
  }

  function attachApp(app) {
    if (app === currentApp) return;
    if (currentApp) detachCurrentApp();

    console.log("[Excali Up] Hooked Excalidraw instance!");
    currentApp = app;
    hookImageCache(app);
    createToolbar();
    createSidebarButtonAndPanel();
    createVaultUI();
    scanAndCleanupMedia();
    updateToolbar(true);
    reconcileRuntime();
  }

  function scanAndCleanupMedia() {
    if (!currentApp) return;
    const elements = currentApp.api ? currentApp.api.getSceneElements() : [];
    const activeFileIds = new Set(elements.filter(e => e.type === 'image').map(e => e.fileId));
    
    for (const [fileId, player] of activeGifs.entries()) {
      const cacheEntry = currentApp.imageCache.get(fileId);
      if (!activeFileIds.has(fileId) || !cacheEntry) {
        console.log("[Excali Up] Cleaning up player for fileId:", fileId);
        player.destroy();
        activeGifs.delete(fileId);
      }
    }
    for (const [fileId, player] of activeAnimatedSvgs.entries()) {
      const cacheEntry = currentApp.imageCache.get(fileId);
      if (!activeFileIds.has(fileId) || !cacheEntry) {
        player.destroy();
        activeAnimatedSvgs.delete(fileId);
      }
    }
    if (!activeAnimatedSvgs.size) stopAnimatedSvgOverlayLoop();
    
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
    scanAndCleanupMedia();
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
    // Every write to animatedElements stores a normalized config already.
    return animatedElements.get(elId) || DEFAULT_ELEMENT_CONFIG;
  }

  function getElementOffset(config, globalOffset) {
    return Core.getElementOffset(config, globalOffset);
  }

  const reducedMotionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  function isMotionReduced() {
    return !!(currentSettings.respectReducedMotion && reducedMotionQuery && reducedMotionQuery.matches);
  }

  if (reducedMotionQuery && typeof reducedMotionQuery.addEventListener === 'function') {
    reducedMotionQuery.addEventListener('change', () => {
      stopOverlayLoop();
      reconcileFlowRuntime();
    });
  }

  function getOverlayTarget() {
    if (!overlayInteractiveCanvas || !overlayInteractiveCanvas.isConnected) {
      overlayInteractiveCanvas = document.querySelector('.excalidraw__canvas.interactive');
    }
    const interactiveCanvas = overlayInteractiveCanvas;
    if (!interactiveCanvas || !interactiveCanvas.parentNode) return null;

    if (!overlayCanvasElement || !overlayCanvasElement.isConnected) {
      overlayCanvasElement = document.getElementById('ExcaliGifOverlayCanvas');
      if (!overlayCanvasElement) {
        overlayCanvasElement = document.createElement('canvas');
        overlayCanvasElement.id = 'ExcaliGifOverlayCanvas';
        overlayCanvasElement.style.position = 'absolute';
        overlayCanvasElement.style.top = '0';
        overlayCanvasElement.style.left = '0';
        overlayCanvasElement.style.pointerEvents = 'none';
        interactiveCanvas.parentNode.insertBefore(overlayCanvasElement, interactiveCanvas.nextSibling);
        if (window.getComputedStyle(interactiveCanvas.parentNode).position === 'static') {
          interactiveCanvas.parentNode.style.position = 'relative';
        }
      }
      overlayContext = overlayCanvasElement.getContext('2d');
      overlayIsClear = false;
    }
    return { interactiveCanvas, canvas: overlayCanvasElement, ctx: overlayContext };
  }

  function clearOverlay() {
    if (overlayIsClear) return;
    const canvas = overlayCanvasElement && overlayCanvasElement.isConnected
      ? overlayCanvasElement
      : document.getElementById('ExcaliGifOverlayCanvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    overlayIsClear = true;
  }

  function getStaticFrameSignature() {
    if (!currentApp || !currentApp.state) return '';
    const state = currentApp.state;
    const nonce = currentApp.scene && typeof currentApp.scene.getSceneNonce === 'function'
      ? currentApp.scene.getSceneNonce()
      : Math.floor(performance.now() / 250);
    const canvas = overlayInteractiveCanvas;
    return [
      state.zoom ? state.zoom.value : 1,
      state.scrollX,
      state.scrollY,
      nonce,
      canvas ? canvas.clientWidth : 0,
      canvas ? canvas.clientHeight : 0,
      animatedElementsRevision
    ].join('|');
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
    lastStaticFrameSignature = '';

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

      if (isMotionReduced()) {
        // Keep effects visible but frozen; only redraw when the view changes.
        const signature = getStaticFrameSignature();
        if (signature !== lastStaticFrameSignature) {
          lastStaticFrameSignature = signature;
          drawOverlay(flowOffset);
        }
      } else {
        const frameDelta = lastFlowDrawAt ? timestamp - lastFlowDrawAt : flowFrameBudget.frameInterval;
        if (!lastFlowDrawAt || frameDelta >= flowFrameBudget.frameInterval - 1) {
          // Clamp long gaps (tab switches, breakpoints) so effects do not jump.
          flowOffset += Math.min(frameDelta, 100) / 16.666;
          const drawStartedAt = performance.now();
          drawOverlay(flowOffset);
          flowFrameBudget.record(timestamp, performance.now() - drawStartedAt, frameDelta);
          lastFlowDrawAt = timestamp;
        }
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
    clearOverlay();
    lastFlowDrawAt = 0;
  }

  function drawOverlay(offset) {
    if (!currentApp || !currentSettings.flowEnabled) {
      clearOverlay();
      return;
    }
    const target = getOverlayTarget();
    if (!target) return;
    const { interactiveCanvas, canvas: overlayCanvas, ctx } = target;

    const width = interactiveCanvas.clientWidth;
    const height = interactiveCanvas.clientHeight;
    // Under sustained load the overlay drops to 1x resolution to cut fill cost.
    const maxPixelRatio = flowFrameBudget.mode === 'full' ? 2 : 1;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (overlayCanvas.width !== pixelWidth || overlayCanvas.height !== pixelHeight) {
      overlayCanvas.width = pixelWidth;
      overlayCanvas.height = pixelHeight;
      overlayCanvas.style.width = `${width}px`;
      overlayCanvas.style.height = `${height}px`;
      overlayIsClear = true;
    }

    const zoomVal = currentApp.state.zoom ? currentApp.state.zoom.value : 1;
    const scrollXVal = currentApp.state.scrollX || 0;
    const scrollYVal = currentApp.state.scrollY || 0;
    const viewportBounds = Core.getViewportBounds(width, height, zoomVal, scrollXVal, scrollYVal, 40);
    const view = {
      zoom: zoomVal,
      sampleScale: flowFrameBudget.sampleScale,
      bounds: viewportBounds
    };

    // Collect visible work first so an idle overlay is not cleared every frame.
    const elementsMap = getSceneElementsMap();
    const visible = [];
    for (const elementId of animatedElements.keys()) {
      const el = elementsMap.get(elementId);
      if (!el || !shouldAnimateElement(el)) continue;
      const geometry = getCachedGeometry(el);
      if (geometry.totalLength > 0 && Core.intersectsBounds(geometry.bounds, viewportBounds)) {
        visible.push(el, geometry);
      }
    }

    if (visible.length === 0) {
      clearOverlay();
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const scale = pixelRatio * zoomVal;
    ctx.setTransform(scale, 0, 0, scale, scale * scrollXVal, scale * scrollYVal);
    for (let index = 0; index < visible.length; index += 2) {
      const el = visible[index];
      const config = getElementConfig(el.id);
      flowRenderer.draw(ctx, el, visible[index + 1], getElementOffset(config, offset), config, view);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    overlayIsClear = false;
  }

  function reconcileRuntime() {
    if (currentSettings.gifsEnabled && !document.hidden) {
      for (const player of activeGifs.values()) {
        if (player.isLoaded && !player.isPlaying) player.start();
      }
      scheduleGifTick();
    } else if (!currentSettings.gifsEnabled || document.hidden) {
      for (const player of activeGifs.values()) {
        if (player.isPlaying) player.stop();
      }
      stopGifScheduler();
    }

    if (currentSettings.animatedSvgsEnabled && !document.hidden) {
      for (const player of activeAnimatedSvgs.values()) {
        if (player.isLoaded && !player.isPlaying) player.start();
      }
      scheduleAnimatedSvgOverlay();
    } else {
      for (const player of activeAnimatedSvgs.values()) {
        if (player.isPlaying) player.stop();
      }
      stopAnimatedSvgOverlayLoop();
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

  // ═══════════════════════════════════════════════
  // IN-CANVAS FLOATING TOOLBAR
  // ═══════════════════════════════════════════════

  const ANIMATION_STYLES = [
    { id: 'particles', label: 'Particles', icon: '●' },
    { id: 'comet', label: 'Comet', icon: '&#9732;' },
    { id: 'dashes', label: 'Ants', icon: '⋯' },
    { id: 'gradient', label: 'Pulse', icon: '◐' },
    { id: 'wave', label: 'Wave', icon: '&#8767;' },
    { id: 'dual', label: 'Dual', icon: '&#8644;' },
    { id: 'ripple', label: 'Ripple', icon: '◎' },
    { id: 'train', label: 'Packet', icon: '▸▸' },
  ];

  // Excalidraw's own stroke quick picks, plus violet and cyan.
  const FLOW_COLOR_SWATCHES = [
    { value: '#1e1e1e', label: 'Black' },
    { value: '#e03131', label: 'Red' },
    { value: '#2f9e44', label: 'Green' },
    { value: '#1971c2', label: 'Blue' },
    { value: '#f08c00', label: 'Orange' },
    { value: '#9c36b5', label: 'Violet' },
    { value: '#0c8599', label: 'Cyan' }
  ];

  let panelOpen = false;

  // Styles use Excalidraw's theme tokens, so the bar follows light/dark mode.
  function injectToolbarStyles() {
    if (document.getElementById('excaligif-toolbar-styles')) return;

    const style = document.createElement('style');
    style.id = 'excaligif-toolbar-styles';
    style.textContent = `
      .excaligif-toolbar {
        --xt-bg: var(--island-bg-color, #ffffff);
        --xt-text: var(--text-primary-color, #1b1b1f);
        --xt-muted: color-mix(in srgb, var(--xt-text) 60%, transparent);
        --xt-faint: color-mix(in srgb, var(--xt-text) 40%, transparent);
        --xt-border: color-mix(in srgb, var(--xt-text) 11%, transparent);
        --xt-surface: var(--color-surface-low, #ececf4);
        --xt-hover: var(--button-hover-bg, #f1f0ff);
        --xt-primary: var(--color-primary, #6965db);
        --xt-primary-soft: color-mix(in srgb, var(--xt-primary) 16%, transparent);
        --xt-danger: var(--color-danger, #db6965);
        --xt-radius: var(--border-radius-lg, 0.5rem);
        --xt-shadow: var(--shadow-island, 0 0 0 1px rgba(0, 0, 0, 0.08), 0 7px 14px rgba(0, 0, 0, 0.1));
        position: absolute;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        max-width: calc(100% - 24px);
        font-family: var(--ui-font, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
        color: var(--xt-text);
        user-select: none;
      }
      body > .excaligif-toolbar { position: fixed; }
      .excaligif-toolbar * { box-sizing: border-box; }
      .excaligif-toolbar button {
        font: inherit;
        color: inherit;
      }
      .excaligif-toolbar :focus-visible {
        outline: 2px solid var(--xt-primary);
        outline-offset: 1px;
      }
      .excaligif-toolbar.visible {
        display: flex;
        animation: excaligif-fadeIn 0.16s ease-out;
      }
      @keyframes excaligif-fadeIn {
        from { opacity: 0; transform: translateX(-50%) translateY(6px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .excaligif-toolbar.visible,
        .excaligif-toolbar-panel { animation: none; }
      }

      /* Tuning panel above the bar */
      .excaligif-toolbar-panel {
        display: none;
        flex-direction: column;
        gap: 10px;
        width: 340px;
        max-width: 100%;
        padding: 12px;
        background: var(--xt-bg);
        border-radius: calc(var(--xt-radius) * 1.5);
        box-shadow: var(--xt-shadow);
        animation: excaligif-slideUp 0.16s ease-out;
      }
      .excaligif-toolbar-panel.visible { display: flex; }
      @keyframes excaligif-slideUp {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .excaligif-panel-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .excaligif-panel-row > span {
        width: 56px;
        flex-shrink: 0;
        color: var(--xt-muted);
        font-size: 11px;
        font-weight: 600;
      }

      /* Colour swatches */
      .excaligif-swatches {
        display: flex;
        flex: 1;
        flex-wrap: wrap;
        gap: 4px;
      }
      .excaligif-swatch {
        position: relative;
        width: 22px;
        height: 22px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
      }
      .excaligif-swatch::before {
        content: "";
        position: absolute;
        inset: 2px;
        border-radius: 4px;
        background: var(--swatch-color, transparent);
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
        /* Show colours the way the canvas renders them (inverted in dark mode). */
        filter: var(--theme-filter, none);
      }
      .excaligif-swatch:hover::before { inset: 1px; }
      .excaligif-swatch.active { box-shadow: 0 0 0 2px var(--xt-primary); }
      .excaligif-swatch.is-auto::after {
        content: "A";
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-size: 10px;
        font-weight: 800;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
      }
      .excaligif-swatch-sep {
        width: 1px;
        align-self: stretch;
        margin: 2px 1px;
        background: var(--xt-border);
      }
      .excaligif-swatch.is-custom::before {
        background: conic-gradient(#e03131, #f08c00, #ffd43b, #2f9e44, #1971c2, #9c36b5, #e03131);
        filter: none;
      }
      .excaligif-swatch.is-custom.active::before {
        background: var(--swatch-color);
        filter: var(--theme-filter, none);
      }
      .excaligif-swatch input[type="color"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
        border: none;
        padding: 0;
      }

      /* Pill selectors */
      .excaligif-pill-group {
        display: flex;
        flex: 1;
        gap: 2px;
        padding: 2px;
        border-radius: var(--xt-radius);
        background: var(--xt-surface);
      }
      .excaligif-pill-group button {
        flex: 1;
        height: 24px;
        padding: 0 6px;
        border: none;
        border-radius: calc(var(--xt-radius) - 2px);
        background: transparent;
        color: var(--xt-muted);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.12s ease, color 0.12s ease;
      }
      .excaligif-pill-group button:hover { color: var(--xt-text); }
      .excaligif-pill-group button.active {
        background: var(--xt-bg);
        color: var(--xt-primary);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
      }

      /* Sliders */
      .excaligif-range-group {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 8px;
      }
      .excaligif-range-group input[type="range"] {
        flex: 1;
        margin: 0;
        accent-color: var(--xt-primary);
        cursor: pointer;
      }
      .excaligif-range-group span {
        min-width: 34px;
        color: var(--xt-muted);
        font-size: 11px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        text-align: right;
      }

      /* Main bar */
      .excaligif-toolbar-main {
        display: flex;
        align-items: center;
        gap: 2px;
        max-width: 100%;
        padding: 4px;
        overflow-x: auto;
        scrollbar-width: none;
        background: var(--xt-bg);
        border-radius: var(--xt-radius);
        box-shadow: var(--xt-shadow);
      }
      .excaligif-toolbar-main::-webkit-scrollbar { display: none; }
      .excaligif-toolbar-label {
        padding: 0 6px 0 8px;
        color: var(--xt-muted);
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      .excaligif-toolbar-label span { color: var(--xt-primary); }
      .excaligif-toolbar-divider {
        width: 1px;
        height: 20px;
        margin: 0 4px;
        flex-shrink: 0;
        background: var(--xt-border);
      }
      .excaligif-toolbar-btn {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 5px;
        height: 32px;
        padding: 0 10px;
        border: none;
        border-radius: calc(var(--xt-radius) - 1px);
        background: transparent;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color 0.12s ease, color 0.12s ease;
      }
      .excaligif-toolbar-btn:hover { background: var(--xt-hover); }
      .excaligif-toolbar-btn.active {
        background: var(--xt-primary-soft);
        color: var(--xt-primary);
        font-weight: 600;
      }
      .excaligif-toolbar-icon {
        width: 14px;
        font-size: 13px;
        line-height: 1;
        text-align: center;
      }
      .excaligif-toolbar-btn.icon-only {
        width: 32px;
        padding: 0;
        justify-content: center;
      }
      .excaligif-toolbar-btn.icon-only iconify-icon {
        display: inline-flex;
        font-size: 17px;
      }
      .excaligif-toolbar-btn.color-btn .excaligif-color-dot {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--swatch-color, currentColor);
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
        filter: var(--theme-filter, none);
      }
      .excaligif-toolbar-btn.remove { color: var(--xt-muted); }
      .excaligif-toolbar-btn.remove:hover {
        background: color-mix(in srgb, var(--xt-danger) 14%, transparent);
        color: var(--xt-danger);
      }
    `;
    document.head.appendChild(style);
  }

  function mountToolbar() {
    if (!toolbarElement) return;
    const container = document.querySelector('.excalidraw') || document.body;
    if (toolbarElement.parentElement !== container) container.appendChild(toolbarElement);
  }

  function createIconButton(className, icon, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `excaligif-toolbar-btn icon-only ${className}`;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = `<iconify-icon icon="${icon}" aria-hidden="true"></iconify-icon>`;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    return button;
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    updateToolbarPanelVisibility();
  }

  function createToolbar() {
    if (toolbarElement && toolbarElement.isConnected) {
      mountToolbar();
      return;
    }
    if (toolbarElement) toolbarElement.remove();
    injectToolbarStyles();

    const toolbar = document.createElement('div');
    toolbar.className = 'excaligif-toolbar';
    toolbar.id = 'excaligif-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Line and arrow motion');

    // 1. Settings Panel
    const panel = document.createElement('div');
    panel.className = 'excaligif-toolbar-panel';
    panel.id = 'excaligif-toolbar-panel';

    panel.appendChild(createColorRow());

    panel.appendChild(createPillRow('Speed', 'speed', [
      { val: 'slow', label: 'Slow' },
      { val: 'medium', label: 'Medium' },
      { val: 'fast', label: 'Fast' }
    ]));

    panel.appendChild(createPillRow('Direction', 'direction', [
      { val: 'forward', label: 'Forward' },
      { val: 'reverse', label: 'Reverse' },
      { val: 'bounce', label: 'Bounce' }
    ]));

    panel.appendChild(createPillRow('Glow', 'glowIntensity', [
      { val: 'none', label: 'None' },
      { val: 'subtle', label: 'Subtle' },
      { val: 'medium', label: 'Medium' },
      { val: 'strong', label: 'Strong' }
    ]));

    panel.appendChild(createSliderRow('Size', 'excaligif-size-input', 'excaligif-size-val', 1, 5, 3, 1, 'particleSize'));
    panel.appendChild(createSliderRow('Spacing', 'excaligif-spacing-input', 'excaligif-spacing-val', 20, 120, 50, 5, 'particleSpacing'));

    toolbar.appendChild(panel);

    // 2. Main Bar
    const mainBar = document.createElement('div');
    mainBar.className = 'excaligif-toolbar-main';

    const label = document.createElement('div');
    label.className = 'excaligif-toolbar-label';
    label.innerHTML = 'Excali<span>Up</span>';
    mainBar.appendChild(label);

    const div1 = document.createElement('div');
    div1.className = 'excaligif-toolbar-divider';
    mainBar.appendChild(div1);

    for (const animStyle of ANIMATION_STYLES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'excaligif-toolbar-btn';
      btn.dataset.style = animStyle.id;
      btn.innerHTML = '<span class="excaligif-toolbar-icon" aria-hidden="true">' + animStyle.icon + '</span>' + animStyle.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onStyleButtonClick(animStyle.id);
      });
      mainBar.appendChild(btn);
    }

    const div2 = document.createElement('div');
    div2.className = 'excaligif-toolbar-divider';
    mainBar.appendChild(div2);

    // Effect colour: shows the current colour and opens the tuning panel.
    const colorBtn = document.createElement('button');
    colorBtn.type = 'button';
    colorBtn.className = 'excaligif-toolbar-btn icon-only color-btn';
    colorBtn.id = 'excaligif-color-btn';
    colorBtn.title = 'Effect color';
    colorBtn.setAttribute('aria-label', 'Effect color');
    colorBtn.innerHTML = '<span class="excaligif-color-dot" aria-hidden="true"></span>';
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      togglePanel();
    });
    mainBar.appendChild(colorBtn);

    const gearBtn = createIconButton('gear', 'lucide:sliders-horizontal', 'Tune animation', togglePanel);
    gearBtn.id = 'excaligif-gear-btn';
    mainBar.appendChild(gearBtn);

    const removeBtn = createIconButton('remove', 'lucide:x', 'Remove animation', onRemoveClick);
    removeBtn.dataset.style = 'remove';
    mainBar.appendChild(removeBtn);

    toolbar.appendChild(mainBar);

    toolbarElement = toolbar;
    mountToolbar();
  }

  function createColorRow() {
    const row = document.createElement('div');
    row.className = 'excaligif-panel-row';

    const span = document.createElement('span');
    span.textContent = 'Color';
    row.appendChild(span);

    const group = document.createElement('div');
    group.className = 'excaligif-swatches';
    group.id = 'excaligif-color-swatches';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Effect color');

    const addSwatch = (value, labelText, extraClass = '') => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `excaligif-swatch ${extraClass}`.trim();
      btn.dataset.color = value;
      btn.title = labelText;
      btn.setAttribute('aria-label', labelText);
      if (value !== 'auto') btn.style.setProperty('--swatch-color', value);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        updateElementSetting('color', value === 'auto' ? null : value);
      });
      group.appendChild(btn);
      return btn;
    };

    addSwatch('auto', 'Match the line color', 'is-auto');
    const separator = document.createElement('span');
    separator.className = 'excaligif-swatch-sep';
    group.appendChild(separator);
    for (const swatch of FLOW_COLOR_SWATCHES) addSwatch(swatch.value, swatch.label);

    // Custom colour: a native picker hidden inside a rainbow swatch.
    const custom = document.createElement('label');
    custom.className = 'excaligif-swatch is-custom';
    custom.title = 'Custom color';
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.id = 'excaligif-color-picker';
    picker.setAttribute('aria-label', 'Custom color');
    picker.addEventListener('input', (e) => updateElementSetting('color', e.target.value, false));
    picker.addEventListener('change', (e) => updateElementSetting('color', e.target.value));
    custom.appendChild(picker);
    group.appendChild(custom);

    row.appendChild(group);
    return row;
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
      btn.type = 'button';
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
    input.setAttribute('aria-label', labelName);

    const valSpan = document.createElement('span');
    valSpan.id = valId;
    valSpan.textContent = val;

    input.addEventListener('input', (e) => {
      valSpan.textContent = e.target.value;
      updateElementSetting(settingKey, parseInt(e.target.value, 10), false);
    });
    input.addEventListener('change', (e) => {
      updateElementSetting(settingKey, parseInt(e.target.value, 10));
    });

    group.appendChild(input);
    group.appendChild(valSpan);
    row.appendChild(group);
    return row;
  }

  // Reflects the selection's effect colour in the swatches and the bar button.
  function updateColorControls(elements, allAnimated) {
    const colorBtn = document.getElementById('excaligif-color-btn');
    if (colorBtn) colorBtn.style.display = allAnimated ? '' : 'none';
    if (!allAnimated) return;

    const colors = elements.map((element) => getElementConfig(element.id).color);
    const common = colors.every((color) => color === colors[0]) ? colors[0] : undefined;
    const strokeColor = elements[0].strokeColor || '#1e1e1e';
    const shown = common === undefined ? null : common || strokeColor;

    if (colorBtn) {
      colorBtn.style.setProperty('--swatch-color', shown || 'transparent');
      colorBtn.title = common === undefined
        ? 'Effect color (mixed)'
        : common ? `Effect color ${common}` : 'Effect color (matches the line)';
    }

    const swatches = document.getElementById('excaligif-color-swatches');
    if (!swatches) return;
    const auto = swatches.querySelector('.is-auto');
    if (auto) {
      auto.style.setProperty('--swatch-color', strokeColor);
      auto.classList.toggle('active', common === null);
    }
    let matchedPreset = common === null || common === undefined;
    for (const swatch of swatches.querySelectorAll('.excaligif-swatch[data-color]:not(.is-auto)')) {
      const isActive = swatch.dataset.color === common;
      swatch.classList.toggle('active', isActive);
      if (isActive) matchedPreset = true;
    }
    const custom = swatches.querySelector('.is-custom');
    const picker = document.getElementById('excaligif-color-picker');
    if (custom) {
      custom.classList.toggle('active', !matchedPreset);
      if (!matchedPreset) custom.style.setProperty('--swatch-color', common);
    }
    if (picker && document.activeElement !== picker) {
      picker.value = /^#[0-9a-f]{6}$/i.test(common || '') ? common : (/^#[0-9a-f]{6}$/i.test(strokeColor) ? strokeColor : '#1e1e1e');
    }
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
      toolbarRenderSignature = getToolbarSignature(elements);
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
    const isOpen = panelOpen && allAnimated;
    panel.classList.toggle('visible', isOpen);
    gearBtn.classList.toggle('active', isOpen);
    gearBtn.setAttribute('aria-expanded', String(isOpen));
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

  function getToolbarSignature(elements) {
    // Stroke colours are included so the "match line" swatch stays current.
    const strokes = elements.map((element) => element.strokeColor).join(',');
    return `${getSelectionKey(elements)}:${animatedElementsRevision}:${panelOpen}:${strokes}`;
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
    mountToolbar();

    const elements = getSelectedAnimatableElements();
    if (elements.length > 0) syncAnimatedElementsFromScene(elements);
    const selectionKey = getSelectionKey(elements);
    const signature = elements.length > 0 && currentSettings.flowEnabled
      ? getToolbarSignature(elements)
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

    const buttons = toolbarElement.querySelectorAll('.excaligif-toolbar-main .excaligif-toolbar-btn[data-style]:not(.remove)');
    for (const btn of buttons) {
      const isActive = btn.dataset.style === activeStyle;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    }

    const gearBtn = document.getElementById('excaligif-gear-btn');
    if (gearBtn) {
      gearBtn.style.display = allAnimated ? '' : 'none';
      if (!allAnimated) {
        panelOpen = false;
      }
    }
    updateColorControls(elements, allAnimated);

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

  // Fast poll for element selection and UI mounting. Vault saves are driven
  // by Excalidraw's onChange subscription (see attachVaultChangeListener).
  setInterval(() => {
    if (currentApp && !document.hidden) {
      updateToolbar();
      updateSidebarTheme();
      mountVaultButton();
    }
  }, 250);

  window.addEventListener('beforeunload', flushVaultOnExit);

  // Listen for Toggle Event from Content Script
  document.addEventListener('ExcaliGifToggleState', (e) => {
    const targetEnabled = e.detail && e.detail.enabled;
    if (typeof targetEnabled !== 'boolean' || currentSettings.gifsEnabled === targetEnabled) return;
    currentSettings.gifsEnabled = targetEnabled;

    try {
      localStorage.setItem('excaliup_settings', JSON.stringify(currentSettings));
    } catch (error) {
      console.error('[Excali Up] Error saving settings:', error);
    }

    console.log("[Excali Up] GIF playback toggled to:", targetEnabled);
    reconcileRuntime();
    refreshGifElements(new Set(activeGifs.keys()));
  });

  // Listen for Update Settings Event from Content Script
  document.addEventListener('ExcaliGifUpdateSettings', (e) => {
    const previousSettings = { ...currentSettings };
    Object.assign(currentSettings, Core.normalizeSettings(e.detail, currentSettings));

    try {
      localStorage.setItem('excaliup_settings', JSON.stringify(currentSettings));
    } catch (error) {
      console.error('[Excali Up] Error saving settings:', error);
    }

    console.log("[Excali Up] Settings updated:", currentSettings);

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
      stopAnimatedSvgOverlayLoop();
      for (const player of activeAnimatedSvgs.values()) {
        if (player.isPlaying) player.stop();
      }
      if (saveAnimatedElementsTimer) saveAnimatedElements(true);
      flushVaultOnExit();
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
      activeAnimatedSvgCount: activeAnimatedSvgs.size,
      animatedElementCount: animatedElements.size,
      settings: { ...currentSettings }
    };
    document.dispatchEvent(new CustomEvent('ExcaliGifStatusResponse', { detail: reply }));
  });

  window.addEventListener('pagehide', () => {
    if (saveAnimatedElementsTimer) saveAnimatedElements(true);
    if (currentApp) detachCurrentApp();
  });

  // ═══════════════════════════════════════════════
  // ICONIFY MATERIAL ICONS & LUCIDE INTEGRATION
  // ═══════════════════════════════════════════════

  function injectSidebarStyles() {
    if (document.getElementById('excaligif-sidebar-styles')) return;
    const style = document.createElement('style');
    style.id = 'excaligif-sidebar-styles';
    style.textContent = `
      .excaligif-icon-card .excaligif-icon-glyph {
        font-size: 28px;
        margin-bottom: 4px;
        color: rgba(255, 255, 255, 0.85);
        transition: transform 0.22s cubic-bezier(0.25, 0.8, 0.25, 1), color 0.22s ease;
        display: inline-flex;
        line-height: 1;
        text-transform: none;
        letter-spacing: normal;
        word-wrap: normal;
        white-space: nowrap;
        direction: ltr;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Sidebar button (Dark Mode / Default) */
      .excaligif-icons-btn {
        position: absolute;
        bottom: 72px;
        right: 20px;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #1e1e24;
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 0 8px rgba(140, 90, 220, 0.08);
        cursor: pointer;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        outline: none;
      }
      .excaligif-icons-btn iconify-icon {
        font-size: 22px;
      }
      .excaligif-icons-btn:hover {
        transform: translateY(-2px) scale(1.05);
        box-shadow: 0 6px 16px rgba(140, 90, 220, 0.25), 0 0 12px rgba(140, 90, 220, 0.15);
        border-color: rgba(140, 90, 220, 0.5);
        color: hsl(270, 75%, 70%);
      }
      .excaligif-icons-btn.active {
        background: hsl(270, 75%, 64%);
        border-color: hsl(270, 75%, 64%);
        color: #fff;
        box-shadow: 0 0 16px hsla(270, 75%, 64%, 0.45);
      }

      /* Sidebar button (Light Mode Override) */
      .excaligif-icons-btn.theme--light {
        background: #ffffff;
        border-color: rgba(0, 0, 0, 0.15);
        color: #333333;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }
      .excaligif-icons-btn.theme--light:hover {
        border-color: rgba(140, 90, 220, 0.4);
        color: hsl(270, 75%, 45%);
        box-shadow: 0 6px 16px rgba(140, 90, 220, 0.15);
      }
      .excaligif-icons-btn.theme--light.active {
        background: hsl(270, 75%, 64%);
        border-color: hsl(270, 75%, 64%);
        color: #fff;
        box-shadow: 0 0 16px hsla(270, 75%, 64%, 0.3);
      }

      /* Sidebar panel (Dark Mode / Default) */
      .excaligif-icons-sidebar {
        position: absolute;
        top: 0;
        right: -330px;
        width: 320px;
        height: 100%;
        background: rgba(20, 20, 28, 0.94);
        border-left: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: -4px 0 24px rgba(0,0,0,0.45);
        z-index: 10001;
        display: flex;
        flex-direction: column;
        transition: right 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
        color: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
      .excaligif-icons-sidebar.open {
        right: 0;
      }

      .excaligif-icons-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .excaligif-icons-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.2px;
        background: linear-gradient(135deg, #fff 30%, hsl(270, 75%, 70%) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .excaligif-icons-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .excaligif-icons-coffee {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 8px;
        border: 1px solid rgba(245, 158, 66, 0.35);
        border-radius: 8px;
        background: rgba(245, 158, 66, 0.08);
        color: hsl(35, 90%, 72%);
        font-size: 10px;
        font-weight: 700;
        text-decoration: none;
        white-space: nowrap;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .excaligif-icons-coffee:hover {
        background: rgba(245, 158, 66, 0.16);
        border-color: rgba(245, 158, 66, 0.6);
      }
      .excaligif-icons-coffee iconify-icon {
        font-size: 13px;
      }
      .excaligif-icons-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.4);
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        transition: all 0.15s ease;
      }
      .excaligif-icons-close:hover {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.9);
      }

      .excaligif-icons-controls {
        padding: 14px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }

      .excaligif-icons-filters {
        display: grid;
        grid-template-columns: 1.5fr 1fr 1fr;
        gap: 8px;
      }
      .excaligif-icons-filter {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .excaligif-icons-filter label {
        color: rgba(255, 255, 255, 0.38);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.45px;
        text-transform: uppercase;
      }
      .excaligif-icons-filter select {
        width: 100%;
        min-width: 0;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.82);
        font-family: inherit;
        font-size: 11px;
        padding: 7px 8px;
        outline: none;
      }
      .excaligif-icons-filter select:focus {
        border-color: hsla(270, 75%, 64%, 0.5);
      }
      .excaligif-icons-filter option {
        background: #24242b;
        color: #fff;
      }

      .excaligif-icons-insert {
        display: grid;
        grid-template-columns: 1.3fr 1fr;
        gap: 8px;
      }
      .excaligif-icons-segmented.is-compact button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        font-size: 11px;
        padding: 4px 6px;
        border: 1px solid transparent;
      }
      .excaligif-color-swatch {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--excaligif-stroke, currentColor);
        box-shadow: 0 0 0 1px rgba(128, 128, 128, 0.45);
        flex-shrink: 0;
      }
      .excaligif-icons-sidebar.theme--dark .excaligif-color-swatch {
        filter: invert(93%) hue-rotate(180deg);
      }
      .excaligif-icons-sidebar.is-tinted .excaligif-icon-card .excaligif-icon-glyph,
      .excaligif-icons-sidebar.is-tinted .excaligif-icon-card:hover .excaligif-icon-glyph {
        /* Beats the theme-specific glyph colours defined further down. */
        color: var(--excaligif-stroke) !important;
      }
      /* Match the canvas, which renders strokes inverted in dark mode. */
      .excaligif-icons-sidebar.theme--dark.is-tinted .excaligif-icon-card .excaligif-icon-glyph {
        filter: invert(93%) hue-rotate(180deg);
      }
      .excaligif-icon-card.is-loading {
        pointer-events: none;
      }
      .excaligif-icon-card.is-loading .excaligif-icon-glyph {
        opacity: 0.2;
      }
      .excaligif-icon-card.is-loading::after {
        content: "";
        position: absolute;
        top: 22px;
        left: 50%;
        width: 16px;
        height: 16px;
        margin-left: -8px;
        border: 2px solid rgba(128, 128, 128, 0.3);
        border-top-color: currentColor;
        border-radius: 50%;
        animation: excaligif-spin 0.6s linear infinite;
      }

      .excaligif-icons-segmented {
        display: flex;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 2px;
      }
      .excaligif-icons-segmented button {
        flex: 1;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        padding: 6px;
        cursor: pointer;
        border-radius: 8px;
        transition: all 0.2s ease;
        outline: none;
      }
      .excaligif-icons-segmented button.active {
        background: rgba(140, 90, 220, 0.2);
        border: 1px solid rgba(140, 90, 220, 0.35);
        color: hsl(270, 75%, 70%);
      }
      #excaligif-icons-favorite-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        margin-left: 4px;
        padding: 0 5px;
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.08);
        font-size: 10px;
      }

      .excaligif-icons-styles {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .excaligif-icons-styles button {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.55);
        font-family: inherit;
        font-size: 11px;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
        outline: none;
      }
      .excaligif-icons-styles button:hover {
        background: rgba(255, 255, 255, 0.07);
        color: rgba(255, 255, 255, 0.85);
      }
      .excaligif-icons-styles button.active {
        background: rgba(140, 90, 220, 0.15);
        border-color: rgba(140, 90, 220, 0.35);
        color: hsl(270, 75%, 70%);
        font-weight: 600;
      }

      .excaligif-icons-search-container {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 6px 12px;
        gap: 8px;
        transition: border-color 0.2s ease;
      }
      .excaligif-icons-search-container:focus-within {
        border-color: hsla(270, 75%, 64%, 0.5);
        box-shadow: 0 0 8px hsla(270, 75%, 64%, 0.15);
      }
      .excaligif-icons-search-container input {
        flex: 1;
        background: none;
        border: none;
        color: #fff;
        font-family: inherit;
        font-size: 13px;
        outline: none;
      }
      .excaligif-icons-search-container input::placeholder {
        color: rgba(255, 255, 255, 0.35);
      }
      .excaligif-icons-search-container .search-icon {
        color: rgba(255, 255, 255, 0.3);
        font-size: 13px;
      }
      .excaligif-icons-search-container button {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.3);
        cursor: pointer;
        font-size: 12px;
        padding: 0;
        display: none;
      }
      .excaligif-icons-search-container button.visible {
        display: block;
      }
      .excaligif-icons-search-container button:hover {
        color: #fff;
      }

      .excaligif-icons-categories-container {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .category-arrows-hint {
        font-size: 9px;
        color: rgba(255, 255, 255, 0.3);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-align: right;
      }
      .excaligif-icons-categories {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 2px 0;
      }
      .excaligif-icons-categories::-webkit-scrollbar {
        display: none;
      }
      .excaligif-category-pill {
        flex-shrink: 0;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.5);
        font-family: inherit;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.18s ease;
        outline: none;
      }
      .excaligif-category-pill:hover {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.85);
      }
      .excaligif-category-pill.active {
        background: rgba(140, 90, 220, 0.15);
        border-color: rgba(140, 90, 220, 0.45);
        color: hsl(270, 75%, 70%);
      }

      /* Grid and Cards (Dark / Default) */
      .excaligif-icons-grid {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
        gap: 12px;
      }
      .excaligif-icons-grid::-webkit-scrollbar {
        width: 6px;
      }
      .excaligif-icons-grid::-webkit-scrollbar-track {
        background: transparent;
      }
      .excaligif-icons-grid::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.08);
        border-radius: 3px;
      }
      .excaligif-icons-grid::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.15);
      }

      .excaligif-icon-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 14px 6px;
        height: 82px;
        box-sizing: border-box;
        cursor: grab;
        transition: all 0.22s cubic-bezier(0.25, 0.8, 0.25, 1);
        text-align: center;
        position: relative;
        overflow: hidden;
      }
      .excaligif-icon-card:active {
        cursor: grabbing;
      }
      .excaligif-icon-favorite {
        position: absolute;
        top: 4px;
        right: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: rgba(255, 255, 255, 0.3);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease;
        z-index: 1;
      }
      .excaligif-icon-card:hover .excaligif-icon-favorite,
      .excaligif-icon-favorite:focus-visible,
      .excaligif-icon-favorite.active {
        opacity: 1;
      }
      .excaligif-icon-favorite:hover {
        color: hsl(45, 95%, 65%);
        background: rgba(255, 255, 255, 0.08);
      }
      .excaligif-icon-favorite.active {
        color: hsl(45, 95%, 60%);
      }
      .excaligif-icon-favorite iconify-icon {
        font-size: 15px;
      }
      .excaligif-icon-card span.icon-name {
        font-size: 9.5px;
        line-height: 1.2;
        color: rgba(255, 255, 255, 0.45);
        width: 100%;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0 4px;
        word-break: break-word;
        margin-top: auto;
      }
      .excaligif-icon-card:hover {
        background: rgba(140, 90, 220, 0.12);
        border-color: rgba(140, 90, 220, 0.45);
        transform: translateY(-3px);
        box-shadow: 0 6px 14px rgba(140, 90, 220, 0.12);
      }
      .excaligif-icon-card:hover .excaligif-icon-glyph {
        transform: scale(1.15);
        color: hsl(270, 75%, 70%);
      }
      .excaligif-icon-card:hover span.icon-name {
        color: rgba(255, 255, 255, 0.8);
      }

      .excaligif-icons-loading, .excaligif-icons-error, .excaligif-icons-empty {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        color: rgba(255, 255, 255, 0.4);
        font-size: 13px;
        text-align: center;
        gap: 12px;
      }
      .excaligif-icons-loading .spinner {
        width: 24px;
        height: 24px;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-top-color: hsl(270, 75%, 64%);
        border-radius: 50%;
        animation: excaligif-spin 0.8s linear infinite;
      }
      @keyframes excaligif-spin {
        to { transform: rotate(360deg); }
      }

      /* Pagination Bar (Dark / Default) */
      .excaligif-icons-pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.12);
      }
      .excaligif-page-btn {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.85);
        cursor: pointer;
        padding: 6px 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        outline: none;
      }
      .excaligif-page-btn:hover:not(:disabled) {
        background: rgba(140, 90, 220, 0.15);
        border-color: rgba(140, 90, 220, 0.45);
        color: hsl(270, 75%, 70%);
      }
      .excaligif-page-btn:disabled {
        opacity: 0.25;
        cursor: not-allowed;
      }
      .excaligif-page-info {
        font-size: 11.5px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.6);
        letter-spacing: 0.2px;
      }

      .excaligif-icons-footer {
        padding: 12px 20px;
        background: rgba(0, 0, 0, 0.15);
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 10px;
        color: rgba(255, 255, 255, 0.35);
        text-align: center;
        font-weight: 500;
        letter-spacing: 0.2px;
      }

      .excaligif-toast {
        position: fixed;
        bottom: 84px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(140, 90, 220, 0.95);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(140, 90, 220, 0.4);
        z-index: 10002;
        opacity: 0;
        pointer-events: none;
        transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      .excaligif-toast.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }

      /* LIGHT THEME OVERRIDES (Sidebar) */
      .excaligif-icons-sidebar.theme--light {
        background: rgba(255, 255, 255, 0.97);
        border-left: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: -4px 0 24px rgba(0,0,0,0.12);
        color: #212529;
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-header {
        border-bottom-color: rgba(0, 0, 0, 0.06);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-header h3 {
        background: linear-gradient(135deg, #121212 30%, hsl(270, 75%, 45%) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-coffee {
        background: rgba(210, 120, 30, 0.06);
        border-color: rgba(190, 100, 20, 0.25);
        color: hsl(30, 75%, 38%);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-coffee:hover {
        background: rgba(210, 120, 30, 0.12);
        border-color: rgba(190, 100, 20, 0.45);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-close {
        color: rgba(0, 0, 0, 0.4);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-close:hover {
        background: rgba(0, 0, 0, 0.05);
        color: rgba(0, 0, 0, 0.8);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-controls {
        border-bottom-color: rgba(0, 0, 0, 0.06);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-filter label {
        color: rgba(0, 0, 0, 0.42);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-filter select {
        background: rgba(0, 0, 0, 0.025);
        border-color: rgba(0, 0, 0, 0.08);
        color: rgba(0, 0, 0, 0.78);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-filter option {
        background: #fff;
        color: #212529;
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-segmented {
        background: rgba(0, 0, 0, 0.03);
        border-color: rgba(0, 0, 0, 0.05);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-segmented button {
        color: rgba(0, 0, 0, 0.45);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-segmented button.active {
        background: #ffffff;
        border-color: rgba(140, 90, 220, 0.25);
        color: hsl(270, 75%, 45%);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-styles button {
        background: rgba(0, 0, 0, 0.02);
        border-color: rgba(0, 0, 0, 0.04);
        color: rgba(0, 0, 0, 0.55);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-styles button:hover {
        background: rgba(0, 0, 0, 0.05);
        color: rgba(0, 0, 0, 0.8);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-styles button.active {
        background: rgba(140, 90, 220, 0.08);
        border-color: rgba(140, 90, 220, 0.3);
        color: hsl(270, 75%, 45%);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-search-container {
        background: rgba(0, 0, 0, 0.02);
        border-color: rgba(0, 0, 0, 0.06);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-search-container input {
        color: #121212;
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-search-container input::placeholder {
        color: rgba(0, 0, 0, 0.35);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-search-container .search-icon {
        color: rgba(0, 0, 0, 0.3);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-search-container button {
        color: rgba(0, 0, 0, 0.3);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-search-container button:hover {
        color: #000;
      }
      .excaligif-icons-sidebar.theme--light .category-arrows-hint {
        color: rgba(0, 0, 0, 0.35);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-category-pill {
        background: rgba(0, 0, 0, 0.02);
        border-color: rgba(0, 0, 0, 0.04);
        color: rgba(0, 0, 0, 0.5);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-category-pill:hover {
        background: rgba(0, 0, 0, 0.05);
        color: rgba(0, 0, 0, 0.8);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-category-pill.active {
        background: rgba(140, 90, 220, 0.08);
        border-color: rgba(140, 90, 220, 0.35);
        color: hsl(270, 75%, 45%);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-grid::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.08);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-grid::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.15);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icon-card {
        background: rgba(0, 0, 0, 0.015);
        border-color: rgba(0, 0, 0, 0.04);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icon-card .excaligif-icon-glyph {
        color: rgba(0, 0, 0, 0.75);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icon-card span.icon-name {
        color: rgba(0, 0, 0, 0.45);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icon-favorite {
        color: rgba(0, 0, 0, 0.3);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icon-favorite:hover,
      .excaligif-icons-sidebar.theme--light .excaligif-icon-favorite.active {
        color: hsl(40, 90%, 42%);
        background: rgba(0, 0, 0, 0.05);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icon-card:hover {
        background: rgba(140, 90, 220, 0.06);
        border-color: rgba(140, 90, 220, 0.3);
        box-shadow: 0 6px 14px rgba(140, 90, 220, 0.08);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icon-card:hover .excaligif-icon-glyph {
        color: hsl(270, 75%, 45%);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icon-card:hover span.icon-name {
        color: rgba(0, 0, 0, 0.85);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-loading, 
      .excaligif-icons-sidebar.theme--light .excaligif-icons-error, 
      .excaligif-icons-sidebar.theme--light .excaligif-icons-empty {
        color: rgba(0, 0, 0, 0.45);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-loading .spinner {
        border-color: rgba(0, 0, 0, 0.08);
        border-top-color: hsl(270, 75%, 45%);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-icons-footer {
        background: rgba(0, 0, 0, 0.02);
        border-top-color: rgba(0, 0, 0, 0.05);
        color: rgba(0, 0, 0, 0.45);
      }

      /* Light Mode Overrides (Pagination) */
      .excaligif-icons-sidebar.theme--light .excaligif-icons-pagination {
        border-top-color: rgba(0, 0, 0, 0.05);
        background: rgba(0, 0, 0, 0.015);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-page-btn {
        background: rgba(0, 0, 0, 0.02);
        border-color: rgba(0, 0, 0, 0.05);
        color: rgba(0, 0, 0, 0.65);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-page-btn:hover:not(:disabled) {
        background: rgba(140, 90, 220, 0.08);
        border-color: rgba(140, 90, 220, 0.35);
        color: hsl(270, 75%, 45%);
      }
      .excaligif-icons-sidebar.theme--light .excaligif-page-info {
        color: rgba(0, 0, 0, 0.55);
      }
    `;
    document.head.appendChild(style);
  }

  // Vault styles are built on Excalidraw's own theme tokens, so the drawer,
  // menus and dialogs follow light/dark mode without extra overrides.
  function injectVaultStyles() {
    if (document.getElementById('excaliup-vault-styles')) return;
    const style = document.createElement('style');
    style.id = 'excaliup-vault-styles';
    style.textContent = `
      .excaliup-vault-btn,
      .excaliup-vault-drawer,
      .excaliup-vault-popover,
      .excaliup-vault-modal-overlay {
        --xv-bg: var(--island-bg-color, #ffffff);
        --xv-text: var(--text-primary-color, #1b1b1f);
        --xv-muted: color-mix(in srgb, var(--xv-text) 58%, transparent);
        --xv-faint: color-mix(in srgb, var(--xv-text) 38%, transparent);
        --xv-border: color-mix(in srgb, var(--xv-text) 11%, transparent);
        --xv-surface: var(--color-surface-low, #ececf4);
        --xv-surface-soft: color-mix(in srgb, var(--xv-surface) 55%, transparent);
        --xv-hover: var(--button-hover-bg, #f1f0ff);
        --xv-primary: var(--color-primary, #6965db);
        --xv-primary-strong: var(--color-primary-darker, #5b57d1);
        --xv-primary-soft: color-mix(in srgb, var(--xv-primary) 14%, transparent);
        --xv-danger: var(--color-danger, #db6965);
        /* Text on primary/danger fills: white in light mode, near-black in dark. */
        --xv-on-primary: var(--color-surface-lowest, #ffffff);
        --xv-ok: #2f9e44;
        --xv-warn: #e8590c;
        --xv-radius: var(--border-radius-lg, 0.5rem);
        --xv-shadow: var(--shadow-island, 0 0 0 1px rgba(0, 0, 0, 0.08), 0 7px 14px rgba(0, 0, 0, 0.1));
        font-family: var(--ui-font, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
        color: var(--xv-text);
      }
      .excaliup-vault-btn *,
      .excaliup-vault-drawer *,
      .excaliup-vault-popover *,
      .excaliup-vault-modal-overlay * {
        box-sizing: border-box;
      }
      .excaliup-vault-drawer button,
      .excaliup-vault-popover button,
      .excaliup-vault-modal-overlay button {
        font: inherit;
        color: inherit;
      }
      .excaliup-vault-drawer :focus-visible,
      .excaliup-vault-popover :focus-visible,
      .excaliup-vault-modal-overlay :focus-visible,
      .excaliup-vault-btn:focus-visible {
        outline: 2px solid var(--xv-primary);
        outline-offset: 1px;
      }
      .excaliup-vault-drawer iconify-icon,
      .excaliup-vault-popover iconify-icon,
      .excaliup-vault-modal-overlay iconify-icon,
      .excaliup-vault-btn iconify-icon {
        display: inline-flex;
        flex-shrink: 0;
      }
      .excaliup-vault-drawer kbd,
      .excaliup-vault-popover kbd {
        font: inherit;
        font-size: 10px;
        padding: 1px 4px;
        border-radius: 4px;
        border: 1px solid var(--xv-border);
        background: var(--xv-surface-soft);
        color: var(--xv-muted);
      }

      /* Status dot shared by the launcher and the drawer */
      .excaliup-vault-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        background: var(--xv-faint);
      }
      .excaliup-vault-dot[data-tone="ok"] { background: var(--xv-ok); }
      .excaliup-vault-dot[data-tone="pending"] {
        background: transparent;
        box-shadow: inset 0 0 0 2px var(--xv-primary);
      }
      .excaliup-vault-dot[data-tone="busy"] {
        background: var(--xv-primary);
        animation: excaliup-vault-pulse 1s ease-in-out infinite;
      }
      .excaliup-vault-dot[data-tone="warn"] { background: var(--xv-warn); }
      .excaliup-vault-dot[data-tone="error"] { background: var(--xv-danger); }
      @keyframes excaliup-vault-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.75); }
      }

      /* --- Launcher button (next to the main menu) --- */
      .excaliup-vault-btn {
        position: relative;
        height: var(--lg-button-size, 2.5rem);
        margin-left: 8px;
        padding: 0 12px 0 10px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 200px;
        border: none;
        border-radius: var(--xv-radius);
        background: var(--xv-bg);
        box-shadow: var(--xv-shadow);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        flex-shrink: 0;
        vertical-align: middle;
        z-index: 2;
        transition: background-color 0.15s ease;
      }
      .excaliup-vault-btn.is-docked {
        position: absolute;
        margin-left: 0;
      }
      .excalidraw > .excaliup-vault-btn {
        position: absolute;
        top: 16px;
        left: 64px;
        margin-left: 0;
      }
      .excaliup-vault-btn:hover { background: var(--xv-hover); }
      .excaliup-vault-btn.is-open {
        background: var(--xv-primary-soft);
        color: var(--xv-primary);
      }
      .excaliup-vault-btn-icon {
        position: relative;
        display: inline-flex;
        font-size: 18px;
      }
      .excaliup-vault-btn-icon .excaliup-vault-dot {
        position: absolute;
        right: -3px;
        bottom: -2px;
        width: 9px;
        height: 9px;
        border: 2px solid var(--xv-bg);
        box-sizing: content-box;
      }
      .excaliup-vault-btn-icon .excaliup-vault-dot[data-tone="pending"] {
        background: var(--xv-bg);
        box-shadow: inset 0 0 0 2px var(--xv-primary);
      }
      .excaliup-vault-btn-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* --- Drawer --- */
      .excaliup-vault-drawer {
        position: absolute;
        top: 68px;
        left: 16px;
        bottom: 16px;
        width: 340px;
        max-width: calc(100% - 32px);
        z-index: 10002;
        display: flex;
        flex-direction: column;
        background: var(--xv-bg);
        border-radius: calc(var(--xv-radius) * 1.5);
        box-shadow: var(--xv-shadow);
        overflow: hidden;
        font-size: 13px;
        opacity: 0;
        visibility: hidden;
        transform: translateX(-12px) scale(0.98);
        transform-origin: top left;
        transition: opacity 0.16s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear 0.2s;
      }
      .excaliup-vault-drawer.open {
        opacity: 1;
        visibility: visible;
        transform: none;
        transition: opacity 0.16s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s;
      }
      @media (prefers-reduced-motion: reduce) {
        .excaliup-vault-drawer,
        .excaliup-vault-drawer.open { transition: none; }
      }
      .excaliup-vault-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 10px 6px 16px;
      }
      .excaliup-vault-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 15px;
        font-weight: 700;
      }
      .excaliup-vault-title iconify-icon {
        font-size: 18px;
        color: var(--xv-primary);
      }
      .excaliup-vault-header-actions {
        display: flex;
        gap: 2px;
      }
      .excaliup-vault-icon-btn {
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: var(--xv-radius);
        background: transparent;
        color: var(--xv-muted) !important;
        font-size: 16px;
        cursor: pointer;
      }
      .excaliup-vault-icon-btn:hover {
        background: var(--xv-hover);
        color: var(--xv-text) !important;
      }

      /* Connected-folder card */
      .excaliup-vault-status {
        margin: 4px 12px 8px;
        padding: 10px 10px 10px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-radius: var(--xv-radius);
        background: var(--xv-surface-soft);
        border: 1px solid var(--xv-border);
      }
      .excaliup-vault-status[hidden] { display: none; }
      .excaliup-vault-status[data-tone="error"] {
        border-color: color-mix(in srgb, var(--xv-danger) 45%, transparent);
      }
      .excaliup-vault-status[data-tone="warn"] {
        border-color: color-mix(in srgb, var(--xv-warn) 45%, transparent);
      }
      .excaliup-vault-status-icon {
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--xv-radius);
        background: var(--xv-primary-soft);
        color: var(--xv-primary);
        font-size: 17px;
        flex-shrink: 0;
      }
      .excaliup-vault-status-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      .excaliup-vault-status-name {
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .excaliup-vault-status-detail {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--xv-muted);
        min-width: 0;
      }
      .excaliup-vault-status-detail > span:last-child {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .excaliup-vault-status-detail strong {
        color: var(--xv-text);
        font-weight: 600;
      }
      .excaliup-vault-link-btn {
        border: none;
        background: transparent;
        color: var(--xv-primary) !important;
        font-weight: 600 !important;
        font-size: 12px !important;
        padding: 6px 8px;
        border-radius: var(--xv-radius);
        cursor: pointer;
        flex-shrink: 0;
      }
      .excaliup-vault-link-btn:hover { background: var(--xv-primary-soft); }

      /* Search, actions, tabs */
      .excaliup-vault-controls {
        padding: 0 12px 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .excaliup-vault-drawer.is-disconnected .excaliup-vault-controls,
      .excaliup-vault-drawer.is-disconnected .excaliup-vault-hint { display: none; }
      .excaliup-vault-search {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 36px;
        padding: 0 6px 0 10px;
        border-radius: var(--xv-radius);
        border: 1px solid var(--xv-border);
        background: var(--xv-bg);
        color: var(--xv-muted);
        font-size: 15px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .excaliup-vault-search:focus-within {
        border-color: var(--xv-primary);
        box-shadow: 0 0 0 3px var(--xv-primary-soft);
      }
      .excaliup-vault-drawer .excaliup-vault-search input[type="text"] {
        flex: 1;
        min-width: 0;
        height: 100%;
        margin: 0;
        padding: 0;
        border: none;
        border-radius: 0;
        box-shadow: none;
        outline: none;
        background: transparent;
        color: var(--xv-text);
        font: inherit;
        font-size: 13px;
      }
      .excaliup-vault-search input::placeholder { color: var(--xv-faint); }
      .excaliup-vault-search-clear {
        display: none;
        width: 24px;
        height: 24px;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--xv-muted) !important;
        cursor: pointer;
      }
      .excaliup-vault-search-clear:hover { background: var(--xv-hover); }
      .excaliup-vault-drawer.has-query .excaliup-vault-search-clear { display: inline-flex; }
      .excaliup-vault-actions {
        display: flex;
        gap: 8px;
      }
      .excaliup-vault-actions .is-primary { flex: 1; }
      .excaliup-vault-button {
        height: 34px;
        padding: 0 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-radius: var(--xv-radius);
        border: 1px solid var(--xv-border);
        background: var(--xv-bg);
        font-size: 13px !important;
        font-weight: 600 !important;
        cursor: pointer;
        white-space: nowrap;
        transition: background-color 0.15s ease, border-color 0.15s ease;
      }
      .excaliup-vault-button:hover { background: var(--xv-hover); }
      .excaliup-vault-button:disabled { opacity: 0.6; cursor: default; }
      .excaliup-vault-button iconify-icon { font-size: 16px; }
      .excaliup-vault-button.is-primary {
        border-color: transparent;
        background: var(--xv-primary);
        color: var(--xv-on-primary) !important;
      }
      .excaliup-vault-button.is-primary:hover { background: var(--xv-primary-strong); }
      .excaliup-vault-button.is-danger {
        border-color: transparent;
        background: var(--xv-danger);
        color: var(--xv-on-primary) !important;
      }
      .excaliup-vault-button.is-danger:hover {
        background: color-mix(in srgb, var(--xv-danger) 85%, #000000);
      }
      .excaliup-vault-tabs {
        display: flex;
        gap: 2px;
        padding: 3px;
        border-radius: var(--xv-radius);
        background: var(--xv-surface);
      }
      .excaliup-vault-tabs [role="tab"] {
        flex: 1;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: none;
        border-radius: calc(var(--xv-radius) - 2px);
        background: transparent;
        color: var(--xv-muted) !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        cursor: pointer;
      }
      .excaliup-vault-tabs [role="tab"]:hover { color: var(--xv-text) !important; }
      .excaliup-vault-tabs [role="tab"].is-active {
        background: var(--xv-bg);
        color: var(--xv-text) !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
      }
      .excaliup-vault-count {
        min-width: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: var(--xv-border);
        font-size: 10px;
        line-height: 16px;
        font-variant-numeric: tabular-nums;
      }
      .excaliup-vault-tabs [role="tab"].is-active .excaliup-vault-count {
        background: var(--xv-primary-soft);
        color: var(--xv-primary);
      }

      /* Breadcrumbs */
      .excaliup-vault-crumbs {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 2px 12px 6px;
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: none;
      }
      .excaliup-vault-crumbs[hidden] { display: none; }
      .excaliup-vault-crumb {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        max-width: 160px;
        padding: 3px 6px;
        border: 1px dashed transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--xv-muted) !important;
        font-size: 12px !important;
        cursor: pointer;
      }
      .excaliup-vault-crumb span {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .excaliup-vault-crumb:hover { background: var(--xv-hover); color: var(--xv-text) !important; }
      .excaliup-vault-crumb.is-current {
        color: var(--xv-text) !important;
        font-weight: 600 !important;
      }
      .excaliup-vault-crumb-sep {
        font-size: 12px;
        color: var(--xv-faint);
      }

      /* List */
      .excaliup-vault-list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0 8px 8px;
        border-top: 1px solid var(--xv-border);
        scrollbar-width: thin;
      }
      .excaliup-vault-drawer.is-disconnected .excaliup-vault-list { border-top: none; }
      .excaliup-vault-section-label {
        position: sticky;
        top: 0;
        z-index: 1;
        padding: 10px 8px 4px;
        background: var(--xv-bg);
        color: var(--xv-faint);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .excaliup-vault-row {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        padding: 4px 4px 4px 6px;
        border-radius: var(--xv-radius);
        border: 1px solid transparent;
        cursor: pointer;
        user-select: none;
        outline: none;
      }
      .excaliup-vault-row:hover { background: var(--xv-hover); }
      .excaliup-vault-row:focus-visible {
        border-color: var(--xv-primary);
        background: var(--xv-hover);
      }
      .excaliup-vault-row.is-active { background: var(--xv-primary-soft); }
      .excaliup-vault-row.is-active::before {
        content: "";
        position: absolute;
        left: -4px;
        top: 10px;
        bottom: 10px;
        width: 3px;
        border-radius: 3px;
        background: var(--xv-primary);
      }
      .excaliup-vault-row.is-dragging { opacity: 0.45; }
      .excaliup-vault-row.is-drop-target,
      .excaliup-vault-crumb.is-drop-target {
        border-style: dashed;
        border-color: var(--xv-primary);
        background: var(--xv-primary-soft);
      }
      .excaliup-vault-row-icon {
        width: 30px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--xv-radius);
        background: var(--xv-primary-soft);
        color: var(--xv-primary);
        font-size: 16px;
        flex-shrink: 0;
      }
      .excaliup-vault-row-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .excaliup-vault-row-name {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .excaliup-vault-row-meta {
        font-size: 11px;
        color: var(--xv-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .excaliup-vault-row-chevron {
        font-size: 14px;
        color: var(--xv-faint);
      }
      .excaliup-vault-star,
      .excaliup-vault-row-menu {
        width: 30px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: var(--xv-radius);
        background: transparent;
        cursor: pointer;
        flex-shrink: 0;
      }
      .excaliup-vault-star {
        color: var(--xv-faint) !important;
        font-size: 18px;
      }
      .excaliup-vault-star:hover { color: #f59f00 !important; background: var(--xv-bg); }
      .excaliup-vault-star.is-starred { color: #f59f00 !important; }
      .excaliup-vault-row-menu {
        color: var(--xv-muted) !important;
        font-size: 16px;
        opacity: 0;
      }
      .excaliup-vault-row:hover .excaliup-vault-row-menu,
      .excaliup-vault-row:focus-within .excaliup-vault-row-menu,
      .excaliup-vault-row-menu[aria-expanded="true"] { opacity: 1; }
      .excaliup-vault-row-menu:hover { background: var(--xv-bg); color: var(--xv-text) !important; }
      .excaliup-vault-chip {
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--xv-primary);
        color: var(--xv-on-primary);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        flex-shrink: 0;
      }

      /* Empty & onboarding states */
      .excaliup-vault-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 40px 20px;
        text-align: center;
      }
      .excaliup-vault-empty-icon {
        width: 52px;
        height: 52px;
        margin-bottom: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
        background: var(--xv-primary-soft);
        color: var(--xv-primary);
        font-size: 26px;
      }
      .excaliup-vault-empty-title {
        font-size: 14px;
        font-weight: 700;
      }
      .excaliup-vault-empty-text {
        max-width: 250px;
        color: var(--xv-muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .excaliup-vault-empty .excaliup-vault-button { margin-top: 8px; }

      .excaliup-vault-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 14px;
        border-top: 1px solid var(--xv-border);
        color: var(--xv-muted);
        font-size: 11px;
      }
      .excaliup-vault-hint {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
      }

      /* --- Row action menu --- */
      .excaliup-vault-popover {
        position: fixed;
        z-index: 10008;
        min-width: 188px;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: var(--xv-bg);
        border-radius: var(--xv-radius);
        box-shadow: var(--xv-shadow);
        font-size: 13px;
        animation: excaliup-vault-pop 0.12s ease-out;
      }
      .excaliup-vault-popover-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        height: 32px;
        padding: 0 8px;
        border: none;
        border-radius: calc(var(--xv-radius) - 2px);
        background: transparent;
        text-align: left;
        cursor: pointer;
      }
      .excaliup-vault-popover-item span { flex: 1; }
      .excaliup-vault-popover-item iconify-icon {
        font-size: 16px;
        color: var(--xv-muted);
      }
      .excaliup-vault-popover-item:hover,
      .excaliup-vault-popover-item:focus-visible {
        background: var(--xv-hover);
        outline: none;
      }
      .excaliup-vault-popover-item.is-danger,
      .excaliup-vault-popover-item.is-danger iconify-icon { color: var(--xv-danger) !important; }
      .excaliup-vault-popover-item.is-danger:hover,
      .excaliup-vault-popover-item.is-danger:focus-visible {
        background: color-mix(in srgb, var(--xv-danger) 12%, transparent);
      }
      .excaliup-vault-popover-sep {
        height: 1px;
        margin: 4px 6px;
        background: var(--xv-border);
      }
      @keyframes excaliup-vault-pop {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: none; }
      }

      /* --- Dialogs --- */
      .excaliup-vault-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 10010;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: color-mix(in srgb, var(--overlay-bg-color, rgba(255, 255, 255, 0.88)) 80%, transparent);
        animation: excaliup-vault-fade 0.12s ease-out;
      }
      .excaliup-vault-modal {
        width: 380px;
        max-width: 100%;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: var(--xv-bg);
        border-radius: calc(var(--xv-radius) * 1.5);
        box-shadow: var(--xv-shadow), 0 20px 40px rgba(0, 0, 0, 0.12);
        font-size: 13px;
        animation: excaliup-vault-pop 0.16s ease-out;
      }
      .excaliup-vault-modal-header {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      .excaliup-vault-modal-icon {
        width: 36px;
        height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--xv-radius);
        background: var(--xv-primary-soft);
        color: var(--xv-primary);
        font-size: 18px;
        flex-shrink: 0;
      }
      .excaliup-vault-modal[data-tone="danger"] .excaliup-vault-modal-icon {
        background: color-mix(in srgb, var(--xv-danger) 14%, transparent);
        color: var(--xv-danger);
      }
      .excaliup-vault-modal-title {
        font-size: 15px;
        font-weight: 700;
        line-height: 36px;
      }
      .excaliup-vault-modal-desc {
        margin-top: -4px;
        color: var(--xv-muted);
        line-height: 1.5;
      }
      .excaliup-vault-modal-fields {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .excaliup-vault-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--xv-muted);
      }
      .excaliup-vault-modal-overlay .excaliup-vault-input {
        width: 100%;
        margin: 0;
        height: 36px;
        padding: 0 10px;
        border-radius: var(--xv-radius);
        border: 1px solid var(--input-border-color, var(--xv-border));
        background: var(--input-bg-color, var(--xv-bg));
        color: var(--xv-text);
        font: inherit;
        font-size: 13px;
        font-weight: 400;
        outline: none;
      }
      .excaliup-vault-modal-overlay .excaliup-vault-input:focus {
        border-color: var(--xv-primary);
        box-shadow: 0 0 0 3px var(--xv-primary-soft);
      }
      .excaliup-vault-modal-error {
        margin-top: -6px;
        padding: 8px 10px;
        border-radius: var(--xv-radius);
        background: color-mix(in srgb, var(--xv-danger) 12%, transparent);
        color: var(--xv-danger);
        font-size: 12px;
        font-weight: 600;
      }
      .excaliup-vault-modal-error[hidden] { display: none; }
      .excaliup-vault-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      @keyframes excaliup-vault-fade {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @media (max-width: 520px) {
        .excaliup-vault-btn-label { display: none; }
        .excaliup-vault-btn { padding: 0 10px; }
        .excaliup-vault-drawer {
          left: 8px;
          right: 8px;
          width: auto;
          max-width: none;
          bottom: 8px;
        }
        .excaliup-vault-hint { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function removeSidebarElements() {
    clearTimeout(iconSearchTimer);
    if (iconFetchController) iconFetchController.abort();
    iconFetchController = null;
    if (sidebarButton) {
      sidebarButton.remove();
      sidebarButton = null;
    }
    if (sidebarElement) {
      sidebarElement.remove();
      sidebarElement = null;
    }
    removeVaultUI();
    const styles = document.getElementById('excaligif-sidebar-styles');
    if (styles) styles.remove();
    // Remove drop listeners
    const canvas = document.querySelector('.excalidraw__canvas.interactive');
    if (canvas) {
      canvas.removeEventListener('dragover', onCanvasDragOver);
      canvas.removeEventListener('drop', onCanvasDrop);
    }
    
    document.removeEventListener('keydown', onKeyDown);
  }

  function createSidebarButtonAndPanel() {
    const excalidraw = document.querySelector('.excalidraw');
    if (!excalidraw) return;

    // Avoid duplicate initialization
    if (document.getElementById('excaligif-icons-sidebar')) return;

    injectSidebarStyles();

    // 1. Create Floating Toggle Button
    sidebarButton = document.createElement('button');
    sidebarButton.id = 'excaligif-icons-btn';
    sidebarButton.className = 'excaligif-icons-btn';
    sidebarButton.setAttribute('title', 'Iconify Icon Library (B)');
    sidebarButton.innerHTML = '<iconify-icon icon="lucide:grid-3x3" aria-hidden="true"></iconify-icon>';
    excalidraw.appendChild(sidebarButton);

    // 2. Create Sidebar Element
    sidebarElement = document.createElement('div');
    sidebarElement.id = 'excaligif-icons-sidebar';
    sidebarElement.className = 'excaligif-icons-sidebar';
    sidebarElement.innerHTML = `
      <div class="excaligif-icons-header">
        <h3>Iconify Library</h3>
        <div class="excaligif-icons-header-actions">
          <a class="excaligif-icons-coffee" href="https://donate.stripe.com/4gMdRa7XW6dt8Ph9KX9Ve01" target="_blank" rel="noopener noreferrer">
            <iconify-icon icon="lucide:coffee" aria-hidden="true"></iconify-icon>
            <span>Buy me a coffee</span>
          </a>
        <button class="excaligif-icons-close" id="excaligif-icons-close">✕</button>
        </div>
      </div>
      
      <div class="excaligif-icons-controls">
        <div class="excaligif-icons-segmented" id="excaligif-icons-view">
          <button type="button" class="active" data-view="browse" aria-pressed="true">All icons</button>
          <button type="button" data-view="favorites" aria-pressed="false">
            Favorites <span id="excaligif-icons-favorite-count">0</span>
          </button>
        </div>
        <div class="excaligif-icons-search-container">
          <iconify-icon icon="lucide:search" aria-hidden="true"></iconify-icon>
          <input type="text" id="excaligif-icons-search" placeholder="Search 300,000+ icons...">
          <button id="excaligif-icons-search-clear">✕</button>
        </div>
        
        <div class="excaligif-icons-insert">
          <div class="excaligif-icons-filter">
            <label>Insert color</label>
            <div class="excaligif-icons-segmented is-compact" id="excaligif-icons-color" role="group" aria-label="Insert color">
              <button type="button" data-color="stroke" title="Use the current stroke color (single-color packs)">
                <span class="excaligif-color-swatch" aria-hidden="true"></span>Stroke
              </button>
              <button type="button" data-color="original" title="Keep the icon's own colors">Original</button>
            </div>
          </div>
          <div class="excaligif-icons-filter">
            <label>Size</label>
            <div class="excaligif-icons-segmented is-compact" id="excaligif-icons-size" role="group" aria-label="Insert size">
              <button type="button" data-size="48" title="48 px">S</button>
              <button type="button" data-size="96" title="96 px">M</button>
              <button type="button" data-size="160" title="160 px">L</button>
            </div>
          </div>
        </div>

        <div class="excaligif-icons-filters">
          <div class="excaligif-icons-filter">
            <label for="excaligif-icons-pack">Icon pack</label>
            <select id="excaligif-icons-pack"><option value="">All packs</option></select>
          </div>
          <div class="excaligif-icons-filter">
            <label for="excaligif-icons-category">Category</label>
            <select id="excaligif-icons-category"><option value="">All categories</option></select>
          </div>
          <div class="excaligif-icons-filter">
            <label for="excaligif-icons-tag">Tag</label>
            <select id="excaligif-icons-tag"><option value="">All tags</option></select>
          </div>
        </div>
      </div>
      
      <div class="excaligif-icons-grid" id="excaligif-icons-grid">
        <div class="excaligif-icons-loading">
          <div class="spinner"></div>
          <span>Loading library...</span>
        </div>
      </div>

      <div class="excaligif-icons-pagination" id="excaligif-icons-pagination"></div>
      
      <div class="excaligif-icons-footer" id="excaligif-icons-footer">
        Click to insert, or drag onto the canvas
      </div>
    `;
    excalidraw.appendChild(sidebarElement);

    // Set up canvas drop interception
    setupCanvasDropIntercept();

    // 3. Register Event Listeners
    sidebarButton.addEventListener('click', () => {
      toggleSidebar();
    });

    const closeBtn = sidebarElement.querySelector('#excaligif-icons-close');
    closeBtn.addEventListener('click', () => {
      closeSidebar();
    });

    const searchInput = sidebarElement.querySelector('#excaligif-icons-search');
    const searchClear = sidebarElement.querySelector('#excaligif-icons-search-clear');
    const packSelect = sidebarElement.querySelector('#excaligif-icons-pack');
    const categorySelect = sidebarElement.querySelector('#excaligif-icons-category');
    const tagSelect = sidebarElement.querySelector('#excaligif-icons-tag');
    const viewButtons = sidebarElement.querySelectorAll('#excaligif-icons-view button');

    viewButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const nextView = button.dataset.view;
        if (nextView === iconView) return;
        clearTimeout(iconSearchTimer);
        iconView = nextView;
        currentPage = 1;
        updateIconViewControls();
        loadIconResults();
      });
    });

    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      currentPage = 1;
      if (searchQuery) {
        searchClear.classList.add('visible');
      } else {
        searchClear.classList.remove('visible');
      }
      clearTimeout(iconSearchTimer);
      iconSearchTimer = setTimeout(loadIconResults, 300);
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      currentPage = 1;
      searchClear.classList.remove('visible');
      clearTimeout(iconSearchTimer);
      loadIconResults();
      searchInput.focus();
    });

    packSelect.addEventListener('change', () => {
      clearTimeout(iconSearchTimer);
      activePrefix = packSelect.value;
      currentPage = 1;
      loadIconResults();
    });

    categorySelect.addEventListener('change', () => {
      clearTimeout(iconSearchTimer);
      activeCategory = categorySelect.value;
      activePrefix = '';
      currentPage = 1;
      renderCollectionFilters();
      loadIconResults();
    });

    tagSelect.addEventListener('change', () => {
      clearTimeout(iconSearchTimer);
      activeTag = tagSelect.value;
      activePrefix = '';
      currentPage = 1;
      renderCollectionFilters();
      loadIconResults();
    });

    for (const button of sidebarElement.querySelectorAll('#excaligif-icons-color button')) {
      button.addEventListener('click', () => {
        iconInsertPrefs.color = button.dataset.color;
        saveIconInsertPrefs();
        updateIconInsertControls();
      });
    }
    for (const button of sidebarElement.querySelectorAll('#excaligif-icons-size button')) {
      button.addEventListener('click', () => {
        iconInsertPrefs.size = Number(button.dataset.size);
        saveIconInsertPrefs();
        updateIconInsertControls();
      });
    }

    // Arrow navigation & general keyboard handling
    document.addEventListener('keydown', onKeyDown, true);

    updateIconViewControls();
    updateIconInsertControls();
    updateSidebarTheme();
  }

  function getCanvasStrokeColor() {
    const color = currentApp && currentApp.state && currentApp.state.currentItemStrokeColor;
    return typeof color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)
      ? color
      : null;
  }

  let lastIconTint = '';
  function updateIconInsertControls() {
    if (!sidebarElement) return;
    for (const button of sidebarElement.querySelectorAll('#excaligif-icons-color button')) {
      const isActive = button.dataset.color === iconInsertPrefs.color;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
    for (const button of sidebarElement.querySelectorAll('#excaligif-icons-size button')) {
      const isActive = Number(button.dataset.size) === iconInsertPrefs.size;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
    updateIconTint(true);
  }

  // Previews the grid in the colour icons will be inserted with.
  function updateIconTint(force = false) {
    if (!sidebarElement) return;
    const tint = iconInsertPrefs.color === 'stroke' ? getCanvasStrokeColor() || '' : '';
    if (!force && tint === lastIconTint) return;
    lastIconTint = tint;
    sidebarElement.style.setProperty('--excaligif-stroke', tint || 'currentColor');
    sidebarElement.classList.toggle('is-tinted', !!tint);
  }

  function updateIconViewControls() {
    if (!sidebarElement) return;
    const isFavorites = iconView === 'favorites';
    for (const button of sidebarElement.querySelectorAll('#excaligif-icons-view button')) {
      const isActive = button.dataset.view === iconView;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
    const favoriteCount = sidebarElement.querySelector('#excaligif-icons-favorite-count');
    if (favoriteCount) favoriteCount.textContent = String(favoriteIcons.size);
    const filters = sidebarElement.querySelector('.excaligif-icons-filters');
    if (filters) filters.style.display = isFavorites ? 'none' : 'grid';
    const searchInput = sidebarElement.querySelector('#excaligif-icons-search');
    if (searchInput) {
      searchInput.placeholder = isFavorites ? 'Search favorite icons...' : 'Search 300,000+ icons...';
    }
  }

  function onKeyDown(e) {
    if (!sidebarElement) return;
    if (e.target && e.target.closest && e.target.closest('.excaliup-vault-drawer, .excaliup-vault-modal-overlay, .excaliup-vault-popover')) {
      return;
    }
    if (e.key === 'Escape' && sidebarElement.classList.contains('open')) {
      e.preventDefault();
      closeSidebar();
      return;
    }

    const target = e.target;
    const isEditable = target && (
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
      target.isContentEditable ||
      (typeof target.closest === 'function' && target.closest('[contenteditable="true"]'))
    );
    if (
      e.key.toLowerCase() === 'b' &&
      !e.repeat &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !isEditable
    ) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    }
  }

  function getMatchingCollections() {
    if (!iconCollections) return [];
    return Object.entries(iconCollections).filter(([, info]) => {
      if (activeCategory === '__animated__' && !(info.tags || []).includes('Contains Animations')) return false;
      if (activeCategory && activeCategory !== '__animated__' && info.category !== activeCategory) return false;
      if (activeTag && !(info.tags || []).includes(activeTag)) return false;
      return true;
    });
  }

  function setSelectOptions(select, firstLabel, entries, selectedValue) {
    if (!select) return;
    select.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = firstLabel;
    select.appendChild(first);
    entries.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
    select.value = selectedValue;
  }

  function renderCollectionFilters() {
    if (!iconCollections || !sidebarElement) return;
    const allCollections = Object.values(iconCollections);
    const categories = [...new Set(allCollections.map(info => info.category).filter(Boolean))].sort();
    const categoryOptions = [
      ['__animated__', 'Animated SVG'],
      ...categories.map(value => [value, value])
    ];
    const tags = [...new Set(allCollections.flatMap(info => info.tags || []))].sort();
    const packs = getMatchingCollections().sort((a, b) => a[1].name.localeCompare(b[1].name));

    setSelectOptions(
      sidebarElement.querySelector('#excaligif-icons-category'),
      'All categories',
      categoryOptions,
      activeCategory
    );
    setSelectOptions(
      sidebarElement.querySelector('#excaligif-icons-tag'),
      'All tags',
      tags.map(value => [value, value]),
      activeTag
    );
    setSelectOptions(
      sidebarElement.querySelector('#excaligif-icons-pack'),
      `All packs (${packs.length})`,
      packs.map(([prefix, info]) => [prefix, `${info.name} (${(info.total || 0).toLocaleString()})`]),
      activePrefix
    );
  }

  function createIconResult(iconifyName) {
    const separator = iconifyName.indexOf(':');
    if (separator < 1) return null;
    const prefix = iconifyName.slice(0, separator);
    const name = iconifyName.slice(separator + 1);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(prefix) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      return null;
    }
    return {
      icon: iconifyName,
      name,
      prefix,
      collection: iconCollections && iconCollections[prefix]
    };
  }

  function getFilteredFavoriteIconNames() {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return [...favoriteIcons].filter(iconName => {
      if (!normalizedQuery) return true;
      return iconName.toLowerCase().includes(normalizedQuery) ||
        iconName.replace(/[-_:]/g, ' ').toLowerCase().includes(normalizedQuery);
    });
  }

  async function loadIconCollections() {
    if (iconCollections) return loadIconResults();
    if (iconCollectionsPromise) return iconCollectionsPromise;
    const grid = document.getElementById('excaligif-icons-grid');
    if (grid) {
      grid.innerHTML = '<div class="excaligif-icons-loading"><div class="spinner"></div><span>Loading Iconify collections...</span></div>';
    }
    iconCollectionsPromise = (async () => {
      try {
        const response = await fetch('https://api.iconify.design/collections');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        iconCollections = await response.json();
        renderCollectionFilters();
        await loadIconResults();
      } catch (error) {
        console.error('[Excali Up] Failed to load Iconify collections:', error);
        if (grid) grid.innerHTML = '<div class="excaligif-icons-error">Failed to load Iconify collections.</div>';
      } finally {
        iconCollectionsPromise = null;
      }
    })();
    return iconCollectionsPromise;
  }

  async function loadIconResults() {
    if (!iconCollections) return loadIconCollections();
    if (iconFetchController) iconFetchController.abort();
    const fetchController = new AbortController();
    iconFetchController = fetchController;
    const requestId = ++iconRequestId;
    const grid = document.getElementById('excaligif-icons-grid');
    if (grid) {
      grid.innerHTML = '<div class="excaligif-icons-loading"><div class="spinner"></div><span>Loading icons...</span></div>';
    }

    try {
      let iconNames = [];
      const matchingCollections = getMatchingCollections();

      if (iconView === 'favorites') {
        iconNames = getFilteredFavoriteIconNames();
      } else if (searchQuery) {
        const url = new URL('https://api.iconify.design/search');
        url.searchParams.set('query', searchQuery);
        url.searchParams.set('limit', '999');
        if (activePrefix) {
          url.searchParams.set('prefix', activePrefix);
        } else if (activeTag || activeCategory === '__animated__') {
          const prefixes = matchingCollections.map(([prefix]) => prefix);
          if (prefixes.length === 0) {
            if (requestId !== iconRequestId) return;
            visibleIcons = [];
            renderIconsGrid();
            return;
          }
          url.searchParams.set('prefixes', prefixes.join(','));
        } else if (activeCategory) {
          url.searchParams.set('category', activeCategory);
        }
        const response = await fetch(url, { signal: fetchController.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        iconNames = data.icons || [];
      } else if (activePrefix) {
        const response = await fetch(`https://api.iconify.design/collection?prefix=${encodeURIComponent(activePrefix)}`, {
          signal: fetchController.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const names = [
          ...(data.uncategorized || []),
          ...Object.values(data.categories || {}).flat()
        ];
        iconNames = [...new Set(names)].map(name => `${activePrefix}:${name}`);
      } else {
        iconNames = matchingCollections.flatMap(([prefix, info]) =>
          (info.samples || []).map(name => `${prefix}:${name}`)
        );
      }

      if (requestId !== iconRequestId) return;
      visibleIcons = iconNames.map(createIconResult).filter(Boolean);
      renderIconsGrid();
    } catch (error) {
      if (requestId !== iconRequestId) return;
      if (error.name === 'AbortError') return;
      console.error('[Excali Up] Iconify search failed:', error);
      visibleIcons = [];
      if (grid) grid.innerHTML = '<div class="excaligif-icons-error">Failed to load icons. Try again.</div>';
      updatePaginationControls(0);
    } finally {
      if (iconFetchController === fetchController) iconFetchController = null;
    }
  }

  function renderIconsGrid() {
    const grid = document.getElementById('excaligif-icons-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (visibleIcons.length === 0) {
      grid.innerHTML = iconView === 'favorites'
        ? '<div class="excaligif-icons-empty"><iconify-icon icon="lucide:star" style="font-size:28px"></iconify-icon><span>No favorite icons yet.<br>Use the star on any icon to save it here.</span></div>'
        : '<div class="excaligif-icons-empty">No matching icons found.</div>';
      updatePaginationControls(0);
      const footer = document.getElementById('excaligif-icons-footer');
      if (footer) footer.textContent = 'Found 0 icons.';
      return;
    }

    const totalPages = Math.ceil(visibleIcons.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const itemsToRender = visibleIcons.slice(startIdx, endIdx);

    itemsToRender.forEach((icon) => {
      const card = document.createElement('div');
      card.className = 'excaligif-icon-card';
      card.setAttribute('draggable', 'true');
      const collectionName = icon.collection ? icon.collection.name : icon.prefix;
      card.setAttribute('title', `${icon.name}\n${collectionName}\nClick to insert · Drag onto the canvas`);

      card.innerHTML = `
        <button type="button" class="excaligif-icon-favorite${favoriteIcons.has(icon.icon) ? ' active' : ''}" title="${favoriteIcons.has(icon.icon) ? 'Remove from favorites' : 'Add to favorites'}" aria-label="${favoriteIcons.has(icon.icon) ? 'Remove from favorites' : 'Add to favorites'}">
          <iconify-icon icon="lucide:star" aria-hidden="true"></iconify-icon>
        </button>
        <iconify-icon class="excaligif-icon-glyph" icon="${icon.icon}" aria-hidden="true"></iconify-icon>
        <span class="icon-name">${icon.name.replace(/[-_]/g, ' ')}</span>
      `;

      const favoriteButton = card.querySelector('.excaligif-icon-favorite');
      favoriteButton.setAttribute('draggable', 'false');
      favoriteButton.addEventListener('pointerdown', event => event.stopPropagation());
      favoriteButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (favoriteIcons.has(icon.icon)) {
          favoriteIcons.delete(icon.icon);
          showToast(`"${icon.name}" removed from favorites`);
        } else {
          favoriteIcons.add(icon.icon);
          showToast(`"${icon.name}" added to favorites`);
        }
        saveFavoriteIcons();
        updateIconViewControls();
        if (iconView === 'favorites') {
          visibleIcons = getFilteredFavoriteIconNames()
            .map(createIconResult)
            .filter(Boolean);
        }
        renderIconsGrid();
      });

      card.addEventListener('dragstart', (e) => {
        if (e.target.closest && e.target.closest('.excaligif-icon-favorite')) {
          e.preventDefault();
          return;
        }
        isDraggingIcon = true;
        draggingIconData = { name: icon.name, icon: icon.icon };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', icon.icon);
        card.style.opacity = '0.5';
      });

      card.addEventListener('dragend', () => {
        isDraggingIcon = false;
        draggingIconData = null;
        card.style.opacity = '1';
      });

      card.addEventListener('click', async () => {
        if (card.classList.contains('is-loading')) return;
        card.classList.add('is-loading');
        try {
          const svgContent = await getSvgContent(icon.icon);
          if (!svgContent) {
            showToast('Could not load that icon');
            return;
          }
          queueAnimatedSvgImport(svgContent);
          pasteSvgIntoCanvas(svgContent);
          // Copying is a bonus (paste it elsewhere); it fails when the page is not focused.
          let copied = false;
          try {
            await navigator.clipboard.writeText(svgContent);
            copied = true;
          } catch {}
          showToast(copied ? `Inserted “${icon.name}” · SVG copied` : `Inserted “${icon.name}”`);
        } catch (err) {
          console.error('[Excali Up] Icon insert failed:', err);
          showToast('Could not insert that icon');
        } finally {
          card.classList.remove('is-loading');
        }
      });

      grid.appendChild(card);
    });

    updatePaginationControls(visibleIcons.length);

    const footer = document.getElementById('excaligif-icons-footer');
    if (footer) {
      const context = iconView === 'favorites'
        ? 'Favorites'
        : activePrefix && iconCollections[activePrefix]
        ? iconCollections[activePrefix].name
        : `${getMatchingCollections().length} packs`;
      const capped = searchQuery && visibleIcons.length === 999 ? 'First ' : '';
      footer.textContent = `${capped}${visibleIcons.length.toLocaleString()} icons · ${context} · Click or drag.`;
    }
  }

  function updatePaginationControls(totalItems) {
    const container = document.getElementById('excaligif-icons-pagination');
    if (!container) return;

    if (totalItems === 0) {
      container.innerHTML = '';
      return;
    }

    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    container.innerHTML = `
      <button class="excaligif-page-btn" id="btn-page-prev" ${currentPage === 1 ? 'disabled' : ''}>
        <iconify-icon icon="lucide:chevron-left" aria-hidden="true"></iconify-icon>
      </button>
      <span class="excaligif-page-info">Page ${currentPage} of ${totalPages}</span>
      <button class="excaligif-page-btn" id="btn-page-next" ${currentPage === totalPages ? 'disabled' : ''}>
        <iconify-icon icon="lucide:chevron-right" aria-hidden="true"></iconify-icon>
      </button>
    `;

    const prevBtn = container.querySelector('#btn-page-prev');
    const nextBtn = container.querySelector('#btn-page-next');

    if (prevBtn && currentPage > 1) {
      prevBtn.addEventListener('click', () => {
        currentPage--;
        renderIconsGrid();
        const grid = document.getElementById('excaligif-icons-grid');
        if (grid) grid.scrollTop = 0;
      });
    }

    if (nextBtn && currentPage < totalPages) {
      nextBtn.addEventListener('click', () => {
        currentPage++;
        renderIconsGrid();
        const grid = document.getElementById('excaligif-icons-grid');
        if (grid) grid.scrollTop = 0;
      });
    }
  }

  function updateSidebarTheme() {
    if (!currentApp) return;
    updateIconTint();
    const theme = currentApp.state.theme || 'light';
    if (theme === 'dark') {
      if (sidebarElement) {
        sidebarElement.classList.remove('theme--light');
        sidebarElement.classList.add('theme--dark');
      }
      if (sidebarButton) {
        sidebarButton.classList.remove('theme--light');
        sidebarButton.classList.add('theme--dark');
      }
    } else {
      if (sidebarElement) {
        sidebarElement.classList.remove('theme--dark');
        sidebarElement.classList.add('theme--light');
      }
      if (sidebarButton) {
        sidebarButton.classList.remove('theme--dark');
        sidebarButton.classList.add('theme--light');
      }
    }
  }

  function toggleSidebar() {
    if (!sidebarElement) return;
    const isOpen = sidebarElement.classList.contains('open');
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function openSidebar() {
    if (!sidebarElement || !sidebarButton) return;
    sidebarElement.classList.add('open');
    sidebarButton.classList.add('active');
    if (!iconCollections) {
      loadIconCollections();
    } else {
      renderIconsGrid();
    }
  }

  function closeSidebar() {
    if (!sidebarElement || !sidebarButton) return;
    sidebarElement.classList.remove('open');
    sidebarButton.classList.remove('active');
    clearTimeout(iconSearchTimer);
    if (iconFetchController) iconFetchController.abort();
    const grid = document.getElementById('excaligif-icons-grid');
    const pagination = document.getElementById('excaligif-icons-pagination');
    if (grid) grid.innerHTML = '';
    if (pagination) pagination.innerHTML = '';
  }

  function setupCanvasDropIntercept() {
    const canvas = document.querySelector('.excalidraw__canvas.interactive');
    if (!canvas) return;
    
    canvas.removeEventListener('dragover', onCanvasDragOver);
    canvas.removeEventListener('drop', onCanvasDrop);
    
    canvas.addEventListener('dragover', onCanvasDragOver);
    canvas.addEventListener('drop', onCanvasDrop);
  }

  function onCanvasDragOver(e) {
    if (isDraggingIcon) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  async function onCanvasDrop(e) {
    if (!isDraggingIcon || !draggingIconData) return;
    e.preventDefault();
    e.stopPropagation();

    const { name, icon } = draggingIconData;
    isDraggingIcon = false;
    draggingIconData = null;

    const canvas = document.querySelector('.excalidraw__canvas.interactive');
    if (!canvas) return;

    const clientX = e.clientX;
    const clientY = e.clientY;

    try {
      showToast("Fetching SVG...");
      const svgContent = await getSvgContent(icon);
      if (!svgContent) {
        showToast("Failed to fetch SVG");
        return;
      }

      queueAnimatedSvgImport(svgContent);
      const file = new File([svgContent], `${name}.svg`, { type: 'image/svg+xml' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const dropEvent = new DragEvent('drop', {
        dataTransfer,
        bubbles: true,
        cancelable: true,
        clientX,
        clientY
      });

      canvas.dispatchEvent(dropEvent);
      showToast("Icon dropped!");
    } catch (err) {
      console.error("[Excali Up] Drop failed:", err);
      showToast("Drop failed");
    }
  }

  // Returns the SVG ready to insert, using the current colour and size
  // preferences. Raw markup is cached, so changing preferences needs no refetch.
  async function getSvgContent(iconifyName) {
    const [prefix, iconName] = iconifyName.split(':');
    let rawSvg = svgCache.get(iconifyName);
    if (!rawSvg) {
      const url = `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(iconName)}.svg`;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        rawSvg = await response.text();
        if (svgCache.size >= 256) svgCache.delete(svgCache.keys().next().value);
        svgCache.set(iconifyName, rawSvg);
      } catch (e) {
        console.error(`[Excali Up] SVG fetch failed for ${iconifyName}:`, e);
        return null;
      }
    }

    const collection = iconCollections && iconCollections[prefix];
    const isMulticolor = !!(collection && collection.palette);
    const color = iconInsertPrefs.color === 'stroke' && !isMulticolor ? getCanvasStrokeColor() : null;
    return cleanSvg(rawSvg, { color, size: iconInsertPrefs.size });
  }

  function cleanSvg(svgText, { color = null, size = 96 } = {}) {
    svgText = svgText.replace(/<\?xml.*?\?>/gi, '');
    svgText = svgText.replace(/<!DOCTYPE.*?>/gi, '');
    let cleanedSvg = svgText
      .replace(/fill="#(000000|000|212121)"/gi, 'fill="currentColor"')
      .replace(/stroke="#(000000|000|212121)"/gi, 'stroke="currentColor"');
    // Images on the canvas cannot inherit a colour, so bake it in.
    if (color) cleanedSvg = cleanedSvg.replace(/currentColor/g, color);
    return Core.sizeSvgForCanvas(cleanedSvg, size);
  }

  // Excalidraw turns pasted SVG markup into an image element. It only accepts
  // a paste while focus is inside its container and not in a text field, so
  // move focus there first; the event goes to the document like a real paste.
  function pasteSvgIntoCanvas(svgContent) {
    const container = document.querySelector('.excalidraw');
    const active = document.activeElement;
    const isTextField = active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);
    if (container && (!container.contains(active) || isTextField)) {
      container.focus({ preventScroll: true });
    }
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', svgContent);
    document.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData,
      bubbles: true,
      cancelable: true
    }));
  }

  function showToast(message) {
    const api = currentApp && currentApp.api;
    if (api && typeof api.setToast === 'function') {
      try {
        api.setToast({ message, duration: 2500, closable: false });
        return;
      } catch {}
    }
    let toast = document.getElementById('excaligif-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'excaligif-toast';
      toast.className = 'excaligif-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    if (toast.timer) clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  // ==========================================
  // --- Local Vault & File Manager Engine ---
  // ==========================================

  const VAULT_SAVE_DELAY = 1200;
  const VAULT_RECENT_LIMIT = 10;
  let vaultLastSavedAt = 0;
  let vaultSavePromise = null;
  let vaultSaveQueued = false;
  let vaultOperationDepth = 0;
  let vaultChangeUnsubscribe = null;
  let vaultPollTimer = null;
  let vaultLastChangeSignature = null;
  let vaultStatusTimer = null;
  let vaultListingRequestId = 0;
  let vaultIsScanning = false;
  let vaultDrawerReturnFocus = null;
  let vaultButtonSignature = '';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatFileDate(timestamp) {
    if (!timestamp) return '';
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function getDrawingDisplayName(relativePath) {
    return String(relativePath || '').split('/').pop().replace(/\.excalidraw(?:\.json)?$/i, '');
  }

  function getParentFolder(relativePath) {
    return String(relativePath || '').split('/').slice(0, -1).join('/');
  }

  function joinVaultPath(folder, name) {
    return folder ? `${folder}/${name}` : name;
  }

  function isVaultPathInside(path, folderPath) {
    return path === folderPath || path.startsWith(`${folderPath}/`);
  }

  function getSceneHash(elements, appState, files) {
    const elCount = (elements || []).length;
    const versionSum = (elements || []).reduce((acc, el) => acc + (el.version || 0), 0);
    const bgColor = (appState && appState.viewBackgroundColor) || '';
    const fileKeys = files ? Object.keys(files).sort().join(',') : '';
    return `${elCount}:${versionSum}:${bgColor}:${fileKeys}`;
  }

  function getCurrentScene() {
    const api = currentApp && currentApp.api;
    return {
      elements: api ? api.getSceneElements() : [],
      appState: (currentApp && currentApp.state) || {},
      files: (api && api.getFiles && api.getFiles()) || (currentApp && currentApp.files) || {}
    };
  }

  function getCurrentSceneHash() {
    const scene = getCurrentScene();
    return getSceneHash(scene.elements, scene.appState, scene.files);
  }

  function getSceneName() {
    const api = currentApp && currentApp.api;
    const name = (api && typeof api.getName === 'function' && api.getName()) ||
      (currentApp && currentApp.state && currentApp.state.name);
    return typeof name === 'string' && name.trim() ? name : 'Untitled';
  }

  function clearSceneHistory() {
    const history = currentApp && currentApp.api && currentApp.api.history;
    if (history && typeof history.clear === 'function') {
      try {
        history.clear();
      } catch (error) {
        console.warn('[Excali Up] Could not clear undo history:', error);
      }
    }
  }

  // Replaces the canvas without recording an undo step, so Undo can never bring
  // back the previous drawing (which would then auto-save into the wrong file).
  function replaceScene(elements, appState) {
    currentApp.api.updateScene({
      elements,
      appState,
      captureUpdate: 'NEVER',
      commitToHistory: false
    });
    clearSceneHistory();
    vaultLastChangeSignature = null;
  }

  function isVaultConnected() {
    return !!rootVaultHandle && vaultSyncState !== 'unlinked' && vaultSyncState !== 'permission-required';
  }

  function vaultCanSave() {
    return isVaultConnected() && !!(currentApp && currentApp.api);
  }

  function setVaultSyncState(state) {
    vaultSyncState = state;
    updateVaultButtonState();
  }

  function getVaultStatusInfo() {
    const activeName = activeDrawingRelativePath ? getDrawingDisplayName(activeDrawingRelativePath) : '';
    switch (vaultSyncState) {
      case 'synced':
        return {
          tone: 'ok',
          label: activeName || 'Saved',
          detail: vaultLastSavedAt ? `Saved ${formatFileDate(vaultLastSavedAt)}` : 'All changes saved',
          tooltip: activeDrawingRelativePath
            ? `Saved to ${activeDrawingRelativePath}. Click to open the vault.`
            : 'Vault connected. Click to open the vault.'
        };
      case 'pending':
        return {
          tone: 'pending',
          label: activeName || 'Unsaved',
          detail: 'Unsaved changes',
          tooltip: 'Changes will be saved in a moment.'
        };
      case 'saving':
        return {
          tone: 'busy',
          label: activeName || 'Saving…',
          detail: 'Saving…',
          tooltip: 'Writing changes to disk…'
        };
      case 'permission-required':
        return {
          tone: 'warn',
          label: 'Reconnect',
          detail: 'Folder access needs to be granted again',
          tooltip: 'Permission needed. Click to reconnect the vault folder.'
        };
      case 'error':
        return {
          tone: 'error',
          label: 'Save failed',
          detail: 'Could not write to disk',
          tooltip: 'The last save failed. Open the vault to retry.'
        };
      case 'unlinked':
      default:
        return {
          tone: 'off',
          label: 'Vault',
          detail: 'Not connected',
          tooltip: 'Connect a local folder to auto-save your drawings.'
        };
    }
  }

  function updateVaultButtonState() {
    renderVaultStatusCard();
    if (!vaultStatusButton) return;
    const info = getVaultStatusInfo();
    const signature = `${info.tone}|${info.label}|${info.tooltip}`;
    if (signature === vaultButtonSignature) return;
    vaultButtonSignature = signature;

    vaultStatusButton.dataset.tone = info.tone;
    vaultStatusButton.classList.toggle('is-open', isVaultDrawerOpen);
    vaultStatusButton.innerHTML = `
      <span class="excaliup-vault-btn-icon" aria-hidden="true">
        <iconify-icon icon="lucide:hard-drive"></iconify-icon>
        <span class="excaliup-vault-dot" data-tone="${info.tone}"></span>
      </span>
      <span class="excaliup-vault-btn-label">${escapeHtml(info.label)}</span>
    `;
    vaultStatusButton.setAttribute('title', info.tooltip);
    vaultStatusButton.setAttribute('aria-label', `Local vault: ${info.label}. ${info.tooltip}`);
  }

  // --- Saving ---

  async function resolveAutoSavePath() {
    if (activeDrawingRelativePath) return activeDrawingRelativePath;
    const cleanName = Core.sanitizeFileName(getSceneName(), 'Untitled');
    const baseName = /\.excalidraw$/i.test(cleanName) ? cleanName : `${cleanName}.excalidraw`;
    return Core.getUniqueDrawingPath(rootVaultHandle, joinVaultPath(currentVaultRelativePath, baseName));
  }

  // Writes the current scene to the active drawing. Never throws.
  async function writeActiveDrawing(force = false) {
    if (!vaultCanSave()) return;
    const { elements, appState, files } = getCurrentScene();
    const hash = getSceneHash(elements, appState, files);
    if (!force && hash === lastSavedSceneHash) {
      if (vaultSyncState === 'pending') setVaultSyncState('synced');
      return;
    }
    // Do not create a file for an empty scene that was never saved.
    if (!activeDrawingRelativePath && elements.length === 0) {
      lastSavedSceneHash = hash;
      setVaultSyncState('synced');
      return;
    }

    setVaultSyncState('saving');
    try {
      const isNewFile = !activeDrawingRelativePath;
      const targetPath = await resolveAutoSavePath();
      const jsonContent = Core.serializeExcalidrawScene({ elements, appState, files });
      await Core.writeDrawingFile(rootVaultHandle, targetPath, jsonContent);
      activeDrawingRelativePath = targetPath;
      lastSavedSceneHash = hash;
      vaultLastSavedAt = Date.now();
      if (isNewFile) {
        vaultMetadata.lastOpenedFile = targetPath;
        await Core.writeVaultMetadata(rootVaultHandle, vaultMetadata);
      }
      setVaultSyncState(getCurrentSceneHash() === hash ? 'synced' : 'pending');
      updateVaultListingEntry(targetPath, jsonContent.length);
    } catch (err) {
      console.error('[Excali Up] Vault auto-save failed:', err);
      const hasPerm = await Core.verifyHandlePermission(rootVaultHandle, true);
      setVaultSyncState(hasPerm ? 'error' : 'permission-required');
    }
  }

  function saveVaultNow(force = false) {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (!vaultCanSave()) return Promise.resolve();
    if (vaultSavePromise || vaultOperationDepth > 0) {
      vaultSaveQueued = true;
      return vaultSavePromise || Promise.resolve();
    }
    vaultSavePromise = writeActiveDrawing(force).finally(() => {
      vaultSavePromise = null;
      if (vaultSaveQueued && vaultOperationDepth === 0) {
        vaultSaveQueued = false;
        scheduleVaultAutoSave();
      }
    });
    return vaultSavePromise;
  }

  function scheduleVaultAutoSave(immediate = false) {
    if (!vaultCanSave()) return Promise.resolve();
    if (immediate) return saveVaultNow(true);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (vaultSyncState === 'synced') setVaultSyncState('pending');
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      saveVaultNow(false);
    }, VAULT_SAVE_DELAY);
    return Promise.resolve();
  }

  // Runs a file operation while auto-save is paused. Pending changes of the
  // current drawing are written first so nothing is lost when switching files.
  async function withVaultLock(task, { flush = false } = {}) {
    vaultOperationDepth++;
    try {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        vaultSaveQueued = true;
      }
      if (vaultSavePromise) await vaultSavePromise;
      if (flush) {
        await writeActiveDrawing(false);
        vaultSaveQueued = false;
      }
      return await task();
    } finally {
      vaultOperationDepth--;
      if (vaultOperationDepth === 0 && vaultSaveQueued) {
        vaultSaveQueued = false;
        scheduleVaultAutoSave();
      }
    }
  }

  function flushVaultOnExit() {
    if (vaultCanSave() && (autoSaveTimer || vaultSyncState === 'pending')) saveVaultNow(false);
  }

  function onVaultSceneChange(elements, appState, files) {
    if (!vaultCanSave()) return;
    // onChange also fires for scrolling and selection; skip those cheaply.
    const signature = `${elements && elements.length}|${appState && appState.viewBackgroundColor}|${files ? Object.keys(files).length : 0}`;
    if (vaultLastChangeSignature && elements === vaultLastChangeSignature.elements && signature === vaultLastChangeSignature.value) {
      return;
    }
    vaultLastChangeSignature = { elements, value: signature };
    if (getCurrentSceneHash() !== lastSavedSceneHash) scheduleVaultAutoSave();
  }

  function attachVaultChangeListener() {
    detachVaultChangeListener();
    const api = currentApp && currentApp.api;
    if (api && typeof api.onChange === 'function') {
      const unsubscribe = api.onChange(onVaultSceneChange);
      vaultChangeUnsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null;
      return;
    }
    vaultPollTimer = setInterval(() => {
      if (document.hidden || !currentApp) return;
      const scene = getCurrentScene();
      onVaultSceneChange(scene.elements, scene.appState, scene.files);
    }, 1000);
  }

  function detachVaultChangeListener() {
    if (vaultChangeUnsubscribe) {
      try {
        vaultChangeUnsubscribe();
      } catch {}
      vaultChangeUnsubscribe = null;
    }
    if (vaultPollTimer) {
      clearInterval(vaultPollTimer);
      vaultPollTimer = null;
    }
    vaultLastChangeSignature = null;
  }

  // --- Connection ---

  async function waitForSceneHydration(timeoutMs = 2000) {
    const startedAt = Date.now();
    while (
      currentApp &&
      currentApp.api &&
      currentApp.api.getSceneElements().length === 0 &&
      Date.now() - startedAt < timeoutMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // After a reload Excalidraw restores its own copy of the scene. Link it back
  // to the drawing it was saved from, but only when the scene is clearly the
  // same drawing (shared element ids), so another scene can never overwrite it.
  function restoreActiveDrawing() {
    // Auto-save stays paused until we know which file the scene belongs to.
    return withVaultLock(restoreActiveDrawingUnlocked);
  }

  async function restoreActiveDrawingUnlocked() {
    activeDrawingRelativePath = null;
    lastSavedSceneHash = '';
    const lastPath = vaultMetadata.lastOpenedFile;
    if (!lastPath || !currentApp || !currentApp.api) return;

    try {
      await waitForSceneHydration();
      const scene = Core.parseExcalidrawScene(await Core.readDrawingFile(rootVaultHandle, lastPath));
      if (!scene) return;
      const current = getCurrentScene();
      const currentIds = new Set(current.elements.map((element) => element.id));
      const fileElements = scene.elements.filter((element) => element && !element.isDeleted);
      const sameDrawing = fileElements.length === 0 || fileElements.some((element) => currentIds.has(element.id));
      if (!sameDrawing) return;

      activeDrawingRelativePath = Core.normalizeVaultPath(lastPath);
      const fileHash = getSceneHash(fileElements, scene.appState, scene.files);
      const currentHash = getSceneHash(current.elements, current.appState, current.files);
      lastSavedSceneHash = fileHash === currentHash ? currentHash : '';
      if (!lastSavedSceneHash && current.elements.length > 0) scheduleVaultAutoSave();
    } catch {
      // The last drawing was moved or deleted outside the extension.
    }
  }

  async function connectLocalVaultFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      showToast('This browser cannot access local folders.');
      return;
    }

    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'excaliup-vault', mode: 'readwrite' });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[Excali Up] Connect vault failed:', err);
        showToast('Could not open that folder');
      }
      return;
    }
    if (!handle) return;

    try {
      await withVaultLock(async () => {
        await Core.setStoredVaultHandle(handle);
        rootVaultHandle = handle;
        vaultMetadata = await Core.readVaultMetadata(handle);
        currentVaultRelativePath = '';
        vaultSearchQuery = '';
        activeDrawingRelativePath = null;
        lastSavedSceneHash = '';
        vaultLastSavedAt = 0;
        setVaultSyncState('synced');
      }, { flush: true });
      await saveVaultNow(false);
      await refreshVaultListing(true);
      showToast(`Connected to “${handle.name}”`);
    } catch (err) {
      console.error('[Excali Up] Connect vault failed:', err);
      showToast('Could not connect that folder');
    }
  }

  async function requestVaultPermission() {
    if (!rootVaultHandle) return connectLocalVaultFolder();
    const granted = await Core.requestHandlePermission(rootVaultHandle, true);
    if (!granted) {
      showToast('Folder access was not granted');
      return;
    }
    vaultMetadata = await Core.readVaultMetadata(rootVaultHandle);
    setVaultSyncState('synced');
    await restoreActiveDrawing();
    await refreshVaultListing(true);
  }

  // --- File operations ---

  async function openVaultDrawing(relativePath) {
    if (!rootVaultHandle || !relativePath || !currentApp || !currentApp.api) return;
    if (relativePath === activeDrawingRelativePath) {
      closeVaultDrawer();
      return;
    }

    try {
      const opened = await withVaultLock(async () => {
        const scene = Core.parseExcalidrawScene(await Core.readDrawingFile(rootVaultHandle, relativePath));
        if (!scene) return false;

        const name = getDrawingDisplayName(relativePath);
        const appState = { name };
        if (typeof scene.appState.viewBackgroundColor === 'string') {
          appState.viewBackgroundColor = scene.appState.viewBackgroundColor;
        }
        const files = Object.values(scene.files || {}).filter((file) => file && file.id && file.dataURL);
        if (files.length && typeof currentApp.api.addFiles === 'function') currentApp.api.addFiles(files);
        replaceScene(scene.elements, appState);

        activeDrawingRelativePath = Core.normalizeVaultPath(relativePath);
        lastSavedSceneHash = getCurrentSceneHash();
        vaultLastSavedAt = 0;
        if (typeof currentApp.scrollToContent === 'function' && scene.elements.length) {
          try {
            currentApp.scrollToContent(undefined, { fitToContent: true });
          } catch {}
        }
        vaultMetadata.lastOpenedFile = activeDrawingRelativePath;
        await Core.writeVaultMetadata(rootVaultHandle, vaultMetadata);
        setVaultSyncState('synced');
        return true;
      }, { flush: true });

      if (!opened) {
        showToast('That file is not a valid Excalidraw drawing');
        return;
      }
      renderVaultItems();
      showToast(`Opened “${getDrawingDisplayName(relativePath)}”`);
    } catch (err) {
      console.error('[Excali Up] Failed to open drawing:', err);
      showToast('Could not open that drawing');
      refreshVaultListing(true);
    }
  }

  function getDrawingFileName(name) {
    const cleanName = Core.sanitizeFileName(name, '');
    if (!cleanName) return '';
    return /\.excalidraw$/i.test(cleanName) ? cleanName : `${cleanName}.excalidraw`;
  }

  async function getFolderOptions(selectedPath) {
    const folders = await Core.scanAllVaultFolders(rootVaultHandle, '');
    return [
      { value: '', label: 'Vault root', selected: selectedPath === '' },
      ...folders.map((folder) => ({
        value: folder.path,
        label: `${'   '.repeat(folder.depth + 1)}${folder.name}`,
        selected: folder.path === selectedPath
      }))
    ];
  }

  async function createNewVaultDrawing() {
    if (!isVaultConnected()) {
      await connectLocalVaultFolder();
      if (!isVaultConnected()) return;
    }

    const defaultName = `Drawing ${new Date().toISOString().slice(0, 10)}`;
    const defaultPath = await Core.getUniqueDrawingPath(
      rootVaultHandle,
      joinVaultPath(currentVaultRelativePath, `${defaultName}.excalidraw`)
    );
    const folderOptions = await getFolderOptions(currentVaultRelativePath);

    openVaultModal({
      icon: 'lucide:file-plus-2',
      title: 'New drawing',
      description: 'Your current drawing is saved first. The canvas then starts empty.',
      fields: [
        { id: 'name', label: 'Name', value: getDrawingDisplayName(defaultPath), placeholder: 'Drawing name' },
        { id: 'folder', label: 'Folder', type: 'select', options: folderOptions }
      ],
      confirmText: 'Create drawing',
      validate: async ({ name, folder }) => {
        const fileName = getDrawingFileName(name);
        if (!fileName) return 'Enter a name for the drawing.';
        if (await Core.drawingFileExists(rootVaultHandle, joinVaultPath(folder, fileName))) {
          return 'A drawing with this name already exists in that folder.';
        }
        return '';
      },
      onConfirm: async ({ name, folder }) => {
        const fileName = getDrawingFileName(name);
        const targetPath = joinVaultPath(folder, fileName);
        const displayName = getDrawingDisplayName(fileName);
        try {
          await withVaultLock(async () => {
            const background = (currentApp.state && currentApp.state.viewBackgroundColor) || '#ffffff';
            await Core.writeDrawingFile(rootVaultHandle, targetPath, Core.serializeExcalidrawScene({
              elements: [],
              appState: { name: displayName, viewBackgroundColor: background },
              files: {}
            }));
            replaceScene([], { name: displayName });
            activeDrawingRelativePath = targetPath;
            lastSavedSceneHash = getCurrentSceneHash();
            vaultLastSavedAt = Date.now();
            vaultMetadata.lastOpenedFile = targetPath;
            await Core.writeVaultMetadata(rootVaultHandle, vaultMetadata);
            currentVaultRelativePath = folder;
            vaultCurrentView = 'all';
            setVaultSyncState('synced');
          }, { flush: true });
          await refreshVaultListing(true);
          showToast(`Created “${displayName}”`);
        } catch (err) {
          console.error('[Excali Up] Failed to create drawing:', err);
          showToast('Could not create the drawing');
        }
      }
    });
  }

  async function createNewVaultSubfolder() {
    if (!isVaultConnected()) {
      await connectLocalVaultFolder();
      if (!isVaultConnected()) return;
    }

    const parentLabel = currentVaultRelativePath ? `“${currentVaultRelativePath}”` : 'the vault root';
    openVaultModal({
      icon: 'lucide:folder-plus',
      title: 'New folder',
      description: `Created inside ${parentLabel}.`,
      fields: [{ id: 'name', label: 'Folder name', value: '', placeholder: 'e.g. Client work' }],
      confirmText: 'Create folder',
      validate: ({ name }) => (Core.sanitizeFileName(name, '') ? '' : 'Enter a folder name.'),
      onConfirm: async ({ name }) => {
        const folderName = Core.sanitizeFileName(name, '');
        const targetPath = joinVaultPath(currentVaultRelativePath, folderName);
        try {
          await Core.createVaultSubfolder(rootVaultHandle, targetPath);
          currentVaultRelativePath = targetPath;
          await refreshVaultListing(true);
          showToast(`Created folder “${folderName}”`);
        } catch (err) {
          console.error('[Excali Up] Failed to create folder:', err);
          showToast('Could not create the folder');
        }
      }
    });
  }

  async function saveVaultMetadata() {
    await Core.writeVaultMetadata(rootVaultHandle, vaultMetadata);
  }

  function replaceVaultPathReferences(fromPath, toPath) {
    vaultMetadata.favorites = (vaultMetadata.favorites || []).map((path) => (path === fromPath ? toPath : path));
    if (vaultMetadata.lastOpenedFile === fromPath) vaultMetadata.lastOpenedFile = toPath;
    if (activeDrawingRelativePath === fromPath) activeDrawingRelativePath = toPath;
  }

  async function toggleVaultFavorite(relativePath) {
    if (!rootVaultHandle || !relativePath) return;
    const favorites = new Set(vaultMetadata.favorites || []);
    if (favorites.has(relativePath)) {
      favorites.delete(relativePath);
    } else {
      favorites.add(relativePath);
    }
    vaultMetadata.favorites = [...favorites];
    renderVaultItems();
    await saveVaultMetadata();
  }

  function renameVaultDrawing(relativePath) {
    if (!rootVaultHandle || !relativePath) return;
    const oldName = getDrawingDisplayName(relativePath);
    const folder = getParentFolder(relativePath);

    openVaultModal({
      icon: 'lucide:pencil',
      title: 'Rename drawing',
      fields: [{ id: 'name', label: 'Name', value: oldName, placeholder: 'Drawing name' }],
      confirmText: 'Rename',
      validate: async ({ name }) => {
        const fileName = getDrawingFileName(name);
        if (!fileName) return 'Enter a name for the drawing.';
        const targetPath = joinVaultPath(folder, fileName);
        if (
          targetPath.toLowerCase() !== relativePath.toLowerCase() &&
          await Core.drawingFileExists(rootVaultHandle, targetPath)
        ) {
          return 'Another drawing in this folder already has that name.';
        }
        return '';
      },
      onConfirm: async ({ name }) => {
        const fileName = getDrawingFileName(name);
        const targetPath = joinVaultPath(folder, fileName);
        if (targetPath === relativePath) return;
        const newName = getDrawingDisplayName(fileName);
        try {
          await withVaultLock(async () => {
            await Core.renameDrawingFile(rootVaultHandle, relativePath, targetPath);
            const wasActive = activeDrawingRelativePath === relativePath;
            replaceVaultPathReferences(relativePath, targetPath);
            if (wasActive && currentApp && currentApp.api) {
              currentApp.api.updateScene({ appState: { name: newName }, captureUpdate: 'NEVER' });
            }
            await saveVaultMetadata();
          }, { flush: activeDrawingRelativePath === relativePath });
          await refreshVaultListing(true);
          showToast(`Renamed to “${newName}”`);
        } catch (err) {
          console.error('[Excali Up] Rename failed:', err);
          showToast(err && err.name === 'VaultEntryExistsError'
            ? 'Another drawing already has that name'
            : 'Could not rename the drawing');
        }
      }
    });
  }

  async function duplicateVaultDrawing(relativePath) {
    if (!rootVaultHandle || !relativePath) return;
    const baseName = getDrawingDisplayName(relativePath);
    try {
      const newPath = await withVaultLock(async () => {
        const targetPath = await Core.getUniqueDrawingPath(
          rootVaultHandle,
          joinVaultPath(getParentFolder(relativePath), `${baseName} (Copy).excalidraw`),
          (stem, index) => `${baseName} (Copy ${index})`
        );
        const content = await Core.readDrawingFile(rootVaultHandle, relativePath);
        await Core.writeDrawingFile(rootVaultHandle, targetPath, content);
        return targetPath;
      }, { flush: activeDrawingRelativePath === relativePath });
      await refreshVaultListing(true);
      showToast(`Duplicated as “${getDrawingDisplayName(newPath)}”`);
    } catch (err) {
      console.error('[Excali Up] Duplicate failed:', err);
      showToast('Could not duplicate the drawing');
    }
  }

  async function moveVaultDrawing(sourceRelativePath, targetRelativeFolderPath) {
    if (!rootVaultHandle || !sourceRelativePath) return;
    const destination = targetRelativeFolderPath || 'Vault root';

    try {
      const result = await withVaultLock(async () => {
        const moveResult = await Core.moveDrawingFile(rootVaultHandle, sourceRelativePath, targetRelativeFolderPath);
        if (moveResult.moved) {
          replaceVaultPathReferences(sourceRelativePath, moveResult.newRelativePath);
          await saveVaultMetadata();
        }
        return moveResult;
      }, { flush: activeDrawingRelativePath === sourceRelativePath });

      if (result.moved) {
        await refreshVaultListing(true);
        showToast(`Moved to “${destination}”`);
      } else {
        showToast('The drawing is already in that folder');
      }
    } catch (err) {
      console.error('[Excali Up] Failed to move drawing:', err);
      showToast(err && err.name === 'VaultEntryExistsError'
        ? `“${destination}” already has a drawing with that name`
        : 'Could not move the drawing');
    }
  }

  async function showVaultMoveModal(drawingPath) {
    if (!rootVaultHandle || !drawingPath) return;
    const currentFolder = getParentFolder(drawingPath);
    const folderOptions = await getFolderOptions(currentFolder);

    openVaultModal({
      icon: 'lucide:folder-input',
      title: 'Move drawing',
      description: `Choose where to move “${getDrawingDisplayName(drawingPath)}”.`,
      fields: [{ id: 'folder', label: 'Destination', type: 'select', options: folderOptions }],
      confirmText: 'Move',
      onConfirm: ({ folder }) => moveVaultDrawing(drawingPath, folder)
    });
  }

  function deleteVaultDrawing(relativePath) {
    if (!rootVaultHandle || !relativePath) return;
    const name = getDrawingDisplayName(relativePath);
    const isActive = activeDrawingRelativePath === relativePath;

    openVaultModal({
      icon: 'lucide:trash-2',
      tone: 'danger',
      title: 'Delete drawing?',
      description: isActive
        ? `“${name}” is open right now. The file is removed from disk, and the canvas stays unsaved until you edit it again.`
        : `“${name}” will be permanently removed from your disk.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await withVaultLock(async () => {
            await Core.deleteDrawingFile(rootVaultHandle, relativePath);
            vaultMetadata.favorites = (vaultMetadata.favorites || []).filter((path) => path !== relativePath);
            if (vaultMetadata.lastOpenedFile === relativePath) vaultMetadata.lastOpenedFile = null;
            if (activeDrawingRelativePath === relativePath) {
              activeDrawingRelativePath = null;
              lastSavedSceneHash = getCurrentSceneHash();
            }
            await saveVaultMetadata();
          });
          await refreshVaultListing(true);
          showToast(`Deleted “${name}”`);
        } catch (err) {
          console.error('[Excali Up] Delete failed:', err);
          showToast('Could not delete the drawing');
        }
      }
    });
  }

  function deleteVaultFolderWithConfirm(folderPath) {
    if (!rootVaultHandle || !folderPath) return;
    const folderName = folderPath.split('/').pop();
    const drawingCount = vaultAllDrawings.filter((file) => isVaultPathInside(file.path, folderPath)).length;

    openVaultModal({
      icon: 'lucide:folder-x',
      tone: 'danger',
      title: 'Delete folder?',
      description: drawingCount
        ? `“${folderName}” and the ${drawingCount} drawing${drawingCount === 1 ? '' : 's'} inside it will be permanently removed from your disk.`
        : `The empty folder “${folderName}” will be removed from your disk.`,
      confirmText: 'Delete folder',
      onConfirm: async () => {
        try {
          await withVaultLock(async () => {
            await Core.deleteVaultFolder(rootVaultHandle, folderPath, true);
            vaultMetadata.favorites = (vaultMetadata.favorites || []).filter((path) => !isVaultPathInside(path, folderPath));
            if (vaultMetadata.lastOpenedFile && isVaultPathInside(vaultMetadata.lastOpenedFile, folderPath)) {
              vaultMetadata.lastOpenedFile = null;
            }
            if (activeDrawingRelativePath && isVaultPathInside(activeDrawingRelativePath, folderPath)) {
              activeDrawingRelativePath = null;
              lastSavedSceneHash = getCurrentSceneHash();
            }
            if (isVaultPathInside(currentVaultRelativePath, folderPath)) {
              currentVaultRelativePath = getParentFolder(folderPath);
            }
            await saveVaultMetadata();
          });
          await refreshVaultListing(true);
          showToast(`Deleted folder “${folderName}”`);
        } catch (err) {
          console.error('[Excali Up] Delete folder failed:', err);
          showToast('Could not delete the folder');
        }
      }
    });
  }

  // --- Listing ---

  async function refreshVaultListing(render = true) {
    if (!isVaultConnected()) {
      if (render) renderVaultDrawer();
      return;
    }

    const requestId = ++vaultListingRequestId;
    vaultIsScanning = true;
    if (render) renderVaultStatusCard();
    try {
      let directory;
      try {
        directory = await Core.scanVaultDirectory(rootVaultHandle, currentVaultRelativePath);
      } catch (err) {
        if (!currentVaultRelativePath) throw err;
        // The folder vanished (deleted outside the browser): fall back to the root.
        currentVaultRelativePath = '';
        directory = await Core.scanVaultDirectory(rootVaultHandle, '');
      }
      const allDrawings = await Core.scanAllVaultDrawings(rootVaultHandle, '');
      if (requestId !== vaultListingRequestId) return;
      vaultDirectoryData = directory;
      vaultAllDrawings = allDrawings;
    } catch (err) {
      if (requestId !== vaultListingRequestId) return;
      console.error('[Excali Up] Failed to scan vault:', err);
      const hasPerm = await Core.verifyHandlePermission(rootVaultHandle, true);
      if (!hasPerm) setVaultSyncState('permission-required');
    } finally {
      if (requestId === vaultListingRequestId) vaultIsScanning = false;
    }
    if (render && requestId === vaultListingRequestId) renderVaultDrawer();
  }

  // Cheap update after an auto-save instead of rescanning the whole vault.
  function updateVaultListingEntry(relativePath, size) {
    const now = Date.now();
    const name = relativePath.split('/').pop();
    const update = (list, addIfMissing) => {
      const entry = list.find((file) => file.path === relativePath);
      if (entry) {
        entry.size = size;
        entry.lastModified = now;
      } else if (addIfMissing) {
        list.push({ name, path: relativePath, size, lastModified: now });
      }
      list.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    };
    update(vaultAllDrawings, true);
    if (vaultDirectoryData && Array.isArray(vaultDirectoryData.files)) {
      update(vaultDirectoryData.files, getParentFolder(relativePath) === currentVaultRelativePath);
    }
    if (isVaultDrawerOpen) renderVaultItems();
  }

  function getVisibleVaultEntries() {
    const query = vaultSearchQuery.trim().toLowerCase();
    const favorites = new Set(vaultMetadata.favorites || []);
    const matches = (file) => !query || getDrawingDisplayName(file.path).toLowerCase().includes(query);

    if (vaultCurrentView === 'favorites') {
      return {
        folders: [],
        files: vaultAllDrawings
          .filter((file) => favorites.has(file.path) && matches(file))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
        showPath: true,
        filesLabel: 'Starred'
      };
    }
    if (vaultCurrentView === 'recent') {
      return {
        folders: [],
        files: [...vaultAllDrawings]
          .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
          .filter(matches)
          .slice(0, VAULT_RECENT_LIMIT),
        showPath: true,
        filesLabel: 'Recently edited'
      };
    }
    if (query) {
      return {
        folders: (vaultDirectoryData.folders || []).filter((folder) => folder.name.toLowerCase().includes(query)),
        files: vaultAllDrawings.filter(matches),
        showPath: true,
        filesLabel: 'Matching drawings'
      };
    }
    return {
      folders: vaultDirectoryData.folders || [],
      files: vaultDirectoryData.files || [],
      showPath: false,
      filesLabel: 'Drawings'
    };
  }

  function renderVaultDrawer() {
    if (!vaultDrawerElement) return;
    const connected = isVaultConnected();
    vaultDrawerElement.classList.toggle('is-disconnected', !connected);
    renderVaultStatusCard();
    renderVaultTabs();
    renderVaultBreadcrumbs();
    renderVaultItems();
  }

  function renderVaultStatusCard() {
    const card = document.getElementById('excaliup-vault-status');
    if (!card) return;
    if (!isVaultConnected()) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const info = getVaultStatusInfo();
    const activeName = activeDrawingRelativePath ? getDrawingDisplayName(activeDrawingRelativePath) : '';
    card.dataset.tone = info.tone;
    card.innerHTML = `
      <span class="excaliup-vault-status-icon" aria-hidden="true">
        <iconify-icon icon="lucide:folder-open"></iconify-icon>
      </span>
      <span class="excaliup-vault-status-text">
        <span class="excaliup-vault-status-name" title="${escapeHtml(rootVaultHandle.name)}">${escapeHtml(rootVaultHandle.name)}</span>
        <span class="excaliup-vault-status-detail" role="status" aria-live="polite">
          <span class="excaliup-vault-dot" data-tone="${info.tone}"></span>
          <span>${escapeHtml(vaultIsScanning && info.tone === 'ok' ? 'Scanning folder…' : info.detail)}${activeName ? ` · <strong>${escapeHtml(activeName)}</strong>` : ''}</span>
        </span>
      </span>
      ${info.tone === 'error'
        ? '<button type="button" class="excaliup-vault-link-btn" data-vault-action="retry-save">Retry</button>'
        : '<button type="button" class="excaliup-vault-link-btn" data-vault-action="change-folder" title="Connect a different folder">Change</button>'}
    `;
  }

  function renderVaultTabs() {
    if (!vaultDrawerElement) return;
    for (const tab of vaultDrawerElement.querySelectorAll('[data-vault-tab]')) {
      const isActive = tab.dataset.vaultTab === vaultCurrentView;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    }
    const allCount = document.getElementById('excaliup-vault-count-all');
    const starCount = document.getElementById('excaliup-vault-count-favorites');
    const existing = new Set(vaultAllDrawings.map((file) => file.path));
    if (allCount) allCount.textContent = String(vaultAllDrawings.length);
    if (starCount) {
      starCount.textContent = String((vaultMetadata.favorites || []).filter((path) => existing.has(path)).length);
    }
  }

  function renderVaultBreadcrumbs() {
    const container = document.getElementById('excaliup-vault-breadcrumbs');
    if (!container) return;
    const visible = isVaultConnected() && vaultCurrentView === 'all' && !vaultSearchQuery.trim();
    container.hidden = !visible;
    if (!visible) return;

    const crumbs = [{ path: '', label: 'Vault' }];
    let accumulated = '';
    for (const segment of currentVaultRelativePath.split('/').filter(Boolean)) {
      accumulated = joinVaultPath(accumulated, segment);
      crumbs.push({ path: accumulated, label: segment });
    }

    container.innerHTML = crumbs.map((crumb, index) => {
      const isLast = index === crumbs.length - 1;
      const icon = index === 0 ? '<iconify-icon icon="lucide:home" aria-hidden="true"></iconify-icon>' : '';
      const separator = index > 0 ? '<iconify-icon class="excaliup-vault-crumb-sep" icon="lucide:chevron-right" aria-hidden="true"></iconify-icon>' : '';
      return `${separator}<button type="button" class="excaliup-vault-crumb${isLast ? ' is-current' : ''}" data-vault-crumb="${escapeHtml(crumb.path)}" data-drop-folder="${escapeHtml(crumb.path)}"${isLast ? ' aria-current="page"' : ''}>${icon}<span>${escapeHtml(crumb.label)}</span></button>`;
    }).join('');
  }

  function renderVaultEmptyState(list, { icon, title, text, action, actionLabel, actionIcon }) {
    list.innerHTML = `
      <div class="excaliup-vault-empty">
        <span class="excaliup-vault-empty-icon"><iconify-icon icon="${icon}" aria-hidden="true"></iconify-icon></span>
        <div class="excaliup-vault-empty-title">${escapeHtml(title)}</div>
        <div class="excaliup-vault-empty-text">${escapeHtml(text)}</div>
        ${action ? `<button type="button" class="excaliup-vault-button is-primary" data-vault-action="${action}">
          <iconify-icon icon="${actionIcon}" aria-hidden="true"></iconify-icon><span>${escapeHtml(actionLabel)}</span>
        </button>` : ''}
      </div>
    `;
  }

  function renderFolderRow(folder) {
    const count = vaultAllDrawings.filter((file) => isVaultPathInside(file.path, folder.path)).length;
    return `
      <div class="excaliup-vault-row is-folder" role="listitem" tabindex="-1" data-kind="folder" data-path="${escapeHtml(folder.path)}" data-drop-folder="${escapeHtml(folder.path)}">
        <span class="excaliup-vault-row-icon" aria-hidden="true"><iconify-icon icon="lucide:folder"></iconify-icon></span>
        <span class="excaliup-vault-row-text">
          <span class="excaliup-vault-row-name">${escapeHtml(folder.name)}</span>
          <span class="excaliup-vault-row-meta">${count ? `${count} drawing${count === 1 ? '' : 's'}` : 'Empty'}</span>
        </span>
        <button type="button" class="excaliup-vault-row-menu" data-vault-action="menu" aria-label="Folder actions for ${escapeHtml(folder.name)}" title="Actions">
          <iconify-icon icon="lucide:more-horizontal" aria-hidden="true"></iconify-icon>
        </button>
        <iconify-icon class="excaliup-vault-row-chevron" icon="lucide:chevron-right" aria-hidden="true"></iconify-icon>
      </div>
    `;
  }

  function renderFileRow(file, showPath, favorites) {
    const isStarred = favorites.has(file.path);
    const isActive = activeDrawingRelativePath === file.path;
    const name = getDrawingDisplayName(file.path);
    const folder = getParentFolder(file.path);
    const meta = [
      showPath ? (folder || 'Vault root') : '',
      formatFileDate(file.lastModified),
      formatBytes(file.size)
    ].filter(Boolean).join(' · ');

    return `
      <div class="excaliup-vault-row is-file${isActive ? ' is-active' : ''}" role="listitem" tabindex="-1" draggable="true" data-kind="file" data-path="${escapeHtml(file.path)}"${isActive ? ' aria-current="true"' : ''}>
        <button type="button" class="excaliup-vault-star${isStarred ? ' is-starred' : ''}" data-vault-action="star" aria-pressed="${isStarred}" aria-label="${isStarred ? 'Remove from starred' : 'Star'} ${escapeHtml(name)}" title="${isStarred ? 'Unstar' : 'Star'}">
          <iconify-icon icon="${isStarred ? 'material-symbols:star-rounded' : 'material-symbols:star-outline-rounded'}" aria-hidden="true"></iconify-icon>
        </button>
        <span class="excaliup-vault-row-text">
          <span class="excaliup-vault-row-name">${escapeHtml(name)}</span>
          <span class="excaliup-vault-row-meta">${escapeHtml(meta)}</span>
        </span>
        ${isActive ? '<span class="excaliup-vault-chip">Open</span>' : ''}
        <button type="button" class="excaliup-vault-row-menu" data-vault-action="menu" aria-label="Actions for ${escapeHtml(name)}" title="Actions">
          <iconify-icon icon="lucide:more-horizontal" aria-hidden="true"></iconify-icon>
        </button>
      </div>
    `;
  }

  function renderVaultItems() {
    const list = document.getElementById('excaliup-vault-list');
    const footer = document.getElementById('excaliup-vault-footer-info');
    if (!list) return;

    if (!rootVaultHandle || vaultSyncState === 'unlinked') {
      if (footer) footer.textContent = '';
      renderVaultEmptyState(list, {
        icon: 'lucide:hard-drive-download',
        title: 'Save drawings to your computer',
        text: 'Pick a folder and every change is written to a .excalidraw file there automatically. Nothing leaves your machine.',
        action: 'connect',
        actionLabel: 'Choose folder',
        actionIcon: 'lucide:folder-open'
      });
      return;
    }

    if (vaultSyncState === 'permission-required') {
      if (footer) footer.textContent = '';
      renderVaultEmptyState(list, {
        icon: 'lucide:shield-alert',
        title: 'Reconnect your vault',
        text: `The browser needs your permission again to use “${rootVaultHandle.name}”.`,
        action: 'reconnect',
        actionLabel: 'Grant access',
        actionIcon: 'lucide:key-round'
      });
      return;
    }

    renderVaultTabs();
    const { folders, files, showPath, filesLabel } = getVisibleVaultEntries();
    if (footer) {
      const total = vaultAllDrawings.length;
      footer.textContent = `${total} drawing${total === 1 ? '' : 's'} in vault`;
    }

    if (folders.length === 0 && files.length === 0) {
      const query = vaultSearchQuery.trim();
      const emptyByView = {
        favorites: { icon: 'material-symbols:star-outline-rounded', title: 'No starred drawings', text: 'Star a drawing to pin it here.' },
        recent: { icon: 'lucide:clock', title: 'Nothing here yet', text: 'Drawings you edit show up here.' },
        all: currentVaultRelativePath
          ? { icon: 'lucide:folder-open', title: 'This folder is empty', text: 'Create a drawing here, or drag one onto this folder.' }
          : { icon: 'lucide:file-plus-2', title: 'No drawings yet', text: 'Start drawing and it is saved here automatically.' }
      };
      renderVaultEmptyState(list, query
        ? { icon: 'lucide:search-x', title: 'No matches', text: `Nothing matches “${query}”.` }
        : emptyByView[vaultCurrentView] || emptyByView.all);
      return;
    }

    const favorites = new Set(vaultMetadata.favorites || []);
    let html = '';
    if (folders.length) {
      html += `<div class="excaliup-vault-section-label">Folders</div>`;
      html += folders.map(renderFolderRow).join('');
    }
    if (files.length) {
      html += `<div class="excaliup-vault-section-label">${escapeHtml(filesLabel)}</div>`;
      html += files.map((file) => renderFileRow(file, showPath, favorites)).join('');
    }

    const focusedPath = document.activeElement && document.activeElement.closest &&
      document.activeElement.closest('.excaliup-vault-row') &&
      document.activeElement.closest('.excaliup-vault-row').dataset.path;
    list.innerHTML = html;
    const rows = list.querySelectorAll('.excaliup-vault-row');
    const focusTarget = [...rows].find((row) => row.dataset.path === focusedPath);
    if (rows.length) (focusTarget || rows[0]).tabIndex = 0;
    if (focusTarget) focusTarget.focus();
  }

  // --- Popover & modals ---

  let activeVaultModal = null;
  let activeVaultPopover = null;

  function closeActiveVaultPopover(restoreFocus = false) {
    if (!activeVaultPopover) return;
    const anchor = activeVaultPopover.anchor;
    activeVaultPopover.remove();
    activeVaultPopover = null;
    if (restoreFocus && anchor && anchor.isConnected) anchor.focus();
  }

  document.addEventListener('pointerdown', (e) => {
    if (
      activeVaultPopover &&
      !e.target.closest('.excaliup-vault-popover') &&
      !e.target.closest('.excaliup-vault-row-menu')
    ) {
      closeActiveVaultPopover();
    }
  }, true);

  function showVaultActionPopover(anchorElement, kind, path) {
    closeActiveVaultPopover();
    const container = document.querySelector('.excalidraw') || document.body;
    const items = kind === 'folder'
      ? [
        { action: 'open', icon: 'lucide:folder-open', label: 'Open folder' },
        { action: 'delete', icon: 'lucide:trash-2', label: 'Delete folder', danger: true }
      ]
      : [
        { action: 'open', icon: 'lucide:square-arrow-out-up-right', label: 'Open', hint: 'Enter' },
        { action: 'rename', icon: 'lucide:pencil', label: 'Rename', hint: 'F2' },
        { action: 'move', icon: 'lucide:folder-input', label: 'Move to…' },
        { action: 'duplicate', icon: 'lucide:copy', label: 'Duplicate' },
        { separator: true },
        { action: 'delete', icon: 'lucide:trash-2', label: 'Delete', hint: 'Del', danger: true }
      ];

    const popover = document.createElement('div');
    popover.className = 'excaliup-vault-popover';
    popover.setAttribute('role', 'menu');
    popover.innerHTML = items.map((item) => item.separator
      ? '<div class="excaliup-vault-popover-sep" role="separator"></div>'
      : `<button type="button" role="menuitem" class="excaliup-vault-popover-item${item.danger ? ' is-danger' : ''}" data-popover-action="${item.action}">
          <iconify-icon icon="${item.icon}" aria-hidden="true"></iconify-icon>
          <span>${escapeHtml(item.label)}</span>
          ${item.hint ? `<kbd>${escapeHtml(item.hint)}</kbd>` : ''}
        </button>`).join('');

    popover.addEventListener('click', (e) => {
      const button = e.target.closest('[data-popover-action]');
      if (!button) return;
      e.stopPropagation();
      closeActiveVaultPopover();
      runVaultRowAction(button.dataset.popoverAction, kind, path);
    });
    popover.addEventListener('keydown', (e) => {
      const buttons = [...popover.querySelectorAll('[data-popover-action]')];
      const index = buttons.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = e.key === 'ArrowDown' ? index + 1 : index - 1;
        buttons[(next + buttons.length) % buttons.length].focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        closeActiveVaultPopover(true);
      }
      e.stopPropagation();
    });

    popover.anchor = anchorElement;
    popover.style.visibility = 'hidden';
    container.appendChild(popover);
    const rect = anchorElement.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const below = rect.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.visibility = '';
    activeVaultPopover = popover;
    const first = popover.querySelector('[data-popover-action]');
    if (first) first.focus();
  }

  function closeActiveVaultModal() {
    if (!activeVaultModal) return;
    const { overlay, returnFocus } = activeVaultModal;
    overlay.remove();
    activeVaultModal = null;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }

  // One modal for prompts, pickers and confirmations. `validate` may be async
  // and returns an error message (kept inline) or an empty string.
  function openVaultModal({
    icon = 'lucide:file-pen-line',
    tone = 'default',
    title,
    description = '',
    fields = [],
    confirmText = 'Confirm',
    validate,
    onConfirm
  }) {
    closeActiveVaultModal();
    closeActiveVaultPopover();
    const container = document.querySelector('.excalidraw') || document.body;
    const overlay = document.createElement('div');
    overlay.className = 'excaliup-vault-modal-overlay';
    const titleId = `excaliup-vault-modal-title-${Date.now()}`;

    const fieldsHtml = fields.map((field) => {
      const id = `excaliup-vault-field-${field.id}`;
      const control = field.type === 'select'
        ? `<select class="excaliup-vault-input" id="${id}" data-field="${field.id}">
            ${(field.options || []).map((option) => `<option value="${escapeHtml(option.value)}"${option.selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
          </select>`
        : `<input type="text" class="excaliup-vault-input" id="${id}" data-field="${field.id}" value="${escapeHtml(field.value || '')}" placeholder="${escapeHtml(field.placeholder || '')}" autocomplete="off" spellcheck="false">`;
      return `<label class="excaliup-vault-field" for="${id}"><span>${escapeHtml(field.label)}</span>${control}</label>`;
    }).join('');

    overlay.innerHTML = `
      <div class="excaliup-vault-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}" data-tone="${tone}">
        <div class="excaliup-vault-modal-header">
          <span class="excaliup-vault-modal-icon" aria-hidden="true"><iconify-icon icon="${icon}"></iconify-icon></span>
          <div>
            <div class="excaliup-vault-modal-title" id="${titleId}">${escapeHtml(title)}</div>
            ${description ? `<div class="excaliup-vault-modal-desc">${escapeHtml(description)}</div>` : ''}
          </div>
        </div>
        ${fieldsHtml ? `<div class="excaliup-vault-modal-fields">${fieldsHtml}</div>` : ''}
        <div class="excaliup-vault-modal-error" role="alert" hidden></div>
        <div class="excaliup-vault-modal-actions">
          <button type="button" class="excaliup-vault-button" data-modal-action="cancel">Cancel</button>
          <button type="button" class="excaliup-vault-button ${tone === 'danger' ? 'is-danger' : 'is-primary'}" data-modal-action="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    const errorElement = overlay.querySelector('.excaliup-vault-modal-error');
    const confirmButton = overlay.querySelector('[data-modal-action="confirm"]');
    const controls = [...overlay.querySelectorAll('[data-field]')];
    let busy = false;

    const readValues = () => Object.fromEntries(controls.map((control) => [
      control.dataset.field,
      control.tagName === 'INPUT' ? control.value.trim() : control.value
    ]));

    const confirm = async () => {
      if (busy) return;
      busy = true;
      confirmButton.disabled = true;
      try {
        const values = readValues();
        const error = validate ? await validate(values) : '';
        if (error) {
          errorElement.textContent = error;
          errorElement.hidden = false;
          const firstInput = controls.find((control) => control.tagName === 'INPUT');
          if (firstInput) firstInput.focus();
          return;
        }
        closeActiveVaultModal();
        await onConfirm(values);
      } finally {
        busy = false;
        confirmButton.disabled = false;
      }
    };

    overlay.addEventListener('click', (e) => {
      const action = e.target.closest('[data-modal-action]');
      if (action) {
        if (action.dataset.modalAction === 'confirm') confirm();
        else closeActiveVaultModal();
      } else if (e.target === overlay) {
        closeActiveVaultModal();
      }
    });
    overlay.addEventListener('input', () => {
      errorElement.hidden = true;
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeActiveVaultModal();
      } else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        confirm();
      } else if (e.key === 'Tab') {
        // Keep focus inside the dialog.
        const focusable = [...overlay.querySelectorAll('input, select, button:not(:disabled)')];
        const index = focusable.indexOf(document.activeElement);
        const next = e.shiftKey ? index - 1 : index + 1;
        if (next < 0 || next >= focusable.length) {
          e.preventDefault();
          focusable[(next + focusable.length) % focusable.length].focus();
        }
      }
      // Never let Excalidraw shortcuts fire while typing in the dialog.
      e.stopPropagation();
    });

    activeVaultModal = { overlay, returnFocus: document.activeElement };
    container.appendChild(overlay);
    const firstInput = controls.find((control) => control.tagName === 'INPUT') || controls[0];
    if (firstInput) {
      firstInput.focus();
      if (firstInput.select) firstInput.select();
    } else {
      confirmButton.focus();
    }
  }

  // --- Drawer interactions ---

  function runVaultRowAction(action, kind, path) {
    if (kind === 'folder') {
      if (action === 'open') {
        currentVaultRelativePath = path;
        vaultSearchQuery = '';
        const search = document.getElementById('excaliup-vault-search');
        if (search) search.value = '';
        vaultCurrentView = 'all';
        refreshVaultListing(true).then(() => focusFirstVaultRow());
      } else if (action === 'delete') {
        deleteVaultFolderWithConfirm(path);
      }
      return;
    }
    switch (action) {
      case 'open': openVaultDrawing(path); break;
      case 'rename': renameVaultDrawing(path); break;
      case 'move': showVaultMoveModal(path); break;
      case 'duplicate': duplicateVaultDrawing(path); break;
      case 'delete': deleteVaultDrawing(path); break;
      case 'star': toggleVaultFavorite(path); break;
    }
  }

  function focusFirstVaultRow() {
    const row = vaultDrawerElement && vaultDrawerElement.querySelector('.excaliup-vault-row');
    if (row) row.focus();
  }

  function onVaultDrawerClick(e) {
    const target = e.target;
    const actionButton = target.closest('[data-vault-action]');
    const row = target.closest('.excaliup-vault-row');

    if (actionButton) {
      const action = actionButton.dataset.vaultAction;
      e.stopPropagation();
      if (row && action === 'menu') {
        showVaultActionPopover(actionButton, row.dataset.kind, row.dataset.path);
      } else if (row && action === 'star') {
        toggleVaultFavorite(row.dataset.path);
      } else {
        runVaultDrawerAction(action);
      }
      return;
    }

    const crumb = target.closest('[data-vault-crumb]');
    if (crumb) {
      currentVaultRelativePath = crumb.dataset.vaultCrumb;
      refreshVaultListing(true);
      return;
    }

    const tab = target.closest('[data-vault-tab]');
    if (tab) {
      vaultCurrentView = tab.dataset.vaultTab;
      renderVaultDrawer();
      return;
    }

    if (row) runVaultRowAction('open', row.dataset.kind, row.dataset.path);
  }

  function runVaultDrawerAction(action) {
    switch (action) {
      case 'close': closeVaultDrawer(); break;
      case 'refresh': refreshVaultListing(true); break;
      case 'connect':
      case 'change-folder': connectLocalVaultFolder(); break;
      case 'reconnect': requestVaultPermission(); break;
      case 'retry-save': saveVaultNow(true); break;
      case 'new-drawing': createNewVaultDrawing(); break;
      case 'new-folder': createNewVaultSubfolder(); break;
      case 'clear-search': {
        const search = document.getElementById('excaliup-vault-search');
        if (search) {
          search.value = '';
          search.focus();
        }
        vaultSearchQuery = '';
        vaultDrawerElement.classList.remove('has-query');
        renderVaultBreadcrumbs();
        renderVaultItems();
        break;
      }
    }
  }

  function onVaultDrawerKeyDown(e) {
    const row = e.target.closest && e.target.closest('.excaliup-vault-row');
    const isTyping = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

    if (e.key === 'Escape') {
      e.preventDefault();
      if (isTyping && e.target.value) {
        runVaultDrawerAction('clear-search');
      } else {
        closeVaultDrawer();
      }
    } else if (e.key === 'ArrowDown' && e.target.id === 'excaliup-vault-search') {
      e.preventDefault();
      focusFirstVaultRow();
    } else if (row && !isTyping) {
      const rows = [...vaultDrawerElement.querySelectorAll('.excaliup-vault-row')];
      const index = rows.indexOf(row);
      const kind = row.dataset.kind;
      const path = row.dataset.path;
      let handled = true;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const next = rows[index + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) {
          row.tabIndex = -1;
          next.tabIndex = 0;
          next.focus();
        } else if (e.key === 'ArrowUp') {
          const search = document.getElementById('excaliup-vault-search');
          if (search) search.focus();
        }
      } else if (e.key === 'Home' || e.key === 'End') {
        const next = e.key === 'Home' ? rows[0] : rows[rows.length - 1];
        if (next) next.focus();
      } else if (e.key === 'Enter' && e.target === row) {
        runVaultRowAction('open', kind, path);
      } else if (e.key === 'F2' && kind === 'file') {
        renameVaultDrawing(path);
      } else if (e.key === 'Delete') {
        runVaultRowAction('delete', kind, path);
      } else if ((e.key === 'Backspace' || e.key === 'ArrowLeft') && currentVaultRelativePath && vaultCurrentView === 'all') {
        currentVaultRelativePath = getParentFolder(currentVaultRelativePath);
        refreshVaultListing(true).then(() => focusFirstVaultRow());
      } else if (e.key === 'ArrowRight' && kind === 'folder') {
        runVaultRowAction('open', kind, path);
      } else if ((e.key === 's' || e.key === 'S') && kind === 'file' && !e.ctrlKey && !e.metaKey) {
        toggleVaultFavorite(path);
      } else {
        handled = false;
      }
      if (handled) e.preventDefault();
    }
    // Keep Excalidraw's canvas shortcuts (tools, delete, undo…) out of the drawer.
    e.stopPropagation();
  }

  function setupVaultDragAndDrop(drawer) {
    let dragSourcePath = null;
    const getDropTarget = (e) => e.target.closest && e.target.closest('[data-drop-folder]');

    drawer.addEventListener('dragstart', (e) => {
      const row = e.target.closest && e.target.closest('.excaliup-vault-row.is-file');
      if (!row) return;
      dragSourcePath = row.dataset.path;
      e.dataTransfer.setData('application/x-excaliup-vault-path', dragSourcePath);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
    });
    drawer.addEventListener('dragend', (e) => {
      dragSourcePath = null;
      const row = e.target.closest && e.target.closest('.excaliup-vault-row');
      if (row) row.classList.remove('is-dragging');
      for (const element of drawer.querySelectorAll('.is-drop-target')) element.classList.remove('is-drop-target');
    });
    drawer.addEventListener('dragover', (e) => {
      const target = getDropTarget(e);
      if (!dragSourcePath || !target) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!target.classList.contains('is-drop-target')) {
        for (const element of drawer.querySelectorAll('.is-drop-target')) element.classList.remove('is-drop-target');
        target.classList.add('is-drop-target');
      }
    });
    drawer.addEventListener('dragleave', (e) => {
      const target = getDropTarget(e);
      if (target && !target.contains(e.relatedTarget)) target.classList.remove('is-drop-target');
    });
    drawer.addEventListener('drop', (e) => {
      const target = getDropTarget(e);
      if (!dragSourcePath || !target) return;
      e.preventDefault();
      target.classList.remove('is-drop-target');
      moveVaultDrawing(dragSourcePath, target.dataset.dropFolder);
      dragSourcePath = null;
    });
  }

  function mountVaultButton() {
    if (!vaultStatusButton) return;
    const mainMenuTrigger = document.querySelector('[data-testid="main-menu-trigger"], .main-menu-trigger, .dropdown-menu-button');
    if (mainMenuTrigger && mainMenuTrigger.parentElement) {
      if (vaultStatusButton.previousElementSibling !== mainMenuTrigger) {
        mainMenuTrigger.after(vaultStatusButton);
      }
      // The trigger is a block-level flex box, so dock the launcher to its
      // right instead of letting it wrap onto a new line.
      vaultStatusButton.classList.add('is-docked');
      vaultStatusButton.style.left = `${mainMenuTrigger.offsetLeft + mainMenuTrigger.offsetWidth + 8}px`;
      vaultStatusButton.style.top = `${mainMenuTrigger.offsetTop}px`;
      vaultStatusButton.style.height = `${mainMenuTrigger.offsetHeight || 36}px`;
    } else {
      vaultStatusButton.classList.remove('is-docked');
      vaultStatusButton.style.left = '';
      vaultStatusButton.style.top = '';
      vaultStatusButton.style.height = '';
      const excalidraw = document.querySelector('.excalidraw');
      if (excalidraw && !document.body.contains(vaultStatusButton)) {
        excalidraw.appendChild(vaultStatusButton);
      }
    }
  }

  function createVaultUI() {
    const excalidraw = document.querySelector('.excalidraw');
    if (!excalidraw) return;
    if (document.getElementById('excaliup-vault-btn')) return;

    injectVaultStyles();

    vaultStatusButton = document.createElement('button');
    vaultStatusButton.type = 'button';
    vaultStatusButton.id = 'excaliup-vault-btn';
    vaultStatusButton.className = 'excaliup-vault-btn';
    vaultStatusButton.setAttribute('aria-controls', 'excaliup-vault-drawer');
    vaultStatusButton.setAttribute('aria-expanded', 'false');
    vaultStatusButton.addEventListener('click', () => {
      if (vaultSyncState === 'permission-required' && rootVaultHandle) {
        requestVaultPermission().then(() => {
          if (isVaultConnected()) openVaultDrawer();
        });
      } else {
        toggleVaultDrawer();
      }
    });
    vaultButtonSignature = '';
    mountVaultButton();

    vaultDrawerElement = document.createElement('aside');
    vaultDrawerElement.id = 'excaliup-vault-drawer';
    vaultDrawerElement.className = 'excaliup-vault-drawer';
    vaultDrawerElement.setAttribute('aria-label', 'Local vault');
    vaultDrawerElement.setAttribute('aria-hidden', 'true');
    vaultDrawerElement.inert = true;
    vaultDrawerElement.innerHTML = `
      <header class="excaliup-vault-header">
        <div class="excaliup-vault-title">
          <iconify-icon icon="lucide:hard-drive" aria-hidden="true"></iconify-icon>
          <span>Local Vault</span>
        </div>
        <div class="excaliup-vault-header-actions">
          <button type="button" class="excaliup-vault-icon-btn" data-vault-action="refresh" title="Rescan folder" aria-label="Rescan folder">
            <iconify-icon icon="lucide:refresh-cw" aria-hidden="true"></iconify-icon>
          </button>
          <button type="button" class="excaliup-vault-icon-btn" data-vault-action="close" title="Close (Esc)" aria-label="Close vault">
            <iconify-icon icon="lucide:x" aria-hidden="true"></iconify-icon>
          </button>
        </div>
      </header>

      <section class="excaliup-vault-status" id="excaliup-vault-status" hidden></section>

      <div class="excaliup-vault-controls">
        <div class="excaliup-vault-search">
          <iconify-icon icon="lucide:search" aria-hidden="true"></iconify-icon>
          <input type="text" id="excaliup-vault-search" placeholder="Search all drawings" aria-label="Search drawings" autocomplete="off" spellcheck="false">
          <button type="button" class="excaliup-vault-search-clear" data-vault-action="clear-search" aria-label="Clear search" title="Clear">
            <iconify-icon icon="lucide:x" aria-hidden="true"></iconify-icon>
          </button>
        </div>
        <div class="excaliup-vault-actions">
          <button type="button" class="excaliup-vault-button is-primary" data-vault-action="new-drawing">
            <iconify-icon icon="lucide:plus" aria-hidden="true"></iconify-icon><span>New drawing</span>
          </button>
          <button type="button" class="excaliup-vault-button" data-vault-action="new-folder" title="New folder">
            <iconify-icon icon="lucide:folder-plus" aria-hidden="true"></iconify-icon><span>Folder</span>
          </button>
        </div>
        <div class="excaliup-vault-tabs" role="tablist" aria-label="Filter drawings">
          <button type="button" role="tab" data-vault-tab="all">All <span class="excaliup-vault-count" id="excaliup-vault-count-all">0</span></button>
          <button type="button" role="tab" data-vault-tab="favorites">Starred <span class="excaliup-vault-count" id="excaliup-vault-count-favorites">0</span></button>
          <button type="button" role="tab" data-vault-tab="recent">Recent</button>
        </div>
      </div>

      <nav class="excaliup-vault-crumbs" id="excaliup-vault-breadcrumbs" aria-label="Folder path" hidden></nav>
      <div class="excaliup-vault-list" id="excaliup-vault-list" role="list" aria-label="Drawings"></div>

      <footer class="excaliup-vault-footer">
        <span id="excaliup-vault-footer-info"></span>
        <span class="excaliup-vault-hint"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>F2</kbd> rename · <kbd>S</kbd> star</span>
      </footer>
    `;
    excalidraw.appendChild(vaultDrawerElement);

    vaultDrawerElement.addEventListener('click', onVaultDrawerClick);
    vaultDrawerElement.addEventListener('keydown', onVaultDrawerKeyDown);
    setupVaultDragAndDrop(vaultDrawerElement);

    const searchInput = vaultDrawerElement.querySelector('#excaliup-vault-search');
    searchInput.addEventListener('input', (e) => {
      vaultSearchQuery = e.target.value;
      vaultDrawerElement.classList.toggle('has-query', !!vaultSearchQuery);
      renderVaultBreadcrumbs();
      renderVaultItems();
    });

    renderVaultDrawer();
    attachVaultChangeListener();

    Core.getStoredVaultHandle().then(async (handle) => {
      if (!handle) {
        setVaultSyncState('unlinked');
        renderVaultDrawer();
        return;
      }
      rootVaultHandle = handle;
      const granted = await Core.verifyHandlePermission(handle, true);
      if (!granted) {
        setVaultSyncState('permission-required');
        renderVaultDrawer();
        return;
      }
      vaultMetadata = await Core.readVaultMetadata(handle);
      setVaultSyncState('synced');
      await restoreActiveDrawing();
      updateVaultButtonState();
      if (isVaultDrawerOpen) refreshVaultListing(true);
    }).catch((error) => {
      console.warn('[Excali Up] Could not restore the vault:', error);
      setVaultSyncState('unlinked');
      renderVaultDrawer();
    });
  }

  function removeVaultUI() {
    flushVaultOnExit();
    detachVaultChangeListener();
    closeActiveVaultPopover();
    closeActiveVaultModal();
    if (vaultStatusTimer) {
      clearInterval(vaultStatusTimer);
      vaultStatusTimer = null;
    }
    if (vaultStatusButton) {
      vaultStatusButton.remove();
      vaultStatusButton = null;
    }
    if (vaultDrawerElement) {
      vaultDrawerElement.remove();
      vaultDrawerElement = null;
    }
    const styles = document.getElementById('excaliup-vault-styles');
    if (styles) styles.remove();
    isVaultDrawerOpen = false;
  }

  function toggleVaultDrawer() {
    if (!vaultDrawerElement) return;
    if (isVaultDrawerOpen) {
      closeVaultDrawer();
    } else {
      openVaultDrawer();
    }
  }

  function openVaultDrawer() {
    if (!vaultDrawerElement) return;
    vaultDrawerReturnFocus = document.activeElement;
    vaultDrawerElement.classList.add('open');
    vaultDrawerElement.setAttribute('aria-hidden', 'false');
    vaultDrawerElement.inert = false;
    isVaultDrawerOpen = true;
    if (vaultStatusButton) {
      vaultStatusButton.classList.add('is-open');
      vaultStatusButton.setAttribute('aria-expanded', 'true');
    }
    renderVaultDrawer();
    refreshVaultListing(true);
    if (!vaultStatusTimer) vaultStatusTimer = setInterval(renderVaultStatusCard, 30000);

    setTimeout(() => {
      if (!isVaultDrawerOpen || !vaultDrawerElement) return;
      const target = isVaultConnected()
        ? vaultDrawerElement.querySelector('#excaliup-vault-search')
        : vaultDrawerElement.querySelector('.excaliup-vault-empty [data-vault-action]');
      if (target) target.focus();
    }, 50);
  }

  function closeVaultDrawer() {
    if (!vaultDrawerElement) return;
    const hadFocus = vaultDrawerElement.contains(document.activeElement);
    vaultDrawerElement.classList.remove('open');
    vaultDrawerElement.setAttribute('aria-hidden', 'true');
    vaultDrawerElement.inert = true;
    isVaultDrawerOpen = false;
    closeActiveVaultPopover();
    if (vaultStatusTimer) {
      clearInterval(vaultStatusTimer);
      vaultStatusTimer = null;
    }
    if (vaultStatusButton) {
      vaultStatusButton.classList.remove('is-open');
      vaultStatusButton.setAttribute('aria-expanded', 'false');
    }
    const returnTarget = vaultDrawerReturnFocus && vaultDrawerReturnFocus.isConnected
      ? vaultDrawerReturnFocus
      : vaultStatusButton;
    vaultDrawerReturnFocus = null;
    if (returnTarget && hadFocus) returnTarget.focus();
  }

  checkInstance();
})();
