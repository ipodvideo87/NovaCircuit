# GPU-Accelerated Rendering & Geometry Engine Specification

This specification documents the low-level graphics pipelining, VBO/IBO vertex memory layouts, instancing patterns, polygon tessellation algorithms, viewport virtualization parameters, and layer routing composites of the high-performance browser-native **GPU-Accelerated Rendering & Geometry Engine**.

---

## 1. Physical Render Pipeline & Memory Layout

Traces and solid polygons are compiled by a central geometry processor into binary arrays to minimize draw calls and keep viewport frame updates sub-millisecond even on designs with millions of copper nodes.

Each compiled vertex requires exactly 32 bytes of GPU layout memory:

| Attribute Offset | Primitive Type | Channel Purpose | Data Formatting | Size |
| :--- | :--- | :--- | :--- | :--- |
| `0` | Float32 | Physical Board $X$ Coordinate | Real Millimeters | 4 Bytes |
| `4` | Float32 | Physical Board $Y$ Coordinate | Real Millimeters | 4 Bytes |
| `8` | Float32 | Horizontal Coordinate $U$ | Texture mapping offsets | 4 Bytes |
| `12` | Float32 | Vertical Coordinate $V$ | Texture mapping offsets | 4 Bytes |
| `16` | Float32 | Color channel Red $R$ | Normalized segment color $[0.0, 1.0]$ | 4 Bytes |
| `20` | Float32 | Color channel Green $G$ | Normalized segment color $[0.0, 1.0]$ | 4 Bytes |
| `24` | Float32 | Color channel Blue $B$ | Normalized segment color $[0.0, 1.0]$ | 4 Bytes |
| `28` | Float32 | Stackup Level LayerIndex | Compositing level indicator | 4 Bytes |

---

## 2. Dynamic Trace Segment Triangular Expansion

Since GPUs do not support line thickness parameters natively, physical traces are expanded into robust triangular quads.

```text
       Trace Vector (startX, startY) ─────────► (endX, endY)
                                     │
           - Normal Orthogonal Normalization (nx, ny = -dy, dx)
           - Width expansion limits (hw = trace_width / 2)
                                     │
                                     ▼
                      p0 (Upper Left)       p2 (Upper Right)
                            ┌─────────────────┐
                            │  Triangle A     │
                            │        /        │
                            │      /          │
                            │    /  Triangle B│
                            └─────────────────┘
                      p1 (Lower Left)       p3 (Lower Right)
```

The system maps the four quad corner points into element index mappings:
1.  **Triangle A:** Index offsets $[p0, p1, p2]$
2.  **Triangle B:** Index offsets $[p2, p1, p3]$

---

## 3. Instanced Circles (Pads, Drill Holes, Vias) Rendering

Drawing circular features (such as grid pins or board vias) item-by-item results in CPU-GPU bus bottlenecks. The rendering engine registers these as a single instanced array call:

```text
       ┌────────────────────────────────────────────────────────┐
       │             GPU Circular Template Mesh                 │
       │  (Fidelity index vertex markers representing circle)   │
       └───────────────────────────┬────────────────────────────┘
                                   │ Shared vertex buffers
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             VBO Instance Attributes Data               │
       │   [Center X]  [Center Y]  [Radius size]  [RGBA color]  │
       └───────────────────────────┬────────────────────────────┘
                                   │ Drawn in single instanced draw call
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │         Rendered Array on Visible Viewport Layers      │
       └────────────────────────────────────────────────────────┘
```

This ensures we render hundreds of thousands of circular drill holes with minimal frame time drops.

---

## 4. Layer Stackup Compositor Multi-Pass Blend Matrix

Each physical board layer is drawn on separate frame buffers. An automated compositor binds these layers together with custom transparency overlays so internal details are kept readable:

```text
   Layer Buffer Hierarchy
   ----------------------
   Top Silkscreen Layer [F.Silkscreen] (Opacity: 0.8) ────► Color Blend Accumulation
                                                                   ▲
   Solder Mask / Front Copper [F.Cu]   (Opacity: 1.0) ─────────────┼
                                                                   ▲
   Internal Bottom Copper [B.Cu]       (Opacity: 0.5) ─────────────┘
```
