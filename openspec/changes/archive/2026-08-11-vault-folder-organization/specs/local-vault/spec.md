## MODIFIED Requirements

### Requirement: Subfolder Navigation and Management
The system SHALL display the vault hierarchy, enable breadcrumb navigation between subfolders, allow creating new subdirectories, and support deleting folders with confirmation.

#### Scenario: Navigating into and out of subfolders
- **WHEN** the user clicks a subfolder in the manager drawer
- **THEN** the system opens the subfolder, updates the breadcrumb path, and displays only files and subdirectories located within that path.

#### Scenario: Creating a new subfolder
- **WHEN** the user enters a valid folder name and confirms subfolder creation
- **THEN** the system creates the directory on local disk via the directory handle and refreshes the drawer tree.

#### Scenario: Deleting a folder with confirmation
- **WHEN** the user triggers the delete action on a folder item and confirms the danger alert dialog
- **THEN** the system recursively removes the directory and its contents from local disk, cleans up metadata for contained drawings, and refreshes the drawer list.

#### Scenario: Canceling folder deletion
- **WHEN** the user triggers the delete action on a folder item and cancels or dismisses the confirmation dialog
- **THEN** the system aborts deletion without modifying any local files or metadata.

## ADDED Requirements

### Requirement: Destination Folder Selection on Drawing Creation
The system SHALL allow users to designate a target folder when creating a new drawing.

#### Scenario: Creating a drawing in selected folder
- **WHEN** the user opens the "New Drawing" modal, selects a destination folder from the folder selector dropdown, and confirms creation
- **THEN** the system creates the new drawing file in the selected directory path, loads the empty canvas, and updates the active drawing path.

#### Scenario: Defaulting to current folder
- **WHEN** the user opens the "New Drawing" modal without changing the folder selector
- **THEN** the system defaults the destination folder to the currently active drawer folder view.

### Requirement: Drawing Relocation and Drag-and-Drop Movement
The system SHALL allow moving drawing files across vault folders via mouse drag-and-drop interaction or explicit menu selection.

#### Scenario: Moving a drawing via mouse drag-and-drop onto a folder
- **WHEN** the user drags a drawing item card and drops it onto a folder item in the drawer list
- **THEN** the system moves the drawing file into the target folder, updates file paths in favorites and active drawing references, and updates the drawer view.

#### Scenario: Moving a drawing via mouse drag-and-drop onto breadcrumbs
- **WHEN** the user drags a drawing item card and drops it onto a parent breadcrumb crumb (such as Vault Root or an ancestor folder)
- **THEN** the system relocates the drawing to the designated ancestor folder and refreshes the current view.

#### Scenario: Moving a drawing via action menu selection
- **WHEN** the user opens the action menu for a drawing, clicks "Move to...", selects a target folder from the modal picker, and confirms
- **THEN** the system transfers the drawing file to the chosen destination directory and updates active state.
