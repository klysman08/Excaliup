## Why

Excalidraw users currently rely on browser memory/IndexedDB or manual file export/import to persist their drawings, which makes multi-drawing workflows, organization, and backup management tedious and prone to accidental data loss. This change introduces a native, local-first file vault with automatic background syncing directly to a user-selected local disk folder, enabling fast multi-drawing organization, subfolder hierarchy, favorites, and seamless in-canvas file switching without leaving Excalidraw.

## What Changes

- **In-Canvas Smart Status Button (`Excaliup-save`)**: Adds a status pill next to the Excalidraw document title showing real-time sync state (`Synced`, `Saving...`, `Setup`, `Reconnect`) and toggling the file manager drawer.
- **Local Directory Vault Integration**: Uses the browser File System Access API (`showDirectoryPicker`) with persistent handle storage in IndexedDB so users select their local drawing folder once.
- **Debounced Auto-Save & Sync**: Automatically serializes and saves canvas changes (`elements`, `appState`, `files`) into standard `.excalidraw` JSON files on local disk after user inactivity (debounced 1.2s), on canvas blur, or before switching drawings.
- **File Manager Side Drawer**: Collapsible left drawer showing the active vault, breadcrumb path navigation, search bar, and drawing cards with timestamps and quick actions.
- **Subfolder Navigation & Creation**: Allows users to navigate down into subfolders and create new subdirectories directly within the vault.
- **Favorites / Starred Filter**: Allows starring favorite drawings and filtering across all subfolders via a dedicated Favorites tab.
- **One-Click Drawing Loader**: Clicking any drawing file automatically flushes pending edits, loads the selected `.excalidraw` scene into Excalidraw via `currentApp.api`, and syncs the canvas title.

## Capabilities

### New Capabilities
- `local-vault`: Local directory selection, persistent handle storage, debounced auto-saving to `.excalidraw` files, subfolder hierarchy, favorites tracking, and in-canvas drawing manager drawer.

### Modified Capabilities
<!-- None: this is a new capability in the repository -->

## Impact

- **Extension Runtime**: Extends `inject.js` and `excaliup-core.js` to manage directory handles, auto-save timers, scene serialization, and sidebar drawer UI/DOM integration.
- **APIs Used**: Browser `FileSystemDirectoryHandle`, `FileSystemFileHandle`, IndexedDB (`idb-keyval` or native IndexedDB store), and Excalidraw API (`updateScene`, `getSceneElements`, `getAppState`, `getFiles`).
- **Dependencies**: No external npm dependencies required; self-contained within vanilla JS/DOM and Web APIs adhering to project constraints.
- **Compatibility**: Operates in Chromium browsers supporting the File System Access API; non-breaking to existing Excali Up GIF and Iconify features.
