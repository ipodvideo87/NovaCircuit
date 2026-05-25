import { Via } from '../board';

/**
 * High-performance Shader program configurations for WebGL primitives.
 */
export const PRIMITIVE_VS_SOURCE = `
  attribute vec2 aPosition;
  attribute vec2 aUV;
  attribute vec3 aColor;
  attribute float aLayer;

  uniform vec2 uViewportSize;
  uniform vec2 uPan;
  uniform float uZoom;

  varying vec2 vUV;
  varying vec3 vColor;
  varying float vLayer;

  void main() {
    vUV = aUV;
    vColor = aColor;
    vLayer = aLayer;

    // Convert local board coordinates with pan & zoom to WebGL NDC (-1 to 1)
    vec2 screenPos = (aPosition.xy + uPan) * uZoom;
    vec2 ndcPos = (screenPos / uViewportSize) * 2.0 - 1.0;
    
    // WebGL Y points upward, our board points downward
    gl_Position = vec4(ndcPos.x, -ndcPos.y, 0.0, 1.0);
  }
`;

export const PRIMITIVE_FS_SOURCE = `
  precision mediump float;
  varying vec2 vUV;
  varying vec3 vColor;
  varying float vLayer;

  uniform float uActiveLayerIndex; // 1.0 for F.Cu, 2.0 for B.Cu
  uniform float uDimmedLayerOpacity; // Opacity for inactive layouts

  void main() {
    float opacity = 1.0;
    if (vLayer > 0.0 && abs(vLayer - uActiveLayerIndex) > 0.1) {
      opacity = uDimmedLayerOpacity;
    }
    gl_FragColor = vec4(vColor, opacity);
  }
`;

/**
 * Instanced circular contact pad drawing configuration (WebGL 2 or WebGL 1 extensions)
 */
export const INSTANCED_VS_SOURCE = `
  attribute vec2 aUnitPos; // Small unit quad corner [-1, 1]
  attribute vec2 aInstanceOffset; // Via board center
  attribute float aInstanceSize; // Via dimensions scale
  attribute vec3 aInstanceColor; // Base color

  uniform vec2 uViewportSize;
  uniform vec2 uPan;
  uniform float uZoom;

  varying vec2 vLocalCoord;
  varying vec3 vColor;

  void main() {
    vLocalCoord = aUnitPos; // [-1, 1] to check distance for circle inside shader
    vColor = aInstanceColor;

    vec2 localPos = aInstanceOffset + aUnitPos * (aInstanceSize / 2.0);
    vec2 screenPos = (localPos + uPan) * uZoom;
    vec2 ndcPos = (screenPos / uViewportSize) * 2.0 - 1.0;

    gl_Position = vec4(ndcPos.x, -ndcPos.y, 0.0, 1.0);
  }
`;

export const INSTANCED_FS_SOURCE = `
  precision mediump float;
  varying vec2 vLocalCoord;
  varying vec3 vColor;

  void main() {
    // Exact disk culling equation
    float distSq = dot(vLocalCoord, vLocalCoord);
    if (distSq > 1.0) {
      discard; // Culled buiten inner radius limits
    }
    
    // Outer border effect overlay
    float borderMix = smoothstep(0.8, 0.95, distSq);
    vec3 finalColor = mix(vColor, vec3(0.0, 0.0, 0.0), borderMix * 0.4);

    // Inner hole representation
    if (distSq < 0.15) {
      finalColor = vec3(0.08, 0.08, 0.08); // Drill hole visual
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

/**
 * GPU Instanced Orthogonal Rendering Manager.
 */
export class InstancedRenderer {
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private isWebGL2: boolean;

  private primProg: WebGLProgram | null = null;
  private instProg: WebGLProgram | null = null;

  // GL Extensions references for WebGL 1 instanced support
  private extInstancing: any = null;

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = gl;
    this.isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

    if (!this.isWebGL2) {
      this.extInstancing = gl.getExtension('ANGLE_instanced_arrays');
    }

    this.initShaders();
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation failure: ${log}`);
    }
    return shader;
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Shader linking failure: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  private initShaders() {
    this.primProg = this.createProgram(PRIMITIVE_VS_SOURCE, PRIMITIVE_FS_SOURCE);
    this.instProg = this.createProgram(INSTANCED_VS_SOURCE, INSTANCED_FS_SOURCE);
  }

  /**
   * Performs high-speed draw for standard non-instanced geometry arrays.
   */
  public drawPrimitives(
    vertexBuffer: WebGLBuffer,
    indexBuffer: WebGLBuffer,
    indexCount: number,
    viewportWidth: number,
    viewportHeight: number,
    pan: { x: number; y: number },
    zoom: number,
    activeLayerIndex: number,
    dimmedOpacity: number
  ) {
    const gl = this.gl;
    const prog = this.primProg;
    if (!prog || indexCount === 0) return;

    gl.useProgram(prog);

    // Uniform matrices
    gl.uniform2f(gl.getUniformLocation(prog, "uViewportSize"), viewportWidth, viewportHeight);
    gl.uniform2f(gl.getUniformLocation(prog, "uPan"), pan.x, pan.y);
    gl.uniform1f(gl.getUniformLocation(prog, "uZoom"), zoom);
    gl.uniform1f(gl.getUniformLocation(prog, "uActiveLayerIndex"), activeLayerIndex);
    gl.uniform1f(gl.getUniformLocation(prog, "uDimmedLayerOpacity"), dimmedOpacity);

    // VBO Layout allocations: 8 Floats per vertex:
    // aPosition(2), aUV(2), aColor(3), aLayer(1)
    const stride = 8 * 4; // 8 Floats * 4 Bytes

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

    const aPos = gl.getAttribLocation(prog, "aPosition");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);

    const aUV = gl.getAttribLocation(prog, "aUV");
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 2 * 4);

    const aCol = gl.getAttribLocation(prog, "aColor");
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, stride, 4 * 4);

    const aLay = gl.getAttribLocation(prog, "aLayer");
    gl.enableVertexAttribArray(aLay);
    gl.vertexAttribPointer(aLay, 1, gl.FLOAT, false, stride, 7 * 4);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
  }

  /**
   * Draws copper circular vias using high-speed Instancing arrays.
   */
  public drawInstancedVias(
    vias: Via[],
    viewportWidth: number,
    viewportHeight: number,
    pan: { x: number; y: number },
    zoom: number
  ) {
    const gl = this.gl;
    const prog = this.instProg;
    if (!prog || vias.length === 0) return;

    gl.useProgram(prog);

    gl.uniform2f(gl.getUniformLocation(prog, "uViewportSize"), viewportWidth, viewportHeight);
    gl.uniform2f(gl.getUniformLocation(prog, "uPan"), pan.x, pan.y);
    gl.uniform1f(gl.getUniformLocation(prog, "uZoom"), zoom);

    // Unit square coords: 2 triangles (4 vertices) [-1.0, 1.0] coordinates space
    const unitQuadVerts = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
       1.0,  1.0,
      -1.0,  1.0
    ]);
    const unitQuadIndices = new Uint16Array([
      0, 1, 2,
      0, 2, 3
    ]);

    // Create / Update active buffer geometry
    const quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, unitQuadVerts, gl.STATIC_DRAW);

    const quadIBO = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, unitQuadIndices, gl.STATIC_DRAW);

    // Build instance arrays layout
    const stride = 6 * 4; // offset(2), size(1), color(3) -> 6 Floats
    const instData = new Float32Array(vias.length * 6);
    let idx = 0;
    vias.forEach(v => {
      instData[idx++] = v.x;
      instData[idx++] = v.y;
      instData[idx++] = v.padSize; // Scale multiplier
      instData[idx++] = 0.85; // R
      instData[idx++] = 0.65; // G
      instData[idx++] = 0.12; // B
    });

    const instVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instVBO);
    gl.bufferData(gl.ARRAY_BUFFER, instData, gl.DYNAMIC_DRAW);

    // Set quad layouts
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    const aUnitPos = gl.getAttribLocation(prog, "aUnitPos");
    gl.enableVertexAttribArray(aUnitPos);
    gl.vertexAttribPointer(aUnitPos, 2, gl.FLOAT, false, 0, 0);

    // Set instance attributes with divisor bounds
    gl.bindBuffer(gl.ARRAY_BUFFER, instVBO);

    const aInstOffset = gl.getAttribLocation(prog, "aInstanceOffset");
    gl.enableVertexAttribArray(aInstOffset);
    gl.vertexAttribPointer(aInstOffset, 2, gl.FLOAT, false, stride, 0);
    this.vertexAttribDivisor(aInstOffset, 1);

    const aInstSize = gl.getAttribLocation(prog, "aInstanceSize");
    gl.enableVertexAttribArray(aInstSize);
    gl.vertexAttribPointer(aInstSize, 1, gl.FLOAT, false, stride, 2 * 4);
    this.vertexAttribDivisor(aInstSize, 1);

    const aInstColor = gl.getAttribLocation(prog, "aInstanceColor");
    gl.enableVertexAttribArray(aInstColor);
    gl.vertexAttribPointer(aInstColor, 3, gl.FLOAT, false, stride, 3 * 4);
    this.vertexAttribDivisor(aInstColor, 1);

    // Draw elements instanced
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIBO);
    this.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, vias.length);

    // Cleanup attib divs to avoid messing general arrays
    this.vertexAttribDivisor(aInstOffset, 0);
    this.vertexAttribDivisor(aInstSize, 0);
    this.vertexAttribDivisor(aInstColor, 0);

    gl.deleteBuffer(quadVBO);
    gl.deleteBuffer(quadIBO);
    gl.deleteBuffer(instVBO);
  }

  // Cross-compat rendering calls helpers
  private vertexAttribDivisor(index: number, divisor: number) {
    if (this.isWebGL2) {
      (this.gl as WebGL2RenderingContext).vertexAttribDivisor(index, divisor);
    } else if (this.extInstancing) {
      this.extInstancing.vertexAttribDivisorANGLE(index, divisor);
    }
  }

  private drawElementsInstanced(
    mode: number,
    count: number,
    type: number,
    offset: number,
    instanceCount: number
  ) {
    if (this.isWebGL2) {
      (this.gl as WebGL2RenderingContext).drawElementsInstanced(mode, count, type, offset, instanceCount);
    } else if (this.extInstancing) {
      this.extInstancing.drawElementsInstancedANGLE(mode, count, type, offset, instanceCount);
    }
  }
}
