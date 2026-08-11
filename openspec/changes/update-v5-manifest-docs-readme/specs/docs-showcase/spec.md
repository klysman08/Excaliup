## Purpose

Provides comprehensive documentation, Chrome Web Store manifest deployment metadata, privacy policy disclosures, and an interactive showcase simulator for Excali Up version 5.0.

## ADDED Requirements

### Requirement: Version 5.0 Release Metadata and Documentation
The documentation, extension manifest, and showcase website SHALL reflect version 5.0 release metadata and emphasize the Local Vault and Auto-Save integration alongside motion effects, GIFs, and the Iconify library.

#### Scenario: Manifest metadata and store readiness
- **WHEN** the manifest is validated or loaded into Chrome
- **THEN** `manifest.json` specifies version `5.0.0` and provides an updated extension description highlighting local vault auto-saving, GIF/SVG playback, motion flows, and the Iconify icon library.

#### Scenario: Documentation version and feature coverage
- **WHEN** a user or developer reads `README.md`
- **THEN** the documentation highlights version 5.0, provides a dedicated feature section explaining the File System Access API vault and auto-sync, and outlines installation and technical details.

### Requirement: Interactive Local Vault Showcase Simulator
The GitHub Pages showcase website (`docs/`) SHALL include a dedicated feature presentation and interactive simulator components demonstrating local vault auto-saving and file management.

#### Scenario: Dedicated feature card display
- **WHEN** a user visits the showcase landing page (`docs/index.html`)
- **THEN** the hero badge displays `v5.0.0 RELEASE` and the core features section includes a dedicated card detailing the Local File System Vault and auto-saving file manager.

#### Scenario: Interactive playground simulator
- **WHEN** a user interacts with the demo whiteboard canvas in `docs/`
- **THEN** the canvas toolbar provides simulated local vault status (`Synced`, `Saving...`), auto-save indicators, and links or modals demonstrating file management capabilities.

### Requirement: Local Vault Privacy and Data Disclosures
The privacy policy (`docs/privacy.html`) SHALL disclose the local-only nature of the File System Access API and IndexedDB handle persistence.

#### Scenario: Privacy policy disclosures for File System Access
- **WHEN** a user reviews `docs/privacy.html`
- **THEN** the policy explicitly details how local folder handles and drawing files are accessed on-device without collection, transmission, or remote telemetry.
