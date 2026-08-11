## Why

While the local vault feature allows creating subfolders and browsing files, users currently cannot choose a destination folder when creating a new drawing without first navigating into that folder. Additionally, organizing existing drawings requires manual file system operations because there is no way to move drawings between folders inside the drawer (via mouse dragging or folder selection), and users cannot delete unwanted folders directly from the interface with proper safety confirmation.

Adding target folder selection during drawing creation, intuitive mouse drag-and-drop / selector-based move workflows, and safe folder deletion with confirmation alerts will make vault drawing management seamless and complete.

## What Changes

- **Folder Selection on Drawing Creation**: When creating a new drawing via the "New Drawing" modal, users can select a destination folder from a dropdown/tree list (defaulting to the currently viewed folder or vault root), allowing direct placement into any subfolder.
- **Drag-and-Drop Drawing Moving**: Users can hold and drag drawing cards with the mouse and drop them onto folder items or breadcrumb segments to move the drawing into that folder.
- **Action Menu / Selection Move**: Users can choose "Move to..." from the drawing's action menu (or select drawings) to pick a target destination folder from a modal dialog.
- **Safe Folder Deletion with Confirmation Alert**: Folder items in the drawer display a delete action. Clicking it triggers a dedicated confirmation modal/alert warning the user of recursive deletion of folder contents, permanently removing the folder on local disk upon confirmation.
- **Metadata and State Consistency**: Automatically updates active drawing paths, favorites lists, and directory cache when drawings or folders are moved or deleted.

## Capabilities

### New Capabilities
<!-- No brand new standalone capabilities; this enhances local-vault -->

### Modified Capabilities
- `local-vault`: Modifies subfolder management requirements to include folder deletion with confirmation, updates drawing creation to support destination folder selection, and adds drawing move requirements (drag-and-drop and menu-based relocation).

## Impact

- **Core Module (`excaliup-core.js`)**: Adds `deleteVaultFolder`, `moveDrawingFile`, and `scanAllVaultFolders` functions.
- **Extension Main World (`inject.js`)**: Updates drawer UI with drag-and-drop handlers (`dragstart`, `dragover`, `dragleave`, `drop`), folder selector in "New Drawing" modal, "Move to..." popover action & modal, and folder delete action with confirmation modal.
- **Styling**: Adds CSS styles for drag-over drop target indicators, folder action buttons, and destination selector dropdowns.
- **Tests (`tests/excaliup-core.test.js`)**: Adds unit tests for folder deletion, folder scanning, and drawing file relocation.
