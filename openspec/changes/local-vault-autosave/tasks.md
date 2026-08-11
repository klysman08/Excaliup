## 1. Storage & Persistence Engine

- [x] 1.1 Implement IndexedDB wrapper in `excaliup-core.js` to store and retrieve `FileSystemDirectoryHandle` safely.
- [x] 1.2 Implement directory permission verification and re-authorization helper methods (`queryPermission` / `requestPermission`).
- [x] 1.3 Implement folder tree scanning utilities to list `.excalidraw` files and subdirectories recursively.
- [x] 1.4 Implement metadata storage utility for `.excaliup.json` (favorites, last active file, sort preferences).

## 2. Auto-Save & Synchronization Runtime

- [x] 2.1 Implement scene serialization helper extracting `elements`, `appState`, and `files` into compliant `.excalidraw` JSON format.
- [x] 2.2 Implement debounced auto-save coordinator (1.2s debounce) hooked into canvas update events and Excalidraw scene changes.
- [x] 2.3 Implement immediate write-flush handlers on window blur, `beforeunload`, and before drawing switches.
- [x] 2.4 Add status state machine (`unlinked`, `ready`, `saving`, `synced`, `permission-required`, `error`) broadcasting sync events.

## 3. In-Canvas Smart Button & Navigation Integration

- [x] 3.1 Create and style the `Excaliup-save` status button adjacent to the Excalidraw document title container.
- [x] 3.2 Bind status indicator visuals (icons, pulsing badges, tooltips) to the sync state machine.
- [x] 3.3 Add click handler to toggle the local vault file manager drawer.

## 4. File Manager Drawer UI & Subfolder Explorer

- [x] 4.1 Create DOM structure and CSS styles for the left slide-over file manager drawer (light/dark theme adaptive).
- [x] 4.2 Implement breadcrumb navigation header, search filter input, and view tabs (`All Files`, `Starred`).
- [x] 4.3 Implement subfolder navigation (drilling down and backing up) and inline "New Folder" creation dialog.
- [x] 4.4 Implement drawing card components with modified timestamp, file size, active drawing badge, and star favorite toggle.
- [x] 4.5 Implement file action menu (Rename drawing, Delete drawing, Duplicate drawing).

## 5. Drawing Loader & Scene Switching

- [x] 5.1 Implement one-click drawing loader that flushes pending edits, parses the selected `.excalidraw` file, and calls `currentApp.api.updateScene()`.
- [x] 5.2 Implement canvas title synchronization when opening or renaming drawings.
- [x] 5.3 Implement "New Drawing" action in the manager that creates a fresh untitled drawing file in the current folder path.

## 6. Testing & Documentation

- [x] 6.1 Add unit tests for storage helpers, path navigation, and serialization in `tests/`.
- [x] 6.2 Validate manifest integrity and smoke test in Excalidraw main canvas.
- [x] 6.3 Update `README.md` and `docs/` showcase with instructions for the Local Vault and Auto-Save features.
