## Context

Excali Up recently gained a native Local File System Vault feature with background auto-saving, subfolder navigation, favorites, and IndexedDB handle storage. To publish version 5.0 on the Chrome Web Store and keep all documentation and public web assets synchronized, we must update `manifest.json`, `README.md`, `docs/index.html`, `docs/app.js`, `docs/style.css`, and `docs/privacy.html`.

## Goals / Non-Goals

**Goals:**
- Update `manifest.json` version to `5.0.0` and craft a concise, store-compliant description that emphasizes local file system vault auto-saving alongside GIF/SVG animation and Iconify library features.
- Update `README.md` to showcase version 5.0, document the local vault architecture, and provide clear user setup instructions.
- Update the GitHub Pages showcase (`docs/`):
  - Update badges and headlines to `v5.0.0 RELEASE`.
  - Add a dedicated core feature card for the Local Vault & Auto-Save File Manager.
  - Enhance the interactive canvas simulator (`docs/app.js`, `docs/style.css`) with simulated vault sync status (`Excaliup-save` button with Synced/Saving states and drawer toggle).
  - Update `docs/privacy.html` to clearly detail File System Access API usage and zero-data-collection guarantees.
- Ensure all test suites (`node --test`) and packaging tools (`package.py`) validate cleanly.

**Non-Goals:**
- Introducing new core runtime features or refactoring the canvas animation engine.
- Adding remote servers or cloud synchronization backends (Excali Up remains 100% local-first and client-side).

## Decisions

### Decision 1: Extension Description & Manifest v5.0 Alignment
- Set `version: "5.0.0"` in `manifest.json`.
- Update `description` in `manifest.json` to clearly communicate the complete suite of capabilities: local vault auto-saving, GIF/SVG playback, motion path flows, and Iconify icon browsing.
- *Alternatives considered*: Keeping the v4 description. *Rejected* because local vault auto-saving is a major new core feature that distinguishes v5.0.

### Decision 2: Showcase Website & Interactive Vault Simulation
- In `docs/index.html`, update the hero badge to `v5.0.0 RELEASE` and add the Local Vault feature card prominently to the Core Features grid.
- In `docs/app.js` and `docs/style.css`, add a simulated `Excaliup-save` button in the canvas toolbar that transitions between `Synced` (green) and `Saving...` (pulsing amber) when canvas elements or stickers are placed, complete with retro audio feedback.
- *Alternatives considered*: Static screenshots only. *Rejected* because the interactive demo board is a core differentiator of the Excali Up landing page.

### Decision 3: Privacy Transparency for Local File System Access
- Update `docs/privacy.html` with explicit sections covering the File System Access API, directory handle storage in IndexedDB, and the strict local-only data boundary.
- *Alternatives considered*: Leaving the existing privacy policy. *Rejected* because Chrome Web Store guidelines require accurate disclosures when extensions interact with local file access or persistent storage mechanisms.

## Risks / Trade-offs

- **[Risk] Test suite breakages due to version or popup label changes** → *Mitigation*: Run `node --test` across all test files to verify that tests dynamically inspecting manifest version and runtime configurations pass without issue.
- **[Risk] Website styling regressions in retro pixel aesthetic** → *Mitigation*: Utilize existing CSS custom properties and retro UI patterns in `docs/style.css` for any new buttons, badges, or cards.
