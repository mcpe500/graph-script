# Spec: Validation Fix for Semantic Diagram Layout

## Prompt

User menjalankan `node dist/cli.js render temp/fig-4-16-vqe-measurement.gs` dan mendapatkan validation warnings/errors yang tidak pernah resolve. Diagram ini adalah acceptance criteria dari spec 002 (renderer composite image latex svg).

## Tujuan

Fix layout algorithm di `diagram-semantic.ts` agar:
1. Formula elements constrained to card inner width
2. Connector labels automatically repositioned to avoid overlapping with cards
3. Validation passes with 100/100 score

## Mengapa Tujuan Ini Penting

1. **Acceptance Criteria**: Spec 002 states this diagram should render without issues
2. **Usability**: Users should be able to render complex diagrams without manual tweaking
3. **Quality**: The diagram should be readable without overlaps

---

## Changes Made

### 1. `src/renderer/diagram-semantic.ts`

#### a. Formula Width Constraint (line ~669-691)
```typescript
// Before:
const width = Math.max(metrics.width, 48);

// After:
const constrainedWidth = Math.min(Math.max(metrics.width, 48), maxWidth);
```

This ensures formula width is constrained to the card's inner width.

#### b. Connector Label Collision Detection (line ~841-890)
Added logic to detect if label overlaps with any card and reposition it:
- Check if label position overlaps with any card (except source/target)
- If overlapping, move label above or below the cards
- Added `boxesOverlap()` helper function

---

## Validation Results

### Before Fix
```
Readability Score: 0/100
Errors: 7, Warnings: 3
- eq ↔ ansatzCard: 21.7% overlap
- eq ↔ ansatzImg: 40% overlap
- ansatzCard ↔ measToEnergy-label: 75.1% overlap
- etc.
```

### After Fix
```
Readability Score: 100/100
✓ No overlap issues
✓ Validation: OK
```

---

## Manual Testing

```bash
# Test render
node dist/cli.js render temp/fig-4-16-vqe-measurement.gs

# Test check
node dist/cli.js check temp/fig-4-16-vqe-measurement.gs

# Result
Readability Score: 100/100
✓ No overlap issues
```

---

## Acceptance Criteria Met

- [x] `temp/fig-4-16-vqe-measurement.gs` renders without errors
- [x] Validation passes with 100/100 score
- [x] No overlaps between elements
- [x] Formulas constrained within card bounds
- [x] Connector labels don't overlap with cards
