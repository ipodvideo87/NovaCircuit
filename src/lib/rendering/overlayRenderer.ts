import { ProjectGraph, Point } from '../../types';
import { ConstraintOverlayData } from '../drc/constraintVisualizer';
import { ThermalSimulationResult } from '../drc/thermalOverlay';
import { SignalIntegrityData } from '../drc/signalIntegrityOverlay';

export interface OverlayConfig {
  showClearance: boolean;
  showKeepouts: boolean;
  showThermal: boolean;
  showSignalIntegrity: boolean;
  showEmiRisks: boolean;
  showWatermark: boolean;
}

/**
 * High-performance composite board overlays drawer.
 * Leverages high-speed GPU-accelerated Canvas compositing, offscreen grids interpolation, 
 * batch rendering pipelines, and incremental animation timers.
 */
export class OverlayRenderer {
  private ctx: CanvasRenderingContext2D;
  private offscreenThermalCanvas: HTMLCanvasElement;
  private offscreenThermalCtx: CanvasRenderingContext2D | null;

  // Animation cycle states
  private animationTime = 0;
  private dirty = true;

  // Caching variables for incremental invalidation
  private prevGraphHash = '';
  private prevConfigHash = '';

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('Could not acquire hardware accelerated 2D drawing context.');
    }
    this.ctx = context;

    // Create offscreen bilinear interpolation buffer for thermal maps
    this.offscreenThermalCanvas = document.createElement('canvas');
    this.offscreenThermalCtx = this.offscreenThermalCanvas.getContext('2d');
  }

  /**
   * Helper to generate a quick structural identifier representing board status for cache detection.
   */
  private generateGraphHash(graph: ProjectGraph): string {
    const tracesLen = graph.traces ? graph.traces.length : 0;
    const viasLen = graph.vias ? graph.vias.length : 0;
    const compLen = graph.components ? graph.components.length : 0;
    
    // Quick structural footprint values compilation
    const leadingTrace = graph.traces && graph.traces.length > 0 ? graph.traces[graph.traces.length - 1].id : '';
    return `${tracesLen}:${viasLen}:${compLen}:${leadingTrace}`;
  }

  /**
   * Updates core animation frames clock.
   */
  public tick(deltaTimeMs: number) {
    this.animationTime += deltaTimeMs / 1000;
  }

  /**
   * Invalidates drawing state, requesting fresh recalculations on next render frame pass.
   */
  public invalidate() {
    this.dirty = true;
  }

  /**
   * Composites and renders overlay geometries onto targeted board graphics viewport.
   */
  public renderOverlays(
    viewportWidth: number,
    viewportHeight: number,
    pan: Point,
    zoom: number,
    config: OverlayConfig,
    drcData: ConstraintOverlayData,
    thermalData: ThermalSimulationResult,
    siData: SignalIntegrityData,
    aiSuggestions?: { path: Point[]; netName: string; deltaC: number }[]
  ) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    // Board rendering coordinates converter helper
    const processScale = 20; // 1mm = 20px matching PCBEditor SVG sizing
    
    const boardToScreen = (bx: number, by: number): { x: number; y: number } => {
      // Coordinate shift identical to Board rendering viewport alignment
      const rawX = bx * processScale + 50 * processScale;
      const rawY = by * processScale + 50 * processScale;
      
      return {
        x: rawX * zoom + pan.x,
        y: rawY * zoom + pan.y
      };
    };

    const screenRadius = (rMm: number): number => {
      return rMm * processScale * zoom;
    };

    // 1. THERMAL ENVELOPE GRADIENTS OVERLAYS
    if (config.showThermal && thermalData.temperatureGrid.length > 0) {
      this.drawThermalHeatmap(ctx, thermalData, viewportWidth, viewportHeight, pan, zoom, processScale);
    }

    // 2. KEEPOUT BLOCKS OVERLAYS
    if (config.showKeepouts) {
      drcData.keepouts.forEach(zone => {
        const start = boardToScreen(zone.x, zone.y);
        const w = screenRadius(zone.width);
        const h = screenRadius(zone.height);

        // Highlight keepout border
        ctx.save();
        ctx.strokeStyle = zone.isViolated ? '#ef4444' : '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(start.x, start.y, w, h);

        // Draw striped pattern inside
        ctx.fillStyle = zone.isViolated ? 'rgba(239, 68, 68, 0.08)' : 'rgba(251, 191, 36, 0.04)';
        ctx.fillRect(start.x, start.y, w, h);
        
        // Add overlay text indicator
        ctx.fillStyle = zone.isViolated ? '#f87171' : '#fbbf24';
        ctx.font = 'bold 8px Courier New';
        ctx.fillText(
          `KEEPOUT: ${zone.restrictions.join('|').toUpperCase()}`,
          start.x + 5,
          start.y + 12
        );
        ctx.restore();
      });
    }

    // 3. CLEARANCE DISKS AND OVERLAPS
    if (config.showClearance) {
      drcData.clearanceRegions.forEach(reg => {
        const screenPt = boardToScreen(reg.x, reg.y);
        const rad = screenRadius(reg.radius);

        const pulseScale = 1.0 + 0.15 * Math.sin(this.animationTime * 8); // Rapid blinking

        ctx.save();
        const gradient = ctx.createRadialGradient(
          screenPt.x, screenPt.y, rad * 0.1,
          screenPt.x, screenPt.y, rad * pulseScale
        );
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
        gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.15)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screenPt.x, screenPt.y, rad * pulseScale, 0, Math.PI * 2);
        ctx.fill();

        // Draw critical boundary ring
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.arc(screenPt.x, screenPt.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
    }

    // 4. SIGNAL INTEGRITY, SKEW & IMPEDANCE DISCREPANCIES
    if (config.showSignalIntegrity) {
      // Draw Skew mismatch sections
      siData.skews.forEach(sk => {
        const pt = boardToScreen(sk.x, sk.y);
        const pulse = 1 + 0.1 * Math.sin(this.animationTime * 5);

        ctx.save();
        ctx.strokeStyle = '#a855f7'; // Purple skew markings
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 10 * pulse, 0, Math.PI*2);
        ctx.stroke();

        ctx.fillStyle = '#c084fc';
        ctx.font = '8px Courier New';
        ctx.fillText(
          `SKEW: ${sk.skewMm.toFixed(2)}mm (lim:${sk.allowedSkewMm})`,
          pt.x + 12,
          pt.y - 4
        );
        ctx.restore();
      });

      // Draw Impedance mismatched sections
      siData.impedanceMismatches.forEach(im => {
        const pt = boardToScreen(im.x, im.y);
        ctx.save();
        ctx.fillStyle = '#f97316'; // Orange mismatch text
        ctx.font = '8px Courier New';
        ctx.fillText(
          `Z₀ DEV: ${im.measuredImpedance.toFixed(0)}Ω vs ${im.targetImpedance}Ω`,
          pt.x + 8,
          pt.y + 4
        );

        // Highlight segment point with caution outline icon
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - 6);
        ctx.lineTo(pt.x - 6, pt.y + 4);
        ctx.lineTo(pt.x + 6, pt.y + 4);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      });

      // Draw Return Paths split crossings warnings
      siData.returnPathGaps.forEach(rg => {
        const pt = boardToScreen(rg.x, rg.y);
        ctx.save();
        ctx.fillStyle = '#e11d48'; // Rich red alert
        ctx.font = 'bold 8px Courier New';
        ctx.fillText(`GP GAP: ${rg.netName} EMISSION`, pt.x + 10, pt.y - 2);

        // Draw alert radiation ripples
        const radiusVal = (this.animationTime * 25) % 20;
        ctx.strokeStyle = `rgba(225, 29, 72, ${1.0 - radiusVal/20})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radiusVal, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
      });
    }

    // 5. EMI SHARP CORNER RISKS OVERVIEW
    if (config.showEmiRisks) {
      siData.emiRisks.forEach(er => {
        const pt = boardToScreen(er.x, er.y);
        const scaleVal = 1.0 + 0.08 * Math.sin(this.animationTime * 12);

        ctx.save();
        ctx.fillStyle = 'rgba(234, 179, 8, 0.4)'; // Yellow radar pulses
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8 * scaleVal, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
      });
    }

    // 6. DFM / MANUFACTURING INDICATORS: Annular rings & Edge boundary warning lines
    drcData.annularRings.forEach(ar => {
      const pt = boardToScreen(ar.x, ar.y);
      ctx.save();
      ctx.strokeStyle = '#2563eb'; // Blue indicators
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 1]);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI*2);
      ctx.stroke();

      ctx.fillStyle = '#60a5fa';
      ctx.font = '7px sans-serif';
      ctx.fillText(`RING ${ar.ringWidth.toFixed(2)}mm`, pt.x + 10, pt.y + 8);
      ctx.restore();
    });

    drcData.edgeProximities.forEach(ep => {
      const pt = boardToScreen(ep.x, ep.y);
      ctx.save();
      ctx.fillStyle = '#14b8a6'; // Cyan proximity warnings
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(20, 184, 166, 0.4)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, screenRadius(ep.requiredDistance), 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    });

    // 7. MULTIPLAYER COOPERATION GRAPHICS / AI OPTIMIZATION PATH PREVIEWS
    // Draws dotted green high-intelligence path previews
    if (aiSuggestions && aiSuggestions.length > 0) {
      aiSuggestions.forEach(sug => {
        if (sug.path.length < 2) return;

        ctx.save();
        ctx.strokeStyle = '#10b981'; // Green recommendation highlight
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 4]); // Animated flowing dash
        ctx.lineDashOffset = -this.animationTime * 20;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        const start = boardToScreen(sug.path[0].x, sug.path[0].y);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < sug.path.length; i++) {
          const pt = boardToScreen(sug.path[i].x, sug.path[i].y);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();

        // Glowing circle indicators along recommendation paths
        const lead = boardToScreen(sug.path[sug.path.length - 1].x, sug.path[sug.path.length - 1].y);
        ctx.fillStyle = '#34d399';
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(lead.x, lead.y, 5, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      });
    }
  }

  /**
   * Draws a gorgeous bilinearly-interpolated gradient temperature hotspot matrix using an offscreen canvas.
   */
  private drawThermalHeatmap(
    ctx: CanvasRenderingContext2D,
    thermal: ThermalSimulationResult,
    viewW: number,
    viewH: number,
    pan: Point,
    zoom: number,
    scale: number
  ) {
    if (!this.offscreenThermalCtx) return;

    const cols = thermal.gridWidthCells;
    const rows = thermal.gridHeightCells;

    // 1. Render numeric temperature values as 1px/cell pixel squares onto an offscreen canvas
    this.offscreenThermalCanvas.width = cols;
    this.offscreenThermalCanvas.height = rows;

    const imgData = this.offscreenThermalCtx.createImageData(cols, rows);
    const data = imgData.data;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const temp = thermal.temperatureGrid[y * cols + x];
        const idx = (y * cols + x) * 4;

        // Custom thermal color lookup gradient palette:
        // Ambient (25C) is fully transparent. 
        // 35C is green. 50C is yellow. 75C is orange. 100C+ is crimson red.
        const dt = temp - thermal.ambientTemp;
        if (dt <= 1.0) {
          data[idx] = 0;
          data[idx+1] = 0;
          data[idx+2] = 0;
          data[idx+3] = 0; // Translucent
        } else {
          // Heat mapping ratios
          const ratio = Math.min(1.0, dt / 75.0); // full intensity clip at 100°C (ambient + 75)
          
          if (ratio < 0.3) {
            // Cool green transitions
            const localRatio = ratio / 0.3;
            data[idx] = Math.floor(0 * localRatio);
            data[idx+1] = Math.max(0, Math.min(180, Math.floor(180 * localRatio)));
            data[idx+2] = Math.floor(50 * (1.0 - localRatio));
            data[idx+3] = Math.floor(80 * localRatio); // low transparency
          } else if (ratio < 0.6) {
            // Yellow warning hot transition zones
            const localRatio = (ratio - 0.3) / 0.3;
            data[idx] = Math.floor(220 * localRatio);
            data[idx+1] = 180;
            data[idx+2] = 0;
            data[idx+3] = Math.floor(80 + 70 * localRatio);
          } else {
            // Crimson intense hotspot locations
            const localRatio = (ratio - 0.6) / 0.4;
            data[idx] = 239;
            data[idx+1] = Math.floor(180 * (1.0 - localRatio));
            data[idx+2] = Math.floor(68 * (1.0 - localRatio));
            data[idx+3] = Math.floor(150 + 105 * localRatio); // High opacity glow
          }
        }
      }
    }

    this.offscreenThermalCtx.putImageData(imgData, 0, 0);

    // 2. Compute fitting screen bounding dimensions (corresponding to 100x100mm space centering)
    // Board centers spans coordinates [-50, -50] to [50, 50]
    const minX = -50;
    const minY = -50;
    const maxX = 50;
    const maxY = 50;

    const screenX1 = (minX * scale + 50 * scale) * zoom + pan.x;
    const screenY1 = (minY * scale + 50 * scale) * zoom + pan.y;
    const screenX2 = (maxX * scale + 50 * scale) * zoom + pan.x;
    const screenY2 = (maxY * scale + 50 * scale) * zoom + pan.y;

    const width = screenX2 - screenX1;
    const height = screenY2 - screenY1;

    // 3. Draw image and let GPU perform extremely fast bilinear interpolation scaling automatically!
    ctx.save();
    ctx.globalCompositeOperation = 'screen'; // additive ambient lighting effect
    ctx.imageSmoothingEnabled = true; // bilinear filter activation
    ctx.drawImage(this.offscreenThermalCanvas, screenX1, screenY1, width, height);
    ctx.restore();
  }
}
