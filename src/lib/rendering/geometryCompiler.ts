import { Point, ProjectGraph } from '../../types';
import { BoardLayer, BoardTrace, Via, KeepoutZone, BoardPad, BoardComponent } from '../board';
import { GeometryBuffer, GPUGeometryBatchCompiler, TessellatedPolygon } from '../gpuRendering';
import { PolygonTessellator } from './polygonTessellator';

/**
 * Advanced GPU-ready Geometry Compiler compiling board entities into unified buffers.
 * Supports layers separation, multi-shape pads, and grid-based dirty states.
 */
export class AdvancedGeometryCompiler {
  private tessellator = new PolygonTessellator();
  private batchCompiler = new GPUGeometryBatchCompiler();

  /**
   * Generates Float32 and Uint32 index buffers for circular copper pads or vias.
   */
  public compileCirclePad(
    pad: { x: number; y: number; r: number },
    color: [number, number, number, number],
    layerIdx: number,
    vOffset: number
  ): { vertices: number[]; indices: number[] } {
    const segments = 16;
    const vertices: number[] = [];
    const indices: number[] = [];

    // Center point
    vertices.push(pad.x, pad.y, 0.5, 0.5, color[0], color[1], color[2], layerIdx);

    for (let i = 0; i <= segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const vx = pad.x + pad.r * Math.cos(angle);
      const vy = pad.y + pad.r * Math.sin(angle);
      const u = (Math.cos(angle) + 1) / 2;
      const v = (Math.sin(angle) + 1) / 2;
      vertices.push(vx, vy, u, v, color[0], color[1], color[2], layerIdx);

      if (i > 0) {
        indices.push(vOffset, vOffset + i, vOffset + i + 1);
      }
    }

    return { vertices, indices };
  }

  /**
   * Generates Float32 geometry for rectangular pads (oriented or regular).
   */
  public compileRectPad(
    pad: { x: number; y: number; width: number; height: number; rotDeg?: number },
    color: [number, number, number, number],
    layerIdx: number,
    vOffset: number
  ): { vertices: number[]; indices: number[] } {
    const rot = (pad.rotDeg || 0) * (Math.PI / 180);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    const hw = pad.width / 2;
    const hh = pad.height / 2;

    const corners = [
      { x: -hw, y: -hh, u: 0, v: 0 },
      { x: hw, y: -hh, u: 1, v: 0 },
      { x: hw, y: hh, u: 1, v: 1 },
      { x: -hw, y: hh, u: 0, v: 1 }
    ];

    const vertices: number[] = [];
    corners.forEach(c => {
      const rx = pad.x + (c.x * cos - c.y * sin);
      const ry = pad.y + (c.x * sin + c.y * cos);
      vertices.push(rx, ry, c.u, c.v, color[0], color[1], color[2], layerIdx);
    });

    const indices = [
      vOffset + 0, vOffset + 1, vOffset + 2,
      vOffset + 0, vOffset + 2, vOffset + 3
    ];

    return { vertices, indices };
  }

  /**
   * Compiles complete layout board components and pads.
   */
  public compilePadsAndJoints(
    components: BoardComponent[],
    activeLayer: BoardLayer
  ): GeometryBuffer {
    let totalVertsNeeded = 0;
    let totalIndicesNeeded = 0;

    components.forEach(c => {
      c.pads.forEach(p => {
        if (p.layer !== activeLayer && p.type !== "tht") return;
        if (p.shape === "rect" || p.shape === "oval" || p.shape === "polygon") {
          totalVertsNeeded += 4;
          totalIndicesNeeded += 6;
        } else if (p.shape === "circle") {
          totalVertsNeeded += 18; // 1 center + 17 circle pts
          totalIndicesNeeded += 48; // 16 triangles * 3
        }
      });
    });

    const buffer = new GeometryBuffer(totalVertsNeeded, totalIndicesNeeded);
    let vCount = 0;
    let iCount = 0;
    let vOffsetIdx = 0;

    components.forEach((c) => {
      const colorMultiplier: [number, number, number, number] = 
        c.layer === "F.Cu" ? [0.93, 0.73, 0.23, 1.0] : [0.75, 0.75, 0.75, 1.0]; // Gold or silver pads

      c.pads.forEach((p) => {
        if (p.layer !== activeLayer && p.type !== "tht") return;

        const layerIndexValue = activeLayer === "F.Cu" ? 1.0 : 2.0;

        if (p.shape === "circle") {
          const { vertices, indices } = this.compileCirclePad(
            { x: p.x, y: p.y, r: Math.min(p.width, p.height) / 2 },
            colorMultiplier,
            layerIndexValue,
            vOffsetIdx
          );

          vertices.forEach(val => buffer.vertices[vCount++] = val);
          indices.forEach(val => buffer.indices[iCount++] = val);
          vOffsetIdx += 18;
          buffer.totalPrimitives += 16;
        } else {
          // Handle rect, oval, and polygonal approximations
          const { vertices, indices } = this.compileRectPad(
            { x: p.x, y: p.y, width: p.width, height: p.height, rotDeg: c.rotation },
            colorMultiplier,
            layerIndexValue,
            vOffsetIdx
          );

          vertices.forEach(val => buffer.vertices[vCount++] = val);
          indices.forEach(val => buffer.indices[iCount++] = val);
          vOffsetIdx += 4;
          buffer.totalPrimitives += 2;
        }
      });
    });

    return buffer;
  }

  /**
   * Compiles BoardOutline Edge Cuts into visible, physical fiber/border mesh structures.
   */
  public compileBoardBoundary(points: Point[]): GeometryBuffer {
    if (points.length < 3) return new GeometryBuffer(0, 0);

    // Convert edges into lines with visible board outline styling (width = 1.6mm target)
    const traceBorderWidth = 1.0; 
    const segments: BoardTrace[] = [];

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      segments.push({
        id: `boundary_edge_${i}`,
        netId: "outline_net",
        layer: "Edge.Cuts",
        width: traceBorderWidth,
        startX: p1.x,
        startY: p1.y,
        endX: p2.x,
        endY: p2.y
      });
    }

    return this.batchCompiler.compileTraces(segments);
  }

  /**
   * Parallel client-side incremental scheduler chunking trace rendering payloads.
   */
  public async compileTracesIncrementally(
    traces: BoardTrace[]
  ): Promise<GeometryBuffer[]> {
    const chunks: BoardTrace[][] = [];
    const chunkSize = 200;

    for (let i = 0; i < traces.length; i += chunkSize) {
      chunks.push(traces.slice(i, i + chunkSize));
    }

    const promises = chunks.map(chunk => {
      return new Promise<GeometryBuffer>(resolve => {
        const compiled = this.batchCompiler.compileTraces(chunk);
        resolve(compiled);
      });
    });

    return Promise.all(promises);
  }
}
