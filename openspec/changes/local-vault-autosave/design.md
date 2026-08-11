## Context

See `proposal.md` for motivation and background. Excali Up currently injects logic into the `MAIN` execution world of `excalidraw.com`, hooking into the React fiber tree to obtain `currentApp.api` and Excalidraw's canvas lifecycle. This extension environment grants direct access to standard Web APIs including the File System Access API (`showDirectoryPicker`), `IndexedDB`, and DOM manipulation without bundling external heavy frameworks.

## Goals / Non-Goals

**Goals:**
- Implement a zero-dependency local storage engine using standard browser `FileSystemDirectoryHandle` and `FileSystemFileHandle`.
- Persist root directory handle in `IndexedDB` with automatic session reconnection and permission verification.
- Provide debounced (1.2s) auto-saving to `.excalidraw` JSON format, guaranteeing data integrity on tab blur, navigation, or document switching.
- Build a responsive, accessible side drawer file manager for folder navigation, subfolder creation, file deletion/renaming, and favorites tracking.
- Enable fast, in-memory switching between drawing files via `currentApp.api.updateScene()`.

**Non-Goals:**
- Real-time multi-user cloud synchronization (this is purely local-first / disk-based).
- Conflict resolution for simultaneous edits from external text editors (simple overwrite on save).
- File conversion to non-Excalidraw formats (e.g. PDF/PNG batch export is handled by standard Excalidraw export tools).

## Decisions

### 1. Storage Engine: File System Access API + IndexedDB
- **Decision**: Use `window.showDirectoryPicker({ mode: 'readwrite' })` to acquire a directory handle, and store it in an IndexedDB database named `excaliup_vault_db`.
- **Rationale**: File System Access API allows reading and writing native files on the user's computer directly without upload/download dialogs. Storing the handle in IndexedDB allows reconnecting on reload without re-opening the folder picker.
- **Alternatives Considered**:
  - *Chrome `chrome.fileSystem` (deprecated Chrome Apps API)*: Not available in Manifest V3 standard content scripts.
  - *Auto-triggering browser downloads*: Creates clutter in the Downloads folder and cannot read/switch existing drawings cleanly.

### 2. Favorites & Folder Metadata Strategy
- **Decision**: Store favorite paths and UI preferences primarily in a root configuration file (`.excaliup.json`) inside the connected folder, with a local cache in `localStorage`.
- **Rationale**: Storing `.excaliup.json` in the folder makes favorites and structure portable across devices when users sync the directory using Git, Dropbox, iCloud, or OneDrive.
- **Alternatives Considered**:
  - *`localStorage` only*: Non-portable; lost if browser storage is cleared.
  - *Embedding in every `.excalidraw` file*: Modifies individual drawings even when only marking favorite status in the UI.

### 3. Canvas Injection Point for Status Button
- **Decision**: Inject the `Excaliup-save` button into the top navigation container adjacent to `.dropdown-menu-container` / document title or as a sticky floating pill near the top-left menu.
- **Rationale**: Keeps the control aligned with document context while avoiding interference with Excalidraw's centered tool selection dock or right-side action menus.

### 4. File Switching Mechanism
- **Decision**: When the user selects a drawing file from the drawer:
  1. Synchronously trigger any pending auto-save write for the current drawing.
  2. Read and parse the target `.excalidraw` JSON from the file handle.
  3. Invoke `currentApp.api.updateScene({ elements, appState, files, commitToHistory: true })`.
  4. Update the active file handle reference and document title.
- **Rationale**: Provides instant, seamless switching without a page refresh, preserving undo/redo safety and component state.

## Risks / Trade-offs

- **[Risk] Browser Permission Expiry on Session Restart**: Chromium can reset directory read/write permissions to `"prompt"` on browser restart.
  - *Mitigation*: On session initialization, verify `handle.queryPermission({ mode: 'readwrite' })`. If `"prompt"`, update the button to display a clear `[ 💾 Vault ⚠️ Reconnect ]` indicator that triggers `handle.requestPermission()` on user click.
- **[Risk] Interrupted Writes During Browser Close**: Writing large scenes with embedded images could be cut short if the window closes abruptly.
  - *Mitigation*: Hook `window.addEventListener('beforeunload', ...)` and `document.addEventListener('visibilitychange', ...)` to flush debounced writes immediately.
- **[Risk] File Naming Conflicts**: Creating or renaming drawings with characters invalid on certain OS file systems (e.g. `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`).
  - *Mitigation*: Sanitize file and folder names on input and display inline validation warnings before disk operations.
