## 1. Core Vault Storage Utilities

- [x] 1.1 Implement `scanAllVaultFolders(rootHandle, currentPath)` in `excaliup-core.js` to retrieve all subfolders with paths and depth.
- [x] 1.2 Implement `moveDrawingFile(rootHandle, sourceRelativePath, targetRelativeFolderPath)` in `excaliup-core.js` to read, write to new location, and remove source file.
- [x] 1.3 Implement `deleteVaultFolder(rootHandle, relativeFolderPath, recursive = true)` in `excaliup-core.js` to remove directories recursively via File System Access API.
- [x] 1.4 Add unit tests in `tests/excaliup-core.test.js` covering folder listing, moving drawing files between folders, and folder deletion.

## 2. Target Folder Selection in Drawing Creation UI

- [x] 2.1 Update `showVaultPromptModal` / create `showVaultNewDrawingModal` in `inject.js` to include a destination folder selector dropdown.
- [x] 2.2 Populate folder dropdown with Vault Root and all discovered subfolders, defaulting to the current folder view.
- [x] 2.3 Create the new drawing in the selected target folder and update active drawing state.

## 3. Drag-and-Drop Drawing Relocation

- [x] 3.1 Make drawing item rows draggable (`draggable="true"`) in `inject.js` and attach `dragstart` / `dragend` handlers with visual dragging styles.
- [x] 3.2 Add `dragover`, `dragenter`, `dragleave`, and `drop` event listeners to folder items in the drawer list with drop highlight CSS styling.
- [x] 3.3 Add drop target support to breadcrumb crumbs so drawings can be dragged directly onto parent and root breadcrumbs.
- [x] 3.4 Wire drop handler to move the drawing file on disk, update favorites and active drawing path, show feedback toast, and refresh drawer listing.

## 4. Context Menu Move ("Move to...") Modal

- [x] 4.1 Add "Move to..." action item with icon to the drawing context action popover in `inject.js`.
- [x] 4.2 Create `showVaultMoveModal` folder picker allowing the user to select the destination folder from a list/dropdown.
- [x] 4.3 Execute relocation upon confirmation and update metadata and drawer view.

## 5. Folder Deletion with Confirmation Alert

- [x] 5.1 Add delete button / menu action to folder rows in the drawer list.
- [x] 5.2 Implement danger confirmation alert modal (`showVaultConfirmModal`) clearly warning the user of permanent folder and contents removal.
- [x] 5.3 Execute recursive folder deletion on confirmation, clean up favorites and active drawing references, display toast, and refresh drawer.

## 6. Verification and Regression Testing

- [x] 6.1 Run test suite via `node --test` to ensure all existing and new unit tests pass.
- [x] 6.2 Validate manifest JSON with `python -m json.tool manifest.json`.
