## Why

Excali Up 5.0 shipped the Local Vault and ten flow styles. Feedback showed the vault UI felt foreign to Excalidraw, arrow effects were expensive on long or many arrows, the motion toolbar ignored the theme, and effects could only use the line's own color. Version 5.5 addresses these and is prepared for the Chrome Web Store.

## What Changes

- **Local Vault**: native, theme-aware redesign; All/Starred/Recent views; keyboard navigation; overwrite protection; undo-safe drawing switching; event-driven auto-save.
- **Flow effects**: new batched renderer (`excaliup-flow.js`) without per-primitive `shadowBlur`; level of detail and culling; per-effect color; theme-aware toolbar; Snake and Electricity retired with automatic mapping to Comet and Wave.
- **Iconify**: insert color (stroke or original) and size (S/M/L); reliable click-to-insert.
- **Popup**: "Respect reduced motion" setting.
- **Release**: version `5.5.0` in `manifest.json`, README, CHANGELOG, AGENTS.md, showcase site, and privacy policy.

## Impact

- `manifest.json`: version and description; adds `excaliup-flow.js` to the MAIN-world scripts. No new permissions or host matches.
- `inject.js`, `excaliup-core.js`, `excaliup-flow.js`, `popup.*`, `package.py`, `tests/`.
- `README.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/index.html`, `docs/app.js`, `docs/style.css`, `docs/privacy.html`, `openspec/specs/local-vault/spec.md`.
