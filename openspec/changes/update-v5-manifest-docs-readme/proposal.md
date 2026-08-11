## Why

Following the implementation of the Local File System Vault with background debounced auto-saving, folder organization, and IndexedDB persistence, Excali Up needs to be prepared for the version 5.0 release on the Chrome Web Store. The documentation, extension manifest, README, privacy policy, and interactive GitHub Pages showcase website (`docs/`) must accurately showcase, describe, and demonstrate the new v5.0 capabilities.

## What Changes

- **Extension Manifest (`manifest.json`)**: Bump version from `4.0.0` to `5.0.0`, update extension name/description to highlight the native Local Vault auto-save file manager alongside motion effects, GIFs, and the Iconify library.
- **Project Documentation (`README.md`)**: Update version indicators, feature lists, architecture overview, and Chrome Web Store installation / deployment notes for v5.0.
- **Interactive Showcase Website (`docs/`)**:
  - Update hero section, version badges (`v5.0.0 RELEASE`), and headline descriptions across `docs/index.html`.
  - Add a dedicated feature card for the Local Vault & Auto-Save File Manager.
  - Update the interactive whiteboard canvas simulator (`docs/app.js` and `docs/style.css`) to simulate the `Excaliup-save` status button, vault drawer toggle, folder hierarchy, favorites, and auto-sync states.
  - Update technical architecture diagrams and descriptions to include the File System Access API, IndexedDB handle storage, and scene serialization.
  - Update the Privacy Policy (`docs/privacy.html`) to detail the File System Access API usage and confirm local-only storage with zero remote telemetry.
- **Packaging & Tests (`package.py`, `tests/`)**: Verify that `package.py` and unit test suites reflect version 5.0 and pass all checks cleanly.

## Capabilities

### New Capabilities
- `docs-showcase`: Specifications for the Excali Up v5.0 documentation website, privacy policy, and interactive local vault showcase simulator.

### Modified Capabilities
- `local-vault`: Documenting user-facing presentation and version alignment for the local vault auto-saving system.

## Impact

- `manifest.json`: Version updated to `5.0.0`, updated description.
- `README.md`: Feature overview, technical details, and badges updated.
- `docs/index.html`, `docs/app.js`, `docs/style.css`, `docs/privacy.html`: Updated for v5.0 local vault showcase and privacy terms.
- `tests/excaliup-core.test.js`, `package.py`: Verified for version consistency.
