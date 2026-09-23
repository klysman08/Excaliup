## ADDED Requirements

### Requirement: Per-Effect Color
The system SHALL let the user choose a color for each animated line or arrow effect independently of the element's stroke color.

#### Scenario: Matching the line color by default
- **WHEN** an effect has no color override
- **THEN** the effect is drawn in the element's stroke color.

#### Scenario: Choosing a color
- **WHEN** the user picks a palette swatch or a custom color in the tuning panel
- **THEN** the selected elements' effects use that color, and the color is stored in the element's `customData` so it travels with the drawing.

### Requirement: Theme-Aware Motion Toolbar
The motion toolbar and tuning panel SHALL follow Excalidraw's light and dark themes.

#### Scenario: Switching theme
- **WHEN** the user switches Excalidraw between light and dark mode
- **THEN** the toolbar, panel, and color swatches update to match without reloading.

### Requirement: Retired Styles Remain Animated
The system SHALL keep animating elements saved with retired styles.

#### Scenario: Opening an older drawing
- **WHEN** a drawing contains effects saved with the Snake or Electricity style
- **THEN** they render as Comet and Wave respectively.
