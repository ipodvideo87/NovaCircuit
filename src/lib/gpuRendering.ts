import { ProjectGraph, Point, PCBComponent } from '../types';
import { BoardTrace, Via, BoardLayer } from './board';

/**
 * High-performance GPU Vertex definition for rendering primitives.
 */
export interface GPUVertex {
  x: number;
  y: number;
  u: number; // Texture coordinate or offset configuration mapping
  v: number;
  color: [number, number, number, number]; // RGBA normalize properties
  layerIndex: number;
}

/**
 * Holds compiled raw geometry data ready to be pushed to GPU Vertex Buffer Objects (VBOs).
 */
export class GeometryBuffer {
  public vertices: Float32Array;
  public indices: Uint32Array;
  public totalPrimitives: number = 0;

  constructor(vertexCount: number, indexCount: number) {
    this.vertices = new Float32Array(vertexCount * 8); // 8 float entries per vertex: X, Y, U, V, R, G, B, LayerIndex
    this.indices = new Uint32Array(indexCount);
  }
}

/**
 * Representation of raw copper polygon structures.
 */
export interface TessellatedPolygon {
  id: string;
  netId: string;
  layer: BoardLayer;
  vertices: Point[];
  triangulatedIndices: number[]; // Indices mapping vertex points to triangles
}

/**
 * Instanced element descriptor, allowing drawing millions of identical vias or pads in 1 draw call.
 */
export interface InstancedDrawCall {
  instancedBufferId: string;
  primitiveType: "circle" | "rect" | "drill_hole";
  layer: BoardLayer;
  transforms: Float32Array; // [x, y, scaleX, scaleY, rotation, red, green, blue] layout
  count: number;
}

/**
 * GPU Rendering pipeline context with layer composition controls.
 */
export class LayerCompositor {
  private activeLayers: BoardLayer[] = ["F.Cu", "B.Cu", "F.Silkscreen", "B.Silkscreen", "Edge.Cuts"];
  private layerOpacities: Record<BoardLayer, number> = {
    "F.Cu": 1.0,
    "B.Cu": 0.5,
    "F.Silkscreen": 0.8,
    "B.Silkscreen": 0.3,
    "Edge.Cuts": 1.0,
    "F.Mask": 0.4,
    "B.Mask": 0.4,
    "F.Paste": 0.5,
    "B.Paste": 0.5
  };

  public getLayers(): BoardLayer[] {
    return this.activeLayers;
  }

  public getOpacity(layer: BoardLayer): number {
    return this.layerOpacities[layer];
  }

  public setOpacity(layer: BoardLayer, opacity: number): void {
    this.layerOpacities[layer] = Math.max(0, Math.min(1.0, opacity));
  }
}

/**
 * Incremental caching compiler.
 */
export class IncrementalCacheInvalidator {
  private cacheDirtyState: Map<string, boolean> = new Map();

  constructor() {
    this.invalidateAll();
  }

  public invalidateAll(): void {
    this.cacheDirtyState.set("all", true);
    this.cacheDirtyState.set("F.Cu", true);
    this.cacheDirtyState.set("B.Cu", true);
    this.cacheDirtyState.set("silkscreen", true);
  }

  public invalidateLayer(layer: BoardLayer): void {
    this.cacheDirtyState.set(layer, true);
    this.cacheDirtyState.set("all", true);
  }

  public isDirty(key: string): boolean {
    return this.cacheDirtyState.get(key) || false;
  }

  public clearDirty(key: string): void {
    this.cacheDirtyState.set(key, false);
  }
}

/**
 * GPU Geometry Batch Compiler compiling high-fidelity PCB elements into GPU-bound Float arrays.
 */
export class GPUGeometryBatchCompiler {
  private compositor = new LayerCompositor();

  /**
   * Compiles copper traces into continuous high-performance quad triangle segment bands.
   */
  public compileTraces(traces: BoardTrace[]): GeometryBuffer {
    const vertexSize = 8; // properties: X, Y, U, V, R, G, B, Layer
    const verticesPerSegment = 4; // Quad corners
    const indicesPerSegment = 6; // Two triangular layouts per quad segment
    
    const buffer = new GeometryBuffer(
      traces.length * verticesPerSegment,
      traces.length * indicesPerSegment
    );

    let vIdx = 0;
    let iIdx = 0;

    traces.forEach((trace, idx) => {
      const dx = trace.endX - trace.startX;
      const dy = trace.endY - trace.startY;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len === 0) return;

      // Normalization orthogonal vectors matching width
      const nx = -dy / len;
      const ny = dx / len;
      const hw = trace.width / 2;

      // Left and right offsets at segment origin and terminals
      const p0_x = trace.startX + nx * hw;
      const p0_y = trace.startY + ny * hw;
      const p1_x = trace.startX - nx * hw;
      const p1_y = trace.startY - ny * hw;
      const p2_x = trace.endX + nx * hw;
      const p2_y = trace.endY + ny * hw;
      const p3_x = trace.endX - nx * hw;
      const p3_y = trace.endY - ny * hw;

      const layerIndex = trace.layer === "F.Cu" ? 1.0 : 2.0;
      const colorMultiplier = trace.layer === "F.Cu" ? [0.85, 0.25, 0.2, 1.0] : [0.2, 0.3, 0.8, 1.0];

      // Local offsets assignment: X, Y, U, V, R, G, B, LayerIndex
      const startV = vIdx;
      
      // Upper Left
      buffer.vertices[vIdx++] = p0_x; buffer.vertices[vIdx++] = p0_y;
      buffer.vertices[vIdx++] = 0.0;  buffer.vertices[vIdx++] = 0.0;
      buffer.vertices[vIdx++] = colorMultiplier[0]; buffer.vertices[vIdx++] = colorMultiplier[1]; buffer.vertices[vIdx++] = colorMultiplier[2];
      buffer.vertices[vIdx++] = layerIndex;

      // Lower Left
      buffer.vertices[vIdx++] = p1_x; buffer.vertices[vIdx++] = p1_y;
      buffer.vertices[vIdx++] = 1.0;  buffer.vertices[vIdx++] = 0.0;
      buffer.vertices[vIdx++] = colorMultiplier[0]; buffer.vertices[vIdx++] = colorMultiplier[1]; buffer.vertices[vIdx++] = colorMultiplier[2];
      buffer.vertices[vIdx++] = layerIndex;

      // Upper Right
      buffer.vertices[vIdx++] = p2_x; buffer.vertices[vIdx++] = p2_y;
      buffer.vertices[vIdx++] = 0.0;  buffer.vertices[vIdx++] = 1.0;
      buffer.vertices[vIdx++] = colorMultiplier[0]; buffer.vertices[vIdx++] = colorMultiplier[1]; buffer.vertices[vIdx++] = colorMultiplier[2];
      buffer.vertices[vIdx++] = layerIndex;

      // Lower Right
      buffer.vertices[vIdx++] = p3_x; buffer.vertices[vIdx++] = p3_y;
      buffer.vertices[vIdx++] = 1.0;  buffer.vertices[vIdx++] = 1.0;
      buffer.vertices[vIdx++] = colorMultiplier[0]; buffer.vertices[vIdx++] = colorMultiplier[1]; buffer.vertices[vIdx++] = colorMultiplier[2];
      buffer.vertices[vIdx++] = layerIndex;

      // Assign index triangles mapping: 0-1-2 and 2-1-3
      buffer.indices[iIdx++] = startV + 0;
      buffer.indices[iIdx++] = startV + 1;
      buffer.indices[iIdx++] = startV + 2;
      buffer.indices[iIdx++] = startV + 2;
      buffer.indices[iIdx++] = startV + 1;
      buffer.indices[iIdx++] = startV + 3;

      buffer.totalPrimitives++;
    });

    return buffer;
  }

  /**
   * Compiles copper polygon structures (copper pours) utilizing triangulated indices.
   */
  public compileCopperPours(pours: TessellatedPolygon[]): GeometryBuffer {
    let totalVerteces = 0;
    let totalIndices = 0;

    pours.forEach(p => {
      totalVerteces += p.vertices.length;
      totalIndices += p.triangulatedIndices.length;
    });

    const buffer = new GeometryBuffer(totalVerteces, totalIndices);
    let vIdx = 0;
    let iIdx = 0;
    let vertOffset = 0;

    pours.forEach(p => {
      const layerVal = p.layer === "F.Cu" ? 1.0 : 2.0;

      p.vertices.forEach(v => {
        buffer.vertices[vIdx++] = v.x;
        buffer.vertices[vIdx++] = v.y;
        buffer.vertices[vIdx++] = 0.0; // U
        buffer.vertices[vIdx++] = 0.0; // V
        buffer.vertices[vIdx++] = 0.1; // R (Dark pour styling accent)
        buffer.vertices[vIdx++] = 0.65; // G (Slight transparency fill)
        buffer.vertices[vIdx++] = 0.15; // B
        buffer.vertices[vIdx++] = layerVal;
      });

      p.triangulatedIndices.forEach(idx => {
        buffer.indices[iIdx++] = vertOffset + idx;
      });

      vertOffset += p.vertices.length;
      buffer.totalPrimitives += p.triangulatedIndices.length / 3;
    });

    return buffer;
  }

  public getCompositor(): LayerCompositor {
    return this.compositor;
  }
}

/**
 * Worker-simulation compile framework mocking multi-threaded computation of complex PCB traces.
 */
export class WorkerGeometryCompiler {
  /**
   * Serializes a slice of traces and parses compilation in simulated independent thread logic.
   */
  public static parallelCompileTracesAsync(tracesSlice: BoardTrace[]): Promise<GeometryBuffer> {
    return new Promise(resolve => {
      setTimeout(() => {
        const compiler = new GPUGeometryBatchCompiler();
        const buffer = compiler.compileTraces(tracesSlice);
        resolve(buffer);
      }, 50); // Simulated worker IPC messaging latency
    });
  }
}

/**
 * High-performance Instanced Primitive Drawer grouping identical copper layout entities.
 */
export class InstancedPrimitiveRenderer {
  private activeInstances: Map<string, InstancedDrawCall> = new Map();

  /**
   * Builds an instanced draw payload for circular contacts like vias and component pins.
   */
  public registerViasInstances(vias: Via[]): void {
    const stride = 8; // X, Y, ScaleX, ScaleY, Rotation, R, G, B
    const data = new Float32Array(vias.length * stride);
    let idx = 0;

    vias.forEach(via => {
      data[idx++] = via.x;
      data[idx++] = via.y;
      data[idx++] = via.padSize; // ScaleX
      data[idx++] = via.padSize; // ScaleY
      data[idx++] = 0.0;        // Rotation
      data[idx++] = 0.85;       // Gold contacts visual style (Red channel)
      data[idx++] = 0.65;       // Green channel
      data[idx++] = 0.12;       // Blue channel
    });

    this.activeInstances.set("vias_contact_pads", {
      instancedBufferId: "vbo_vias_instanced",
      primitiveType: "circle",
      layer: "F.Cu", // Multi-layer transition is drawn transparently on copper levels
      transforms: data,
      count: vias.length
    });
  }

  public getDrawCall(id: string): InstancedDrawCall | undefined {
    return this.activeInstances.get(id);
  }

  public getInstancesCount(): number {
    return this.activeInstances.size;
  }
}
