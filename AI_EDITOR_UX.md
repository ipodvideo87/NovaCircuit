# Production-Grade PCB & Schematic Editor User Experience Specification

This document lays down the viewport transformation pipeline, spatial virtualization algorithms, tactile snapping controllers, push-and-shove physics routing vectors, custom multi-layer management, and live graphics synchronization layer of the high-fidelity browser-native **PCB & Schematic Editor UX Runtime**.

---

## 1. System Render & Math Topology

To support sub-millisecond drawing times when panning and zooming large schematics, mouse movements map onto 2D viewport matrices:

```text
  Screen Coordinates P(x_pixel, y_pixel)
                   │
                   ▼  - Subtract Panning Offsets (panX, panY)
                   │  - Scale by Zoom Factor
                   ▼
  Physical Millimeters coordinate system P_world(X_mm, Y_mm)
```

The mathematical transformation is defined by:
$$X_{world} = \frac{X_{screen} - \text{panX}}{\text{zoom}}$$
$$Y_{world} = \frac{Y_{screen} - \text{panY}}{\text{zoom}}$$

---

## 2. Dynamic Viewport Virtualization Engine

Rather than rendering objects outside the viewport, the virtualizer executes **Aura Box Culling** before rendering:

```text
┌────────────────────────────────────────────────────────────┐
│                  Offscreen Element (Far Left)              │
│                  - Outside visible coordinate range        │
│                  - CULLED IN RENDER PIPELINE               │
└────────────────────────────────────────────────────────────┘
                         ┌───────────────────────────────────┐
                         │   Active Visible Viewport Aura    │
                         │   - View bounds checked against   │
                         │     filtered element boxes        │
                         │   - DRAWN BY GPU/WEBGL ACCELERATOR│
                         └───────────────────────────────────┘
```

1.  **Aura Calculation:** Computes boundary rectangles of active elements ($[MinX, MinY, MaxX, MaxY]$) inside physical space.
2.  **Visible Range Verification:** Intersects each box against current scale dimensions. Element is discarded from draft loops if outer overlaps are false.

---

## 3. Physical Snapping & Pull-up Controller

For high accuracy, the tactile snapping controller operates on a dual-mode matrix rule:
*   **Pad & Pin Snap:** Scans for designator pads or controller pins within a proximity radius of $1.5\text{ mm}$ to pull lines directly to physical interfaces.
*   **Ortholinear Grid Snap:** Falls back to grid spacing markers (e.g. standard $0.5\text{ mm}$ intervals) to snap segments precisely.

---

## 4. Push-and-Shove Vector Redirections

To preserve clearance boundaries during interactive routing, the system calculates shift vectors for overlapping objects:

```text
Placed Trace Segment ────────► [Calculates overlapping distance]
                                      │
                                      ▼  - Identify orthogonal unit vector direction
                                      │  - Calculate safety spacing clearance
                                      ▼
Obstacle Trace shifted Orthogonically to Clear Space Clearance bounds
```

1.  **Orthogonal Vector Resolution:** Extract unit orthogonal step vectors $(\pm PerpX, \pm PerpY)$ relative to trace angles.
2.  **Shove Displacement:** Extrudes colliding obstacles orthogonally to clear clearance zones.
