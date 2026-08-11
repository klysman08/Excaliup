## 1. Extension Manifest & Metadata Updates

- [x] 1.1 Bump version to `5.0.0` in `manifest.json`
- [x] 1.2 Update extension description in `manifest.json` to highlight local vault auto-saving, GIF/SVG playback, motion flows, and Iconify browsing for Chrome Web Store deployment

## 2. Project Documentation Updates

- [x] 2.1 Update `README.md` with version 5.0 badges, headline, and core feature overview
- [x] 2.2 Refine technical architecture section and usage guidelines in `README.md` for local vault auto-sync and folder organization

## 3. Showcase Website & Simulator Updates

- [x] 3.1 Update `docs/index.html` hero badge to `v5.0.0 RELEASE`, update copy, and add a dedicated Local Vault feature card
- [x] 3.2 Update `docs/app.js` and `docs/style.css` with interactive `Excaliup-save` status indicator button and auto-sync simulation
- [x] 3.3 Update architecture section, code previews, and FAQ in `docs/index.html` to reflect v5.0 features
- [x] 3.4 Update `docs/privacy.html` with transparent disclosures on File System Access API usage and zero remote telemetry

## 4. Verification & Packaging

- [x] 4.1 Run unit test suite (`node --test`) to ensure version consistency and core module assertions pass
- [x] 4.2 Run `python package.py` to package the extension into `dist/` and verify the zip bundle
