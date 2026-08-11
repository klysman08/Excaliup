## Purpose

Provides a local-first folder vault and background auto-sync system inside Excalidraw, allowing users to save, organize, browse, favorite, and switch drawings directly on their local file system.

## ADDED Requirements

### Requirement: Local Directory Vault Connection
The system SHALL allow the user to select and connect a local directory as their drawing vault via the browser File System Access API and persist access across sessions.

#### Scenario: Connecting a local directory for the first time
- **WHEN** the user clicks the vault setup action and approves folder selection in the directory picker
- **THEN** the system stores the directory handle in IndexedDB, marks the vault as connected, and lists existing `.excalidraw` drawings and subfolders.

#### Scenario: Restoring connection on subsequent sessions
- **WHEN** the user loads Excalidraw in a new session with a previously selected vault
- **THEN** the system retrieves the directory handle from IndexedDB and displays the connected vault status or a single-click re-authorization prompt if browser permissions lapsed.

### Requirement: In-Canvas Smart Status and Launcher Button
The system SHALL render a dedicated status button (`Excaliup-save`) in the Excalidraw top bar adjacent to the drawing title indicating real-time sync state.

#### Scenario: Visual status reflection
- **WHEN** the canvas state transitions between synced, saving, unconfigured, or permission-required
- **THEN** the status button updates its visual indicator (e.g. green dot for synced, pulse for saving, warning for permission needed) and provides descriptive tooltip feedback.

#### Scenario: Toggling the file manager drawer
- **WHEN** the user clicks the `Excaliup-save` button
- **THEN** the system toggles the visibility of the local vault file manager drawer.

### Requirement: Debounced Background Auto-Saving
The system SHALL automatically serialize the current Excalidraw canvas (`elements`, `appState`, `files`) into standard `.excalidraw` JSON and write to the active file handle on local disk.

#### Scenario: Auto-save on drawing modifications
- **WHEN** the user modifies canvas elements or text and remains inactive for the debounce threshold (1.2s)
- **THEN** the system writes the serialized scene to the active `.excalidraw` file and transitions status to synced.

#### Scenario: Auto-save on page blur or document switch
- **WHEN** the user navigates away, blurs the window, or triggers loading of another drawing
- **THEN** the system immediately flushes any pending scene changes to disk before proceeding.

### Requirement: Subfolder Navigation and Management
The system SHALL display the vault hierarchy, enable breadcrumb navigation between subfolders, and allow creating new subdirectories.

#### Scenario: Navigating into and out of subfolders
- **WHEN** the user clicks a subfolder in the manager drawer
- **THEN** the system opens the subfolder, updates the breadcrumb path, and displays only files and subdirectories located within that path.

#### Scenario: Creating a new subfolder
- **WHEN** the user enters a valid folder name and confirms subfolder creation
- **THEN** the system creates the directory on local disk via the directory handle and refreshes the drawer tree.

### Requirement: Favorites and Starred Drawings
The system SHALL allow users to mark drawings as favorites and filter them across all subfolders.

#### Scenario: Toggling favorite status
- **WHEN** the user clicks the star icon on a drawing item
- **THEN** the system persists the favorite state in the vault metadata and updates the star UI immediately.

#### Scenario: Filtering by favorites
- **WHEN** the user selects the "Starred" tab in the manager drawer
- **THEN** the system displays a unified list of all favorited drawings across the vault regardless of subfolder depth.

### Requirement: Seamless Drawing Switching
The system SHALL load a selected drawing from disk into the active Excalidraw instance without requiring a full browser page reload.

#### Scenario: Loading a drawing from the vault
- **WHEN** the user clicks a drawing in the file manager drawer
- **THEN** the system saves any pending edits to the previous file, parses the selected `.excalidraw` JSON file, updates Excalidraw's scene via the application API, sets the active file binding, and updates the canvas title to match the file name.
