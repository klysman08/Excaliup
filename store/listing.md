# Chrome Web Store Listing

The text used in the Chrome Web Store developer dashboard. Keep it in sync with each release and paste it into the dashboard as plain text.

## Guidelines

- Describe what the extension does in plain language. Avoid long keyword lists, repeated terms, and lists of third-party names (for example, icon pack names). Those are flagged as "excessive keywords" (violation "Yellow Argon", rejected for 5.5.0).
- Paste only the text inside the code blocks, nothing else. The 5.5.0 rejection was caused by a stray chatbot preamble pasted into the description.
- Every statement must match the extension and [privacy policy](../docs/privacy.html).

## Short description

Comes from `description` in [`manifest.json`](../manifest.json) (132 characters max):

```text
Auto-save drawings to local folders, animate GIFs and SVGs, add colorful arrow motion effects, and browse Iconify in Excalidraw.
```

## Detailed description

```text
Excali Up adds a local drawing vault, motion effects for arrows and lines, animated GIF and SVG playback, and an icon library to Excalidraw (excalidraw.com).

LOCAL VAULT
• Choose a folder on your computer and your drawings are saved there automatically as standard .excalidraw files.
• Organize drawings in folders, star favorites, see recent drawings, and search, rename, move, duplicate or delete them from a side panel.
• Existing files are never overwritten by accident.

ARROW AND LINE EFFECTS
• Select an arrow or line and choose one of eight animated styles, such as particles, comet or pulse.
• Adjust color, speed, direction, size, spacing and glow for each element.
• Effects are saved with your drawing.

ANIMATED GIFS AND SVGS
• GIFs added to the canvas play in a loop, with adjustable speed.
• Animated SVG icons keep their animation.

ICON LIBRARY
• Search Iconify's open-source icon collections and insert icons by clicking or dragging them onto the canvas.
• Insert icons in your current stroke color, at small, medium or large size.

PRIVACY
Excali Up has no accounts, analytics or servers. Your drawings stay on your device. Icon searches go directly to the public Iconify API.

HOW TO USE
1. Open excalidraw.com.
2. Click the Vault button next to the menu to connect a folder.
3. Select an arrow to add an effect, or press B to open the icon library.
```

## What's new in 5.5.0

```text
• Redesigned Local Vault that matches Excalidraw's light and dark themes, with starred and recent drawings, search and keyboard shortcuts.
• Safer saving: drawings are never overwritten by accident.
• Faster arrow and line effects, and a color option for each effect.
• The effects toolbar now follows light and dark mode.
• Insert icons in your stroke color, at small, medium or large size.
• Option to pause effects when your system asks for reduced motion.
```

## Privacy practices

- **Single purpose:** Enhance Excalidraw with a local drawing vault, motion effects, animated media playback and an icon library.
- **Permissions:** `activeTab` lets the popup confirm the active tab is Excalidraw and exchange settings. Host access is limited to `https://excalidraw.com/*`.
- **Remote code:** None. All code is included in the package.
- **Data use:** No user data is collected or transmitted.
- **Privacy policy:** https://excaliup.astrofocus.app/privacy.html
