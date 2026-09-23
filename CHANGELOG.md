# Changelog

All notable changes to Excali Up are documented here.

## 5.5.0 — 2026-09-23

### Local Vault
- Redesigned the vault launcher, drawer, row menu, and dialogs with Excalidraw's own theme tokens, so they follow light and dark mode.
- Added All, Starred, and Recent views, vault-wide search, folder drawing counts, and an "Open" marker for the current drawing.
- Added keyboard navigation: arrows to move, Enter to open, F2 to rename, S to star, Delete to delete, Backspace for the parent folder, Esc to close.
- Rename and move now refuse to overwrite an existing drawing; duplicates, new drawings, and first saves pick unique names.
- Opening or creating a drawing clears undo history, so Undo can no longer bring back the previous drawing.
- After a reload, the vault re-links the scene to the last opened drawing only when they share elements.
- Auto-save now listens to Excalidraw's change events, serializes writes, and flushes pending changes before switching drawings or leaving the page.
- File and folder names are always escaped before being shown.

### Arrow and line effects
- New `excaliup-flow.js` renderer: batched drawing, halo-based glow instead of `shadowBlur`, allocation-free path sampling, zoom-based level of detail, and per-primitive viewport culling. The heaviest effects (Pulse and Comet) render 5–10x faster, and Packet, Ripple, and Ants 1.7–3x faster.
- Added a per-effect color: match the line (default), Excalidraw's palette, or any custom color. Colors are stored in the drawing.
- The motion toolbar and tuning panel now follow Excalidraw's light and dark themes.
- Removed the Snake and Electricity styles. Existing drawings using them keep animating as Comet and Wave.
- Effects respect element opacity, and ripple no longer breaks with reversed direction.
- New popup option to respect the operating system's reduced-motion setting (on by default).

### Iconify library
- Insert icons in the current stroke color (single-color packs) or with their original colors, at S (48px), M (96px), or L (160px).
- Click-to-insert works even while the search box has focus or the clipboard is unavailable.
- Notifications use Excalidraw's native toast.

### Permissions
- No new permissions or host matches.

## 5.0.0 — 2026-08-11

- Added the Local Vault: auto-save drawings to a local folder with subfolders, favorites, search, and drag-and-drop organization.
