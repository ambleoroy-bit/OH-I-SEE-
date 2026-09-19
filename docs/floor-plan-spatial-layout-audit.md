# Floor Plan Spatial Layout Audit

**Date:** 2026-09-13  
**Issue:** Rooms overlapping, disconnected building strip, plot boundary ignored

## Root Cause

The original `layoutRoomsOnStorey()` in `layoutBuilding.js` used naive shelf-packing **always along the plot X axis**. When the plot's X dimension (length) was shorter than Y (width)—e.g. 30×50 ft swapped as 9m × 15m—rooms stacked into a **narrow vertical strip** (~10 ft wide × 60 ft long).

Additional bugs:
- Destructive `room.lengthM` clamping without repositioning
- Parking packed inside building room grid
- No collision detection
- No setbacks / buildable area
- No plot-boundary validation
- Multi-storey rooms validated as overlapping in 2D projection

## Fix Implemented

| Component | Change |
|-----------|--------|
| `spatialLayout.js` | New engine: setbacks, buildable rect, orientation-aware packing, collision checks, parking/garden zones |
| `layoutBuilding.js` | Delegates to spatial engine; removed destructive clamping |
| `spatialValidator.js` | `validateBuildingWithinPlot()` — plot boundary, same-storey overlaps |
| `requirementsToBim.js` | Garden BIM element, site setbacks in model, spatial validation on generate |
| `floor-plan-viewer.js` | Fit full plot, setbacks overlay, garden/parking rendering |

## Coordinate System

```
Plot: (0,0) → (plotLengthM, plotWidthM)
Buildable: inset by setbacks (proportional on small plots)
Building: packed inside buildable, horizontal rows when buildable.width ≥ height
Parking: outside building footprint, inside buildable/plot
Garden: remaining non-overlapping area
```

## Files Changed

- `backend/src/bim/generation/spatialLayout.js` (new)
- `backend/src/bim/generation/layoutBuilding.js`
- `backend/src/bim/generation/requirementsToBim.js`
- `backend/src/bim/validation/spatialValidator.js` (new)
- `backend/tests/bim.test.js`
- `frontend/js/bim/floor-plan-viewer.js`

## Remaining Work (Design Prompt Phase)

- Per-room resize from NL commands
- Corridor/circulation validation
- Door placement on named walls
- Layout repair when user changes one room
