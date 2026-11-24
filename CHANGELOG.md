# Changelog

All notable changes to Excali Up are documented here.

## 5.8.0 — 2026-11-24

### Local Vault
- Added a Trash: deleting a drawing or folder moves its drawings to a hidden `.excaliup/trash` folder in the vault, where they can be restored or deleted forever. Other files in a deleted folder are left alone.
- Added an Archive (`.excaliup/archive`) for drawings you are done with. Archive from the row menu or with A; unarchive any time.
- Before a drawing is replaced ("Keep this version" in a conflict, or "Use this version" on a sync conflict copy), the version on disk is copied to the Trash as `Name (replaced YYYY-MM-DD HH-MM)`.
- Added sorting (last modified, oldest first, name A–Z / Z–A, largest first) and a last-edit filter (today, 7 days, 30 days, older). Both are remembered per browser.
- The vault drawer closes when you click outside it, open a drawing, or create a new one.
- Scanning the vault no longer shows an empty list when part of the folder cannot be read: unreadable folders are skipped and reported, a listing cut short (for example while a sync app renames files) is retried, and an empty vault explains why (wrong folder, only Obsidian `.excalidraw.md` notes, or read errors). Extensions are matched case-insensitively.
- Saved drawings only embed the images they use. Before, images cached from drawings opened earlier in the tab were saved too, which bloated files.

### Animated SVGs
- Animated icons keep their own timing. Sequenced icons such as `line-md:loading-twotone-loop` no longer redraw their intro forever, and chained steps (`begin="a.end"`) now run.
- Icons that animate only once play their whole sequence, hold the final frame for 1.5 s, then replay.

## 5.6.0 — 2026-10-27

### Local Vault
- Synced vault folders (Syncthing, Dropbox, ...) stay consistent across devices: the file on disk is the source of truth.
- After a reload, a drawing that changed on another device is loaded from disk instead of being overwritten by the browser's older copy.
- The last opened drawing is remembered per browser instead of in the shared `.excaliup.json`, which stops duplicates like `Name (2)` from appearing on the other device.
- Auto-save checks that the file did not change on disk before writing. The open drawing reloads by itself when another device changes it.
- When a drawing changed both here and on disk, a dialog offers to use the disk version, keep this version, or keep both.
- A drawing moved or deleted on another device is no longer recreated at its old location.
- Syncthing conflict copies are badged and can be resolved from the row menu.

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
