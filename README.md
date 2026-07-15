# Excali Up

> **Per-Element Animated GIF, Custom Motion Flows, and the Iconify Library for Excalidraw**

**Excali Up** is a feature-rich browser extension that brings your Excalidraw canvas to life. It provides full real-time playback for animated GIF files, a selective in-canvas floating toolbar that lets you choose exactly which lines or arrows to animate, and an Iconify-powered sidebar for browsing hundreds of open-source icon packs.

---

## Features

### 1. Complete Iconify Library Integration (New in v3.0)
Search and browse Iconify's open-source icon sets directly inside Excalidraw via a dedicated, glassmorphic toggle sidebar panel:
* **All available packs**: Browse more than 200 collections, including Material, Lucide, Tabler, Phosphor, Font Awesome, logos, emoji, and thematic sets.
* **Library filters**: Narrow packs by collection category and tags such as animated, stroke, precise shapes, and padding.
* **Animated SVG category**: Browse Iconify's animated collections separately and insert their native SVG animations onto the canvas.
* **Pagination system**: Renders 96 items per page to prevent browser rendering bottlenecks and keep canvas performance high.
* **Clean SVG click-to-copy**: Copying an icon fetches its clean vector SVG directly, automatically converting hardcoded fills to current colors for theme compatibility, and pastes it onto the active canvas.
* **Drag-and-drop support**: Drag any icon directly from the sidebar grid and drop it exactly at your cursor position on the Excalidraw canvas.
* **Global search**: Search across more than 300,000 icons, or search within one selected pack.
* **Dynamic theme matching**: The sidebar automatically transitions between light and dark modes to synchronize with Excalidraw's theme state.

### 2. In-Canvas Tuning Toolbar
Select any arrow or line element on the canvas to reveal the Excali Up floating toolbar. Assign, toggle, or tune flow parameters on the fly without leaving your canvas:
* **Opt-in per element**: Animations only apply to elements you explicitly choose.
* **Independent tuning**: Different lines can have different styles, directions, and speeds simultaneously.
* **Collapsible tuning panel**: Click the gear icon to reveal slider and pill controls.

### 3. Ten Beautiful Motion Styles
* **Particles**: Smooth dot flows traveling along paths.
* **Marching Ants**: Stylized dashed borders in motion.
* **Gradient Pulse**: Premium glowing gradient sweeps that flow like liquid neon energy.
* **Ripple Wave**: Concentric expanding ripple rings radiating down the paths.
* **Packet Train**: Oriented chevron-shaped data packets flowing in sequence.
* **Snake Trail**: Tapered trails that slither and fade along paths.
* **Comet**: Bright flowing heads with smooth, fading tails.
* **Electricity**: Jagged energy bolts that race along the path.
* **Wave**: A traveling sine wave that follows straight and curved elements.
* **Dual Flow**: Two offset particle lanes moving in opposite directions.

### 4. Granular Element Tuning
* **Direction**: Forward, Reverse, or Bounce (ping-pong animation).
* **Speed**: slow, medium, or fast motion factors.
* **Element Size**: Scale range from 1 to 5.
* **Spacing**: Gap distance between flow elements from 20px to 120px.
* **Glow Intensity**: Bloom levels (None, Subtle, Med, Strong).

### 5. Real-time GIF and Animated SVG Playback
* Drag and drop any GIF file to watch it render loops on the board.
* Insert an animated Iconify SVG and keep its native SMIL or CSS animation playing on the Excalidraw canvas.
* Control playback speed multipliers (0.5x, 1x, 1.5x, 2x) from the extension popup dashboard.

---

## Installation

1. **Download the source code**: Clone this repository or extract it from a ZIP.
2. **Open Extensions Page**: In Google Chrome, navigate to `chrome://extensions/`.
3. **Enable Developer Mode**: Toggle the Developer mode switch in the top-right corner.
4. **Load Unpacked**: Click Load unpacked and select this directory.
5. **Start Sketching**: Go to excalidraw.com and draw some arrows or import a GIF!

---

## How It Works (Technical Details)

Excali Up injects a script into the page context (MAIN world) to access the underlying canvas and react context:

1. **React Fiber Hooking**: It traverses the DOM starting from `.excalidraw__canvas.interactive` to find its React Fiber node (`__reactFiber$...`), climbing up to locate the active Excalidraw stateNode which manages the canvas state.
2. **Image Cache Interception**: It hooks the Excalidraw `imageCache.set` method. When an image with the MIME type `image/gif` is stored, Excali Up intercepts it.
3. **Animated Media Runtime**: GIF bytes are decoded frame-by-frame with `omggif.js`. Animated SVGs run natively in isolated DOM overlays synchronized with their Excalidraw image elements, avoiding continuous scene redraws while preserving SMIL and CSS timelines.
4. **Active Canvas Swap**: The static `HTMLImageElement` in Excalidraw's cache is replaced with a single dynamic `HTMLCanvasElement` managed by the extension.
5. **Floating Toolbar & Canvas Overlay**: The extension overlays a secondary canvas aligned with the interactive canvas. Selecting an element triggers the DOM injection of the floating toolbar panel. Real-time offsets are recalculated per frame on the overlay.
6. **State Persistence**: Element settings (style, speed, size, spacing, glow, direction) are mapped to element IDs and persisted in `localStorage`. They are automatically loaded when refreshing the page. Deleted elements are cleaned up from the store.
7. **Iconify Icon Library**: A locally packaged Iconify web component renders previews, while Iconify's collection, search, and SVG APIs provide pack metadata, filtered results, and clean vectors for copy and drag operations.

---

## Showcase and Demo Page

To experience a simulator of this extension and play around with retro sound effects and pixel styles, visit the [Excali Up website](https://excaliup.astrofocus.app/).

---

## Sister Project: AstroFocus GIFs

Need a steady source of animated pixel art or sprites to add to your Excalidraw board? Check out our sister project [AstroFocus GIFs](https://gifs.astrofocus.app/) — a curated search engine and library of high-quality pixel-art animations, sprites, and transparent loops!

---

## License

This project is licensed under the MIT License.
