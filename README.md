# Excali Up

[![Version](https://img.shields.io/badge/version-5.5.0-00E5FF.svg)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Excali_Up-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/kkdemmcbedpinbabaddejkdgkmabbbbm)

> **Local File System Vault with Auto-Save, Animated GIFs and SVGs, Motion Flows, and the Complete Iconify Library for Excalidraw**

**Excali Up** brings a native Local Vault auto-save file manager, animated GIF and SVG playback, per-element line and arrow motion flows, and a complete Iconify-powered icon library directly into Excalidraw.

---

## What's New in 5.5

* **Redesigned Local Vault**: A native-looking file manager that follows Excalidraw's light and dark themes, with All, Starred, and Recent views, vault-wide search, a row action menu, and full keyboard navigation.
* **Safer saving**: No more silent overwrites. Name collisions are refused or resolved with unique names, Undo can no longer restore the previous drawing after opening another one, and auto-save now reacts to real scene changes instead of polling.
* **Much faster arrow effects**: A new batched renderer without per-dot canvas blur runs the heaviest effects 5–10x faster, draws less when zoomed out, and skips off-screen parts.
* **Effect colors**: Give any animated line or arrow its own color, from Excalidraw's palette or a custom picker, or keep matching the line color.
* **Theme-aware motion toolbar**: The in-canvas toolbar and tuning panel now follow Excalidraw's light and dark modes.
* **Streamlined styles**: Eight motion styles; drawings using the retired Snake and Electricity styles keep animating as Comet and Wave.
* **Iconify insert options**: Insert icons in the current stroke color and at S, M, or L size; click-to-insert now works even while the search box has focus.
* **Reduced motion**: Flow effects freeze when your operating system asks for less motion (can be turned off in the popup).

See the full [changelog](CHANGELOG.md).

---

## Features

### 1. Local Vault & Auto-Save File Manager
Save and organize all your drawings locally on your computer using the native browser File System Access API:
* **Direct Local Storage**: Pick any local folder on your disk as your drawing vault. Drawings are saved as standard `.excalidraw` JSON files.
* **Smart Background Auto-Sync**: Debounced background saving (1.2s threshold) persists scene edits automatically without manual saves.
* **In-Canvas Status Indicator**: A vault button next to the main menu shows the open drawing and its live sync state (saved, unsaved changes, saving, reconnect needed, save failed).
* **Safe by design**: Files are never silently overwritten: renames refuse existing names, copies and new drawings get unique names, and after a reload the vault only re-links a scene that clearly belongs to the last opened drawing. Opening a drawing clears undo history so Undo can never restore the previous one.
* **File Manager Drawer** (styled with Excalidraw's own theme, light and dark):
  * **Folder Hierarchy & Breadcrumbs**: Create subfolders, navigate breadcrumbs, and organize drawings across directories.
  * **All, Starred & Recent views**: Star drawings for a unified Starred view, or jump back into the ten most recently edited ones.
  * **Search & Management**: Search every drawing in the vault, then rename, move, duplicate, or delete from the row menu.
  * **Keyboard friendly**: `↑`/`↓` to move, `Enter` to open, `F2` to rename, `S` to star, `Del` to delete, `Backspace` for the parent folder, `Esc` to close.
  * **Drag-and-Drop Relocation**: Move drawings between folders or drag onto breadcrumb ancestor links.
  * **Instant Scene Switching**: Click any drawing in the drawer to seamlessly load and switch active canvases.

### 2. Complete Iconify Library Integration
Search and browse Iconify's open-source icon sets directly inside Excalidraw via a dedicated sidebar panel:
* **All available packs**: Browse more than 200 collections, including Material, Lucide, Tabler, Phosphor, Font Awesome, logos, emoji, and thematic sets.
* **Library filters**: Narrow packs by collection category and tags such as animated, stroke, precise shapes, and padding.
* **Animated SVG category**: Browse Iconify's animated collections separately and insert their native SVG animations onto the canvas.
* **Favorite icons**: Star frequently used icons and reopen them from the persistent Favorites view.
* **Quick access**: Press `B` outside text fields to open or close the Iconify Library.
* **Pagination system**: Renders 96 items per page to prevent browser rendering bottlenecks and keep canvas performance high.
* **Click to insert**: Clicking an icon fetches its clean vector SVG and inserts it on the canvas (the SVG is also copied to the clipboard when the browser allows it).
* **Insert color**: Single-color icons take the current canvas stroke color by default (the grid previews it); choose **Original** to keep the published colors. Multicolor packs always keep their own colors.
* **Drag-and-drop support**: Drag any icon directly from the sidebar grid and drop it exactly at your cursor position on the Excalidraw canvas.
* **Canvas-ready sizing**: Pick S (48px), M (96px), or L (160px) as the largest dimension at 100% zoom; aspect ratio is preserved.
* **Global search**: Search across more than 300,000 icons, or search within one selected pack.
* **Dynamic theme matching**: The sidebar automatically transitions between light and dark modes to synchronize with Excalidraw's theme state.

### 3. In-Canvas Tuning Toolbar
Select any arrow or line element on the canvas to reveal the Excali Up floating toolbar. Assign, toggle, or tune flow parameters on the fly without leaving your canvas:
* **Opt-in per element**: Animations only apply to elements you explicitly choose.
* **Independent tuning**: Different lines can have different styles, directions, and speeds simultaneously.
* **Collapsible tuning panel**: Click the sliders or color button to reveal color, speed, direction, glow, size, and spacing controls.
* **Native look**: The toolbar uses Excalidraw's own theme, so it follows light and dark mode.

### 4. Eight Motion Styles
* **Particles**: Smooth dot flows traveling along paths.
* **Marching Ants**: Stylized dashed borders in motion.
* **Gradient Pulse**: Premium glowing gradient sweeps that flow like liquid neon energy.
* **Ripple Wave**: Concentric expanding ripple rings radiating down the paths.
* **Packet Train**: Oriented chevron-shaped data packets flowing in sequence.
* **Comet**: Bright flowing heads with smooth, fading tails.
* **Wave**: A traveling sine wave that follows straight and curved elements.
* **Dual Flow**: Two offset particle lanes moving in opposite directions.

### 5. Granular Element Tuning
* **Color**: Match the line's stroke color (default), pick one of Excalidraw's palette colors, or choose any custom color.
* **Direction**: Forward, Reverse, or Bounce (ping-pong animation).
* **Speed**: slow, medium, or fast motion factors.
* **Element Size**: Scale range from 1 to 5.
* **Spacing**: Gap distance between flow elements from 20px to 120px.
* **Glow Intensity**: Bloom levels (None, Subtle, Medium, Strong).

Drawings saved with the retired Snake and Electricity styles keep animating as Comet and Wave.

### 6. Real-time GIF and Animated SVG Playback
* Drag and drop any GIF file to watch it render loops on the board.
* Insert an animated Iconify SVG and keep its native SMIL or CSS animation playing on the Excalidraw canvas.
* Enable GIF and animated SVG playback independently from the extension popup dashboard, with GIF speed multipliers of 0.5x, 1x, 1.5x, or 2x.
* Respect your operating system's reduced-motion setting: flow effects stay visible but frozen (toggle in the popup).

---

## Installation

### Option A: Install from Chrome Web Store (Recommended)
1. Visit the [Excali Up Chrome Web Store page](https://chromewebstore.google.com/detail/kkdemmcbedpinbabaddejkdgkmabbbbm).
2. Click **Add to Chrome**.
3. Navigate to [excalidraw.com](https://excalidraw.com) and start sketching!

### Option B: Load Unpacked (Development)
1. **Download the source code**: Clone this repository (`git clone https://github.com/klysman08/ExcaliGif.git`) or download the release ZIP.
2. **Open Extensions Page**: In Google Chrome, navigate to `chrome://extensions/`.
3. **Enable Developer Mode**: Toggle the Developer mode switch in the top-right corner.
4. **Load Unpacked**: Click **Load unpacked** and select the repository root directory.
5. **Start Sketching**: Go to [excalidraw.com](https://excalidraw.com), connect your local vault folder, import GIFs, browse Iconify icons, or draw flowing animated arrows!

---

## How It Works (Technical Details)

Excali Up injects a script into the page context (MAIN world) to access the underlying canvas and react context:

1. **React Fiber Hooking**: It traverses the DOM starting from `.excalidraw__canvas.interactive` to find its React Fiber node (`__reactFiber$...`), climbing up to locate the active Excalidraw stateNode which manages the canvas state.
2. **Image Cache Interception**: It hooks the Excalidraw `imageCache.set` method to identify GIF and animated SVG image entries.
3. **Animated Media Runtime**: GIF bytes are decoded frame-by-frame with `omggif.js`. Animated SVGs run natively in isolated DOM overlays synchronized with their Excalidraw image elements, avoiding continuous scene redraws while preserving SMIL and CSS timelines.
4. **Active Canvas Swap**: The static `HTMLImageElement` in Excalidraw's cache is replaced with a single dynamic `HTMLCanvasElement` managed by the extension.
5. **Floating Toolbar & Canvas Overlay**: The extension overlays a secondary canvas aligned with the interactive canvas. Selecting an element shows the floating toolbar. Flow effects are drawn by `excaliup-flow.js`, which batches each effect into a few paths, fakes glow with translucent halo passes instead of `shadowBlur`, samples paths with an allocation-free cursor, and applies level-of-detail and viewport culling. An adaptive frame budget drops to 30 FPS and 1x resolution under sustained load.
6. **Local Vault System**: Stores directory handles in IndexedDB, serializes canvas scenes to valid `.excalidraw` schema files, and saves through Excalidraw's `onChange` subscription with debounced, serialized writes. File operations pause auto-save, never overwrite existing drawings, and clear undo history when switching drawings.
7. **State Persistence**: Element animation settings (including effect colors) are stored in each element's `customData`, so they travel with `.excalidraw` files, and are mirrored in `localStorage` together with Iconify favorites and insert preferences.
8. **Iconify Icon Library**: A locally packaged Iconify web component renders previews, while Iconify's collection, search, and SVG APIs provide pack metadata, filtered results, and clean vectors for copy and drag operations.

---

## Development

* Run the dependency-free unit tests with `node --test`.
* Build the Chrome Web Store package with `python package.py`; the zip is written to `dist/ExcaliUp-<version>-chrome-web-store.zip`.

---

## Showcase and Demo Page

To experience a simulator of this extension and play around with retro sound effects and pixel styles, visit the [Excali Up website](https://excaliup.astrofocus.app/).

## Support

Follow development on [GitHub](https://github.com/klysman08) or [buy me a coffee](https://donate.stripe.com/4gMdRa7XW6dt8Ph9KX9Ve01).

---

## Sister Project: AstroFocus GIFs

Need a steady source of animated pixel art or sprites to add to your Excalidraw board? Check out our sister project [AstroFocus GIFs](https://gifs.astrofocus.app/) — a curated search engine and library of high-quality pixel-art animations, sprites, and transparent loops!

---

## License

This project is licensed under the [MIT License](LICENSE).
