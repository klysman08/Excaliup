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
    animatedSvgsEnabled: true,
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
      animatedSvgsEnabled: typeof source.animatedSvgsEnabled === 'boolean'
        ? source.animatedSvgsEnabled
        : base.animatedSvgsEnabled !== false,
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

  function isAnimatedSvgMarkup(value) {
    if (typeof value !== 'string' || !/<svg\b/i.test(value)) return false;
    return (
      /<animate(?:Motion|Transform)?\b/i.test(value) ||
      /@keyframes\s+[\w-]+/i.test(value) ||
      /(?:^|[;{])\s*animation(?:-name)?\s*:/i.test(value)
    );
  }

  function sizeSvgForCanvas(markup, maxSize = 96) {
    if (typeof markup !== 'string') return markup;
    const targetSize = Math.max(16, Math.round(finiteNumber(maxSize, 96)));
    return markup.replace(/<svg\b([^>]*)>/i, (svgTag, attributes) => {
      const viewBoxMatch = attributes.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
      let width = targetSize;
      let height = targetSize;

      if (viewBoxMatch) {
        const values = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
        const viewBoxWidth = values[2];
        const viewBoxHeight = values[3];
        if (values.length === 4 && viewBoxWidth > 0 && viewBoxHeight > 0) {
          if (viewBoxWidth >= viewBoxHeight) {
            height = Math.max(1, Math.round(targetSize * viewBoxHeight / viewBoxWidth));
          } else {
            width = Math.max(1, Math.round(targetSize * viewBoxWidth / viewBoxHeight));
          }
        }
      }

      const resizedAttributes = attributes.replace(
        /\s+(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
        ''
      );
      return `<svg${resizedAttributes} width="${width}" height="${height}">`;
    });
  }

  function getSvgIntrinsicSize(markup, fallbackSize = 96) {
    const fallback = Math.max(16, Math.round(finiteNumber(fallbackSize, 96)));
    if (typeof markup !== 'string') return { width: fallback, height: fallback };
    const rootMatch = markup.match(/<svg\b([^>]*)>/i);
    if (!rootMatch) return { width: fallback, height: fallback };
    const attributes = rootMatch[1];
    const readLength = (name) => {
      const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([0-9.]+)(?:px)?["']`, 'i'));
      const value = match ? Number(match[1]) : NaN;
      return Number.isFinite(value) && value > 0 ? value : null;
    };
    let width = readLength('width');
    let height = readLength('height');
    const viewBoxMatch = attributes.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
    const values = viewBoxMatch ? viewBoxMatch[1].trim().split(/[\s,]+/).map(Number) : [];
    const viewBoxWidth = values.length === 4 && values[2] > 0 ? values[2] : null;
    const viewBoxHeight = values.length === 4 && values[3] > 0 ? values[3] : null;

    if (!width && height && viewBoxWidth && viewBoxHeight) width = height * viewBoxWidth / viewBoxHeight;
    if (!height && width && viewBoxWidth && viewBoxHeight) height = width * viewBoxHeight / viewBoxWidth;
    if (!width || !height) {
      width = fallback;
      height = fallback;
      if (viewBoxWidth && viewBoxHeight) {
        if (viewBoxWidth >= viewBoxHeight) {
          height = Math.max(1, fallback * viewBoxHeight / viewBoxWidth);
        } else {
          width = Math.max(1, fallback * viewBoxWidth / viewBoxHeight);
        }
      }
    }

    return { width: Math.round(width), height: Math.round(height) };
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

  // --- Local Vault & Persistence Engine ---

  const VAULT_DB_NAME = 'excaliup_vault_db';
  const VAULT_STORE_NAME = 'handles';
  const ROOT_HANDLE_KEY = 'root_vault_directory';
  const VAULT_METADATA_FILENAME = '.excaliup.json';

  const DEFAULT_VAULT_METADATA = Object.freeze({
    version: 1,
    favorites: [],
    lastOpenedFile: null,
    activeFilter: 'all'
  });

  function openVaultDatabase() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(VAULT_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
          db.createObjectStore(VAULT_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getStoredVaultHandle() {
    const db = await openVaultDatabase();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE_NAME, 'readonly');
      const store = tx.objectStore(VAULT_STORE_NAME);
      const req = store.get(ROOT_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function setStoredVaultHandle(handle) {
    const db = await openVaultDatabase();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VAULT_STORE_NAME);
      const req = store.put(handle, ROOT_HANDLE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function clearStoredVaultHandle() {
    const db = await openVaultDatabase();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VAULT_STORE_NAME);
      const req = store.delete(ROOT_HANDLE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function verifyHandlePermission(handle, readWrite = true) {
    if (!handle) return false;
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    if (typeof handle.queryPermission !== 'function') return true;
    try {
      const permission = await handle.queryPermission(options);
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  async function requestHandlePermission(handle, readWrite = true) {
    if (!handle) return false;
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    if (typeof handle.requestPermission !== 'function') return true;
    try {
      const permission = await handle.requestPermission(options);
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  function sanitizeFileName(name, fallback = 'untitled') {
    if (typeof name !== 'string') return fallback;
    const clean = name.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ');
    return clean || fallback;
  }

  function normalizeVaultPath(path) {
    if (!path) return '';
    return String(path).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
  }

  async function resolveDirectoryHandle(rootHandle, relativePath = '', create = false) {
    const cleanPath = normalizeVaultPath(relativePath);
    if (!cleanPath) return rootHandle;
    const segments = cleanPath.split('/').filter(Boolean);
    let current = rootHandle;
    for (const segment of segments) {
      current = await current.getDirectoryHandle(segment, { create });
    }
    return current;
  }

  async function scanVaultDirectory(rootHandle, currentRelativePath = '') {
    if (!rootHandle) return { currentPath: '', folders: [], files: [] };
    const cleanCurrent = normalizeVaultPath(currentRelativePath);
    const targetDir = await resolveDirectoryHandle(rootHandle, cleanCurrent, false);
    const folders = [];
    const files = [];

    for await (const [name, handle] of targetDir.entries()) {
      if (name.startsWith('.')) continue;
      const itemRelPath = cleanCurrent ? `${cleanCurrent}/${name}` : name;
      if (handle.kind === 'directory') {
        folders.push({
          name,
          path: itemRelPath,
          handle
        });
      } else if (handle.kind === 'file' && (name.endsWith('.excalidraw') || name.endsWith('.excalidraw.json'))) {
        let size = 0;
        let lastModified = Date.now();
        try {
          const fileData = await handle.getFile();
          size = fileData.size;
          lastModified = fileData.lastModified;
        } catch {}
        files.push({
          name,
          path: itemRelPath,
          lastModified,
          size,
          handle
        });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    files.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

    return {
      currentPath: cleanCurrent,
      folders,
      files
    };
  }

  async function scanAllVaultDrawings(rootHandle, currentPath = '') {
    if (!rootHandle) return [];
    const cleanCurrent = normalizeVaultPath(currentPath);
    const targetDir = await resolveDirectoryHandle(rootHandle, cleanCurrent, false);
    const results = [];

    for await (const [name, handle] of targetDir.entries()) {
      if (name.startsWith('.')) continue;
      const itemPath = cleanCurrent ? `${cleanCurrent}/${name}` : name;
      if (handle.kind === 'directory') {
        const subResults = await scanAllVaultDrawings(rootHandle, itemPath);
        results.push(...subResults);
      } else if (handle.kind === 'file' && (name.endsWith('.excalidraw') || name.endsWith('.excalidraw.json'))) {
        let size = 0;
        let lastModified = Date.now();
        try {
          const fileData = await handle.getFile();
          size = fileData.size;
          lastModified = fileData.lastModified;
        } catch {}
        results.push({
          name,
          path: itemPath,
          lastModified,
          size
        });
      }
    }
    return results;
  }

  function normalizeVaultMetadata(source) {
    const data = source && typeof source === 'object' ? source : {};
    const favorites = Array.isArray(data.favorites)
      ? [...new Set(data.favorites.filter(f => typeof f === 'string').map(normalizeVaultPath))]
      : [];
    return {
      version: 1,
      favorites,
      lastOpenedFile: typeof data.lastOpenedFile === 'string' ? normalizeVaultPath(data.lastOpenedFile) : null,
      activeFilter: data.activeFilter === 'favorites' ? 'favorites' : 'all'
    };
  }

  async function readVaultMetadata(rootHandle) {
    if (!rootHandle) return normalizeVaultMetadata(null);
    try {
      const fileHandle = await rootHandle.getFileHandle(VAULT_METADATA_FILENAME);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return normalizeVaultMetadata(JSON.parse(text));
    } catch {
      return normalizeVaultMetadata(null);
    }
  }

  async function writeVaultMetadata(rootHandle, metadata) {
    if (!rootHandle) return;
    try {
      const normalized = normalizeVaultMetadata(metadata);
      const fileHandle = await rootHandle.getFileHandle(VAULT_METADATA_FILENAME, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(normalized, null, 2));
      await writable.close();
    } catch (err) {
      console.warn('[Excali Up] Failed to write vault metadata:', err);
    }
  }

  async function readDrawingFile(rootHandle, relativeFilePath) {
    const cleanPath = normalizeVaultPath(relativeFilePath);
    const segments = cleanPath.split('/');
    const fileName = segments.pop();
    const dirPath = segments.join('/');
    const dirHandle = await resolveDirectoryHandle(rootHandle, dirPath, false);
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  }

  async function writeDrawingFile(rootHandle, relativeFilePath, content) {
    const cleanPath = normalizeVaultPath(relativeFilePath);
    const segments = cleanPath.split('/');
    const fileName = segments.pop();
    const dirPath = segments.join('/');
    const dirHandle = await resolveDirectoryHandle(rootHandle, dirPath, true);
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return fileHandle;
  }

  async function deleteDrawingFile(rootHandle, relativeFilePath) {
    const cleanPath = normalizeVaultPath(relativeFilePath);
    const segments = cleanPath.split('/');
    const fileName = segments.pop();
    const dirPath = segments.join('/');
    const dirHandle = await resolveDirectoryHandle(rootHandle, dirPath, false);
    await dirHandle.removeEntry(fileName);
  }

  async function scanAllVaultFolders(rootHandle, currentPath = '', depth = 0) {
    if (!rootHandle) return [];
    const cleanCurrent = normalizeVaultPath(currentPath);
    const targetDir = await resolveDirectoryHandle(rootHandle, cleanCurrent, false);
    const results = [];

    for await (const [name, handle] of targetDir.entries()) {
      if (name.startsWith('.')) continue;
      if (handle.kind === 'directory') {
        const itemPath = cleanCurrent ? `${cleanCurrent}/${name}` : name;
        results.push({
          name,
          path: itemPath,
          depth
        });
        const subResults = await scanAllVaultFolders(rootHandle, itemPath, depth + 1);
        results.push(...subResults);
      }
    }
    return results;
  }

  async function moveDrawingFile(rootHandle, sourceRelativePath, targetRelativeFolderPath) {
    const cleanSource = normalizeVaultPath(sourceRelativePath);
    const cleanTargetFolder = normalizeVaultPath(targetRelativeFolderPath);
    if (!cleanSource) throw new Error('Source path is required');

    const fileName = cleanSource.split('/').pop();
    const sourceDir = cleanSource.split('/').slice(0, -1).join('/');

    if (sourceDir === cleanTargetFolder) {
      return { success: true, newRelativePath: cleanSource, moved: false };
    }

    const targetRelativePath = cleanTargetFolder ? `${cleanTargetFolder}/${fileName}` : fileName;
    const content = await readDrawingFile(rootHandle, cleanSource);
    await writeDrawingFile(rootHandle, targetRelativePath, content);
    await deleteDrawingFile(rootHandle, cleanSource);

    return { success: true, newRelativePath: targetRelativePath, moved: true };
  }

  async function deleteVaultFolder(rootHandle, relativeFolderPath, recursive = true) {
    const cleanPath = normalizeVaultPath(relativeFolderPath);
    if (!cleanPath) throw new Error('Cannot delete vault root directory');

    const segments = cleanPath.split('/');
    const folderName = segments.pop();
    const parentPath = segments.join('/');
    const parentDirHandle = await resolveDirectoryHandle(rootHandle, parentPath, false);
    await parentDirHandle.removeEntry(folderName, { recursive: !!recursive });
  }

  async function createVaultSubfolder(rootHandle, relativePath) {
    const cleanPath = normalizeVaultPath(relativePath);
    if (!cleanPath) return null;
    return await resolveDirectoryHandle(rootHandle, cleanPath, true);
  }

  function serializeExcalidrawScene({ elements = [], appState = {}, files = {} }) {
    const cleanElements = Array.isArray(elements) ? elements : [];
    const cleanAppState = {
      viewBackgroundColor: (appState && appState.viewBackgroundColor) || '#ffffff',
      gridSize: (appState && appState.gridSize) || null,
      name: (appState && appState.name) || 'Untitled'
    };

    const cleanFiles = {};
    if (files && typeof files === 'object') {
      for (const [id, f] of Object.entries(files)) {
        if (f && f.dataURL) {
          cleanFiles[id] = {
            id: f.id || id,
            dataURL: f.dataURL,
            mimeType: f.mimeType,
            created: f.created || Date.now(),
            lastRetrieved: f.lastRetrieved || Date.now()
          };
        }
      }
    }

    return JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'https://excalidraw.com',
      elements: cleanElements,
      appState: cleanAppState,
      files: cleanFiles
    }, null, 2);
  }

  function parseExcalidrawScene(rawContent) {
    if (!rawContent) return null;
    try {
      const data = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
      if (!data || typeof data !== 'object') return null;
      return {
        elements: Array.isArray(data.elements) ? data.elements : [],
        appState: data.appState && typeof data.appState === 'object' ? data.appState : {},
        files: data.files && typeof data.files === 'object' ? data.files : {}
      };
    } catch (err) {
      console.error('[Excali Up] Failed to parse excalidraw file:', err);
      return null;
    }
  }

  return Object.freeze({
    DEFAULT_SETTINGS,
    DEFAULT_ELEMENT_CONFIG,
    DEFAULT_VAULT_METADATA,
    normalizeSettings,
    normalizeElementConfig,
    getPathPoints,
    getPathGeometry,
    getPointAtLength,
    getElementOffset,
    getViewportBounds,
    intersectsBounds,
    buildGifRefreshElements,
    isAnimatedSvgMarkup,
    sizeSvgForCanvas,
    getSvgIntrinsicSize,
    AdaptiveFrameBudget,
    // Vault & Storage APIs
    openVaultDatabase,
    getStoredVaultHandle,
    setStoredVaultHandle,
    clearStoredVaultHandle,
    verifyHandlePermission,
    requestHandlePermission,
    sanitizeFileName,
    normalizeVaultPath,
    resolveDirectoryHandle,
    scanVaultDirectory,
    scanAllVaultDrawings,
    scanAllVaultFolders,
    normalizeVaultMetadata,
    readVaultMetadata,
    writeVaultMetadata,
    readDrawingFile,
    writeDrawingFile,
    deleteDrawingFile,
    moveDrawingFile,
    createVaultSubfolder,
    deleteVaultFolder,
    serializeExcalidrawScene,
    parseExcalidrawScene
  });
});
