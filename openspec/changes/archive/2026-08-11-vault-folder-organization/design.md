## Context

Excali Up's local vault feature integrates with the browser File System Access API to store drawings directly on local disk as `.excalidraw` JSON files. While subfolder creation and breadcrumb navigation exist, drawings are locked to their creation directory unless manually moved outside the browser. Furthermore, creating a new drawing always defaults strictly to the currently viewed folder, and deleting folders requires external file explorer tools.

This design introduces native drag-and-drop relocation, folder-targeted drawing creation, and recursive folder deletion with explicit confirmation alerts.

## Goals / Non-Goals

**Goals:**
- Provide a responsive HTML5 drag-and-drop mechanism to drag drawing cards onto folder rows and breadcrumb segments.
- Provide a "Move to..." modal dialog accessible via drawing context actions.
- Allow selecting the destination folder during drawing creation via a structured folder selector dropdown.
- Provide folder deletion directly from the drawer UI protected by a high-visibility confirmation alert dialog.
- Maintain atomic consistency across IndexedDB handles, disk files, and metadata (`favorites`, `activeDrawingRelativePath`).

**Non-Goals:**
- Cross-vault moving (moving files across completely separate root directories).
- Drag-and-drop of entire folder hierarchies (nested folder drag-and-drop is deferred).
- Trash/recycle bin restore functionality (deletions on local disk via File System Access API are permanent, hence requiring confirmation alerts).

## Decisions

### 1. Drag-and-Drop Implementation Pattern
- **Decision**: Use native HTML5 Drag and Drop API (`draggable="true"`, `dragstart`, `dragover`, `dragleave`, `drop`) on drawing item rows, with folder rows and breadcrumb crumbs as drop targets.
- **Rationale**: Zero external dependencies (adheres to the project's dependency-free constraint), smooth 60fps browser rendering, and intuitive native feel.
- **Alternatives Considered**:
  - *Custom pointer/touch dragging with custom ghost elements*: Adds hundreds of lines of geometry math without significant benefit over native drag events in desktop Chrome.

### 2. Move Operation Execution & Metadata Synchronization
- **Decision**: In `excaliup-core.js`, execute move via `readDrawingFile` -> `writeDrawingFile` -> `deleteDrawingFile`. In `inject.js`, immediately update `vaultMetadata.favorites` (re-mapping old path to new path), update `activeDrawingRelativePath` if the open drawing was moved, persist `.excaliup.json`, and refresh the drawer UI.
- **Rationale**: The standard File System Access API `FileSystemFileHandle.move()` method is not universally supported in all Chromium environments. Read-write-delete is 100% portable and guarantees scene data integrity.
- **Alternatives Considered**:
  - *Native `FileSystemHandle.move()`*: Not yet standardized across all browser engines or embedded contexts.

### 3. Folder Selector for Drawing Creation and "Move to..." Dialog
- **Decision**: Implement `scanAllVaultFolders(rootHandle)` in `excaliup-core.js` to build a flat list of all folder paths with directory depth. Render this list in both the "New Drawing" creation modal and the "Move to..." selection modal as a clear hierarchical dropdown / picker.
- **Rationale**: Gives users immediate visibility and one-click selection of target destinations without navigating through intermediate folders.

### 4. Folder Deletion with Confirmation Alert
- **Decision**: Display a trash icon / menu item on folder rows in the drawer. When clicked, open the high-contrast `showVaultConfirmModal` displaying the folder name and warning of recursive file removal.
- **Rationale**: Prevents accidental data loss while giving users full control over folder cleanup.
- **Alternatives Considered**:
  - *Browser `window.confirm()`*: Inconsistent styling, blocks the main thread, and cannot match dark/light theme aesthetics of Excalidraw.

## Risks / Trade-offs

- **[Risk] Name Collision during Move**: Moving a drawing into a folder where a drawing with the exact same name already exists.
  - *Mitigation*: Check for existing file collision before writing; if found, append an index suffix (e.g. `drawing (1).excalidraw`) or confirm overwrite.
- **[Risk] Dragging over Non-Folder Elements**: Accidental drop events on invalid targets.
  - *Mitigation*: Enforce strict drop-target validation checking `e.dataTransfer.types` and target element attributes before accepting drop.
- **[Risk] Active Drawing Deletion**: User deletes a folder containing the currently active drawing.
  - *Mitigation*: Detect if `activeDrawingRelativePath` starts with the deleted folder prefix, reset the active drawing pointer, and notify the user.
