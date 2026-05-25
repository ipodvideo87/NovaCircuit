import { PCBBoard, BoardComponent, BoardTrace, BoardPad, Via } from '../board';

export interface ThermalHotspot {
  x: number;
  y: number;
  temperatureC: number;
  sourceType: 'component' | 'trace' | 'via';
  sourceId: string;
}

export interface CurrentDensityPoint {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  densityAMm2: number; // Amps / mm^2
  estimatedTempRise: number; // °C
  netId: string;
  traceId: string;
}

export interface CopperSaturationCell {
  x: number;  // Grid column index
  y: number;  // Grid row index
  cx: number; // Board coordinate center x
  cy: number; // Board coordinate center y
  saturation: number; // 0 to 1 ratio
}

export interface ThermalSimulationResult {
  hotspots: ThermalHotspot[];
  currentDensities: CurrentDensityPoint[];
  copperSaturation: CopperSaturationCell[];
  gridResolution: number;
  gridWidthCells: number;
  gridHeightCells: number;
  temperatureGrid: Float32Array; // Flattened 2D grid of temperatures
  ambientTemp: number;
}

export class ThermalOverlayAnalyzer {
  private ambientTemp = 25.0; // °C
  private copperThickness = 0.035; // 35μm (~1oz copper) in mm

  /**
   * Performs thermal dissipation modeling across the PCB substrate.
   */
  public analyzeBoard(board: PCBBoard): ThermalSimulationResult {
    const hotspots: ThermalHotspot[] = [];
    const currentDensities: CurrentDensityPoint[] = [];

    // 1. COMPONENT POWER ESTIMATOR (assign power based on designator/footprint types)
    const powerSources = board.components.map(c => {
      let powerW = 0.05; // Base quiescent dissipations
      const d = c.designator.toUpperCase();
      const f = c.footprintId.toUpperCase();

      if (d.startsWith('U') || d.startsWith('IC')) {
        powerW = f.includes('QFN') || f.includes('LQFP') ? 1.5 : 0.8;
      } else if (d.startsWith('Q') || d.startsWith('T')) {
        powerW = f.includes('TO220') || f.includes('TO263') ? 3.0 : 0.6; // transitors
      } else if (d.startsWith('R') || d.startsWith('PR')) {
        powerW = f.includes('2512') ? 1.0 : f.includes('1206') ? 0.25 : 0.1;
      } else if (d.startsWith('D')) {
        powerW = 0.4; // Diodes/LEDs
      }
      return {
        id: c.id,
        designator: c.designator,
        x: c.x,
        y: c.y,
        powerW
      };
    });

    // 2. TRACE CURRENT DEVIATIONS (Power rails carry heavier loads)
    const traceCurrentMap = new Map<string, number>(); // expected Net Current (Amperes)
    board.nets.forEach(net => {
      const name = net.name.toUpperCase();
      if (name.includes('VCC') || name.includes('VDD') || name.includes('5V') || name.includes('12V') || name.includes('VIN')) {
        traceCurrentMap.set(net.id, 2.5); // 2.5A primary power routing
      } else if (name.includes('3V3') || name.includes('3.3V')) {
        traceCurrentMap.set(net.id, 1.5);
      } else if (name.includes('GND') || name.includes('EARTH')) {
        traceCurrentMap.set(net.id, 3.0); // return paths
      } else {
        traceCurrentMap.set(net.id, 0.02); // 20mA signal lines
      }
    });

    board.traces.forEach(t => {
      const current = traceCurrentMap.get(t.netId) || 0.01;
      if (current < 0.02) return;

      const crossSectionArea = t.width * this.copperThickness; // mm^2
      if (crossSectionArea <= 0) return;

      // Current density in Amps / mm^2
      const density = current / crossSectionArea;

      // IPC-2152 simple Temperature Rise formula: ΔT = k * I^q * A^p
      // Using a linearized approach for interactive speed:
      const estimatedTempRise = 0.05 * Math.pow(density, 1.35);

      currentDensities.push({
        startX: t.startX,
        startY: t.startY,
        endX: t.endX,
        endY: t.endY,
        densityAMm2: density,
        estimatedTempRise,
        netId: t.netId,
        traceId: t.id
      });
    });

    // 3. DEFINE SURFACE 2D GRID FOR THERMAL DISSIPATION SOLVER
    const gridRes = 25; // number of partitions per board division
    const cols = gridRes;
    const rows = gridRes;
    const tempGrid = new Float32Array(cols * rows);

    // Board bounding size
    const bounds = { minX: -50, minY: -50, maxX: 50, maxY: 50 }; // default 100x100mm space

    // Initialize with ambient temperature
    for (let i = 0; i < tempGrid.length; i++) {
      tempGrid[i] = this.ambientTemp;
    }

    // Apply Component + Active Trace Power Heat to Thermal grid cells (Gaussian distribution)
    const getGridCoord = (bx: number, by: number) => {
      const px = Math.floor(((bx - bounds.minX) / (bounds.maxX - bounds.minX)) * cols);
      const py = Math.floor(((by - bounds.minY) / (bounds.maxY - bounds.minY)) * rows);
      return {
        x: Math.max(0, Math.min(cols - 1, px)),
        y: Math.max(0, Math.min(rows - 1, py))
      };
    };

    // Distribute component heat sources
    powerSources.forEach(src => {
      const coord = getGridCoord(src.x, src.y);
      const intensity = src.powerW * 18.0; // heat scaling coefficient
      const radius = src.powerW > 1.5 ? 4 : 2;

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const gx = coord.x + dx;
          const gy = coord.y + dy;
          if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
            const dist = Math.hypot(dx, dy);
            const rRatio = Math.max(0, radius - dist) / radius;
            const idx = gy * cols + gx;
            tempGrid[idx] += intensity * rRatio;
          }
        }
      }
    });

    // Diffuse trace thermal temperatures rise
    currentDensities.forEach(cd => {
      if (cd.estimatedTempRise > 2.0) {
        // Sample points along trace segment
        const segmentLen = Math.hypot(cd.startX - cd.endX, cd.startY - cd.endY);
        const steps = Math.max(2, Math.floor(segmentLen / 5));
        for (let s = 0; s <= steps; s++) {
          const ratio = s / steps;
          const tx = cd.startX + (cd.endX - cd.startX) * ratio;
          const ty = cd.startY + (cd.endY - cd.startY) * ratio;

          const coord = getGridCoord(tx, ty);
          const idx = coord.y * cols + coord.x;
          tempGrid[idx] = Math.max(tempGrid[idx], this.ambientTemp + cd.estimatedTempRise);
        }
      }
    });

    // Simple 2-pass Jacobi relaxation iteration to diffuse heat naturally along FR4 substrate
    const nextGrid = new Float32Array(cols * rows);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
          const current = tempGrid[y * cols + x];
          const neighborSum = 
            tempGrid[y * cols + (x - 1)] +
            tempGrid[y * cols + (x + 1)] +
            tempGrid[(y - 1) * cols + x] +
            tempGrid[(y + 1) * cols + x];
          
          // Substrate heat thermal transfer: local heat combined with surroundings diffusion
          const thermalConductivityFR4 = 0.35; // balance between original heat and conductive environment
          nextGrid[y * cols + x] = current * (1 - thermalConductivityFR4) + (neighborSum / 4) * thermalConductivityFR4;
        }
      }
      tempGrid.set(nextGrid);
    }

    // Capture highest local heat points into Hotspots array list
    powerSources.forEach(src => {
      const coord = getGridCoord(src.x, src.y);
      const gridTemp = tempGrid[coord.y * cols + coord.x];
      hotspots.push({
        x: src.x,
        y: src.y,
        temperatureC: gridTemp,
        sourceType: 'component',
        sourceId: src.id
      });
    });

    currentDensities.forEach(cd => {
      if (cd.estimatedTempRise > 10.0) {
        hotspots.push({
          x: (cd.startX + cd.endX)/2,
          y: (cd.startY + cd.endY)/2,
          temperatureC: this.ambientTemp + cd.estimatedTempRise,
          sourceType: 'trace',
          sourceId: cd.traceId
        });
      }
    });

    // 4. COPPER COVERAGE PATTERN SATURATION ANALYSIS (Thermal Balancing Balance)
    const copperSaturation: CopperSaturationCell[] = [];
    const satGridRes = 10; // 10x10 macro blocks
    const cellWidth = (bounds.maxX - bounds.minX) / satGridRes;
    const cellHeight = (bounds.maxY - bounds.minY) / satGridRes;

    for (let gy = 0; gy < satGridRes; gy++) {
      for (let gx = 0; gx < satGridRes; gx++) {
        const cx = bounds.minX + gx * cellWidth + cellWidth / 2;
        const cy = bounds.minY + gy * cellHeight + cellHeight / 2;

        // Estimate proportional copper filling area in this macro-cell
        let copperArea = 0;
        const totalCellArea = cellWidth * cellHeight;

        // Check traces inside bounding cell
        board.traces.forEach(t => {
          const minX = Math.min(t.startX, t.endX);
          const maxX = Math.max(t.startX, t.endX);
          const minY = Math.min(t.startY, t.endY);
          const maxY = Math.max(t.startY, t.endY);

          // Approximate bounds overlap
          const overlapX = Math.max(0, Math.min(maxX, cx + cellWidth/2) - Math.max(minX, cx - cellWidth/2));
          const overlapY = Math.max(0, Math.min(maxY, cy + cellHeight/2) - Math.max(minY, cy - cellHeight/2));
          if (overlapX > 0 && overlapY > 0) {
            const segLen = Math.hypot(t.startX - t.endX, t.startY - t.endY);
            copperArea += segLen * t.width;
          }
        });

        // Check component pads
        board.components.forEach(comp => {
          comp.pads.forEach(p => {
            if (p.x >= cx - cellWidth/2 && p.x <= cx + cellWidth/2 &&
                p.y >= cy - cellHeight/2 && p.y <= cy + cellHeight/2) {
              copperArea += p.width * p.height;
            }
          });
        });

        const satRatio = Math.min(0.95, copperArea / totalCellArea);

        copperSaturation.push({
          x: gx,
          y: gy,
          cx,
          cy,
          saturation: satRatio
        });
      }
    }

    return {
      hotspots,
      currentDensities,
      copperSaturation,
      gridResolution: gridRes,
      gridWidthCells: cols,
      gridHeightCells: rows,
      temperatureGrid: tempGrid,
      ambientTemp: this.ambientTemp
    };
  }
}
