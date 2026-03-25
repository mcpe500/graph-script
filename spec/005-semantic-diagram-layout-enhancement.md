# Spec: Enhanced Semantic Diagram Layout

## Prompt
Enhance semantic diagram layout with improved connector routing, card compaction, and dynamic canvas sizing.

## Purpose
Improve the semantic diagram rendering with:
1. Better connector corridor staggering to avoid overlapping paths
2. Automatic card width compaction based on content
3. Dynamic canvas sizing that shrinks to fit content

---

## Changes Made

### 1. Connector Routing Enhancements (`src/renderer/diagram-semantic.ts`)

#### New Interfaces
- `BoxArea` - Bounding box for label placement
- `ConnectorSegmentObstacle` - Track existing connector segments
- `ConnectorRoutingContext` - Pass routing state between connectors

#### New Functions
- `estimateConnectorPriority()` - Sort connectors by complexity
- `placeConnectorLabel()` - Smart label placement with collision avoidance
- `compactLaneFrames()` - Compact lane widths based on card content
- `measureSemanticBounds()` - Calculate actual content bounds
- `spreadConnectorPath()` - Offset parallel connectors to avoid overlap
- `corridorCandidates()` - Generate multiple routing candidates
- `chooseMidXCandidates()` / `chooseMidYCandidates()` - Multi-candidate routing
- Helper functions: `segmentHitsBox`, `expandBox`, `scoreSegmentInteraction`, etc.

#### ConnectorPath Interface Update
Added `labelSegmentStart` and `labelSegmentEnd` to track label segment for placement.

### 2. Card Compaction (`src/renderer/diagram-semantic.ts`)

- Auto-calculate card width from content if not explicitly set
- Support `compact_min_w` property for minimum compact width
- Return `width` in `CardMeasurement` interface

### 3. Dynamic Canvas Sizing (`src/renderer/diagram.ts` / `src/renderer/diagram/render.ts`)

- Added `fixedCanvas` property to disable auto-sizing
- Min canvas size: 640x320 for semantic diagrams
- Use `measureSemanticBounds()` for accurate content measurement

### 4. Image Rendering (`src/renderer/diagram/render.ts`)

- Added `stroke-linecap` and `stroke-linejoin` to image border rectangles

---

## New Properties

### Diagram Properties
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `fixed_canvas` | boolean | false | Disable automatic canvas sizing |

### Connector Properties
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `label_fill` | string | '#ffffff' | Background color for label |
| `label_fill_opacity` | number | 0.95 | Label background opacity |
| `label_padding_x` | number | 10 | Horizontal padding around label |
| `label_padding_y` | number | 6 | Vertical padding around label |

### Card Properties
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `compact_min_w` | number | 180 | Minimum width when compacting |

---

## Tests Added (`tests/renderer/diagram-semantic.test.ts`)

1. **staggered connector corridors** - Verify connectors use different vertical tracks
2. **compacts semantic cards** - Verify cards shrink and canvas adjusts

---

## Behavior Changes

1. **Canvas Sizing**: Semantic diagrams now auto-shrink to fit content (min 640x320)
2. **Connector Routing**: Connectors avoid overlapping by using different corridors
3. **Label Placement**: Labels have background boxes and avoid card collisions
4. **Card Width**: Cards without explicit width auto-size to content

---

## Backward Compatibility

- All existing properties work unchanged
- New properties have sensible defaults
- Non-semantic diagrams unaffected