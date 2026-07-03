# Repository Guidelines

## Project Structure & Module Organization

ExcaliGif is a dependency-free Chrome Manifest V3 extension. Root files contain the extension runtime: `manifest.json` declares entry points, `content.js` bridges execution contexts, and `inject.js` handles Excalidraw integration, GIF playback, and canvas flows. `popup.html`, `popup.css`, and `popup.js` implement the popup. Treat `omggif.js` as vendored decoder code.

Generated artwork is stored in `icons/`; `generate_icons.py` is its source. `docs/` is a standalone GitHub Pages showcase. There is no automated test directory.

## Build, Test, and Development Commands

No dependency installation or compilation step is required.

- `python -m json.tool manifest.json > $null` validates manifest JSON in PowerShell.
- `node --test` runs the dependency-free runtime unit tests.
- `python generate_icons.py` regenerates all PNG sizes under `icons/`.
- `python -m http.server 8000 --directory docs` serves the showcase at `http://localhost:8000`.
- To develop the extension, load this repository unpacked from `chrome://extensions`. Reload it and Excalidraw after changes.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, `const`/`let`, and `camelCase` for JavaScript. CSS classes use kebab-case. Preserve custom-event names such as `ExcaliGifUpdateSettings`; they bridge execution worlds. Python uses four spaces and `snake_case`. No formatter or linter is configured, so follow nearby code and avoid formatting-only changes in feature patches.

## Testing Guidelines

Smoke-test extension changes in Chrome: confirm popup status, toggle GIF and flow controls, import a GIF, configure a line or arrow, and refresh to verify persistence. For `docs/` changes, test the simulator, theme, sound, and responsive layout. Record checks in the pull request. Put future automated tests in `tests/` and document their runner here.

## Commit & Pull Request Guidelines

History mixes terse messages with Conventional Commit prefixes. Prefer imperative subjects such as `feat: add per-element speed control`, `fix: restore GIF timing`, or `docs: update installation steps`. Keep commits focused. Pull requests should explain behavior, list manual checks, link issues, and include screenshots or a recording for UI changes. Call out new manifest permissions or match patterns.

## Security & Configuration

Keep permissions and host matches minimal. Code in the page's `MAIN` world shares Excalidraw's context; validate event payloads and do not expose sensitive data through DOM events or `localStorage`.
