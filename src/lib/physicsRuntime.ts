import { ProjectGraph, Net, Point } from '../types';
import { BoardTrace } from './board';

/**
 * Core Substrate Design Stack / Laminate parameters.
 */
export interface StackupParameters {
  dielectricConstant: number; // Er (e.g., 4.2 for FR-4)
  dielectricHeightMm: number; // H (e.g., 0.2mm height from trace to ground plane)
  copperThicknessMm: number;  // T (e.g., 0.035mm for 1oz copper)
  ambientTempC: number;       // Ta (e.g., 25.0 C)
  copperResistivityOhmMm: number; // e.g., 1.72e-5 Ohm-mm for clean annealed copper
  tempCoefficientPerC: number;     // e.g., 0.00393 per C for copper
}

/**
 * Output of a single trace-segment's physical and electrical simulation.
 */
export interface TracePhysicsResult {
  traceId: string;
  netId: string;
  resistanceOhm: number;
  voltageDropVolt: number;
  powerLossWatt: number;
  temperatureC: number;
  currentDensityAMm2: number;
  impedanceOhm: number;
  propagationVelocityMmPs: number; // Mm / ps
  propagationDelayPs: number;      // Ps
  skinDepthMm: number;
}

/**
 * Summary physics report for a unified Net Class or singular Net.
 */
export interface NetSimulationReport {
  netId: string;
  netName: string;
  totalResistanceOhm: number;
  totalVoltageDropVolt: number;
  totalPowerLossWatt: number;
  averageImpedanceOhm: number;
  peakTemperatureC: number;
  worstCurrentDensityAMm2: number;
  signalIntegrityClass: "ok" | "warning" | "violation";
  warnings: string[];
}

/**
 * High-frequency electromagnetic radiation and radiation leakage prediction.
 */
export interface EMIRadiationReport {
  netId: string;
  estimatedLoopAreaMm2: number;
  radiatedFieldDBuVm: number; // dB_uV/m radiation field at 3 meters
  crosstalkIndex: number;      // Heuristic proximity value (0.0 to 1.0)
  status: "safe" | "marginal" | "noisy";
}

export class PhysicsSimulationEngine {
  // Configured default board properties (4-layer FR4 standard)
  private stackup: StackupParameters = {
    dielectricConstant: 4.2,
    dielectricHeightMm: 0.18,
    copperThicknessMm: 0.035, // 1 oz/ft2 copper thickness
    ambientTempC: 25.0,
    copperResistivityOhmMm: 1.72e-5,
    tempCoefficientPerC: 0.00393
  };

  // Internal trace computation caching to enable high-frequency layout changes
  private simulationCache: Map<string, TracePhysicsResult> = new Map();

  constructor(customStackup?: Partial<StackupParameters>) {
    if (customStackup) {
      this.stackup = { ...this.stackup, ...customStackup };
    }
  }

  /**
   * Safe hashing utility to generate persistent layout transaction signatures.
   */
  private computeTraceFingerprint(trace: BoardTrace, currentAmps: number): string {
    return `${trace.id}-${trace.width}-${trace.startX}-${trace.startY}-${trace.endX}-${trace.endY}-${currentAmps}-${this.stackup.dielectricHeightMm}-${this.stackup.dielectricConstant}`;
  }

  /**
   * Calculates the length of a single discrete segment trace in mm.
   */
  public calculateTraceLength(trace: BoardTrace): number {
    const dx = trace.endX - trace.startX;
    const dy = trace.endY - trace.startY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * IPC-2152 / IPC-2221 based Temperature Rise of standard copper trace.
   * Calculates specific thermal dissipation rise on the board layer.
   */
  public calculateTemperatureRise(widthMm: number, currentAmps: number, isInnerLayer: boolean = false): number {
    if (currentAmps <= 0) return 0;
    
    const crossSectionAreaSqMils = (widthMm * 1000 / 25.4) * (this.stackup.copperThicknessMm * 1000 / 25.4);
    if (crossSectionAreaSqMils <= 0) return 0;

    // Empirical formula constants (IPC-2221 formula: I = k * dT^0.44 * A^0.725)
    const k = isInnerLayer ? 0.024 : 0.048;
    const b = 0.44;
    const c = 0.725;

    // Solve for dT: dT = (I / (k * A^c)) ^ (1/b)
    try {
      const denom = k * Math.pow(crossSectionAreaSqMils, c);
      if (denom <= 0) return 0;
      const val = currentAmps / denom;
      return Math.pow(val, 1 / b);
    } catch {
      return 0;
    }
  }

  /**
   * Signal Integrity Impedance calculator utilizing classic Wheeler / IPC microstrip formulas.
   */
  public calculateTraceImpedance(widthMm: number, isInnerLayer: boolean = false): number {
    const w = widthMm;
    const h = this.stackup.dielectricHeightMm;
    const t = this.stackup.copperThicknessMm;
    const er = this.stackup.dielectricConstant;

    if (w <= 0 || h <= 0) return 0;

    if (!isInnerLayer) {
      // Microstrip Impedance IPC Formula
      // Z0 = (87 / sqrt(Er + 1.41)) * ln(5.98H / (0.8W + T))
      const numerator = 5.98 * h;
      const denominator = 0.8 * w + t;
      if (denominator <= 0) return 50; // Return standard fallback impedance
      const fraction = numerator / denominator;
      const logTerm = fraction > 1 ? Math.log(fraction) : 0.1;
      const z0 = (87 / Math.sqrt(er + 1.41)) * logTerm;
      return Math.max(10, Math.min(300, z0)); // Clamp into real physical ranges
    } else {
      // Stripline Impedance IPC Formula
      // Z0 = (60 / sqrt(Er)) * ln(1.9B / (0.8W + T)) where B is the total dielectric height (approx 2H)
      const b = 2 * h;
      const numerator = 1.9 * b;
      const denominator = 0.8 * w + t;
      if (denominator <= 0) return 50;
      const fraction = numerator / denominator;
      const logTerm = fraction > 1 ? Math.log(fraction) : 0.1;
      const z0 = (60 / Math.sqrt(er)) * logTerm;
      return Math.max(10, Math.min(300, z0));
    }
  }

  /**
   * Formulates propagation parameters including speed and propagation delay.
   */
  public calculatePropagationVelocityAndDelay(lengthMm: number, isInnerLayer: boolean = false): { velocityMmPs: number; delayPs: number } {
    const er = this.stackup.dielectricConstant;
    const c = 299792458 * 1000 / 1e12; // Speed of light in mm per picosecond (~0.2998 mm/ps)

    let effectiveEr = er;
    if (!isInnerLayer) {
      // Microstrip effective dielectric constant (approximate)
      effectiveEr = 0.475 * er + 0.67;
    }

    const velocity = c / Math.sqrt(effectiveEr);
    const delay = lengthMm / velocity;

    return {
      velocityMmPs: velocity,
      delayPs: delay
    };
  }

  /**
   * Analytical calculator for single trace metrics in sequence.
   */
  public simulateTrace(trace: BoardTrace, currentAmps: number): TracePhysicsResult {
    const fingerprint = this.computeTraceFingerprint(trace, currentAmps);
    const cached = this.simulationCache.get(fingerprint);
    if (cached) {
      return cached;
    }

    const length = this.calculateTraceLength(trace);
    const isInner = trace.layer === "B.Cu"; // Treat bottom or internal layers as inner

    // 1. Calculate Impedance
    const impedance = this.calculateTraceImpedance(trace.width, isInner);

    // 2. Velocity and delay
    const { velocityMmPs, delayPs } = this.calculatePropagationVelocityAndDelay(length, isInner);

    // 3. Temperature rise
    const tempRise = this.calculateTemperatureRise(trace.width, currentAmps, isInner);
    const finalTemp = this.stackup.ambientTempC + tempRise;

    // 4. Trace resistance with temperature coefficient compensation
    const crossSectionAreaMm2 = trace.width * this.stackup.copperThicknessMm;
    const baseResistance = this.stackup.copperResistivityOhmMm * (length / crossSectionAreaMm2);
    // Adjusted resistivity for heat rise
    const temperatureCorrectionFactor = 1 + this.stackup.tempCoefficientPerC * (finalTemp - 20.0);
    const resistance = baseResistance * temperatureCorrectionFactor;

    // 5. Voltage drop and Power Dissipation
    const voltageDrop = currentAmps * resistance;
    const powerLoss = currentAmps * currentAmps * resistance;

    // 6. Current density
    const currentDensity = crossSectionAreaMm2 > 0 ? (currentAmps / crossSectionAreaMm2) : 0;

    // 7. Skin depth at 100 MHz (high-frequency baseline)
    const freqHz = 100e6;
    const permeabilityOfCopper = 1.2566e-6; // H/m
    const rhoAtTemp = this.stackup.copperResistivityOhmMm / 1000 * temperatureCorrectionFactor; // Ohm-m
    const skinDepth = Math.sqrt((2 * rhoAtTemp) / (2 * Math.PI * freqHz * permeabilityOfCopper)) * 1000; // in mm

    const result: TracePhysicsResult = {
      traceId: trace.id,
      netId: trace.netId,
      resistanceOhm: resistance,
      voltageDropVolt: voltageDrop,
      powerLossWatt: powerLoss,
      temperatureC: finalTemp,
      currentDensityAMm2: currentDensity,
      impedanceOhm: impedance,
      propagationVelocityMmPs: velocityMmPs,
      propagationDelayPs: delayPs,
      skinDepthMm: skinDepth
    };

    this.simulationCache.set(fingerprint, result);
    return result;
  }

  /**
   * Aggregates and simulates all traces belonging to a specific physical net.
   */
  public simulateNetPowerAndSignals(graph: ProjectGraph, netId: string, estimatedCurrentAmps: number = 0.1): NetSimulationReport {
    const net = graph.nets.find(n => n.id === netId);
    const name = net ? net.name : `Net #${netId}`;
    const warnings: string[] = [];

    const traces = (graph.traces || []).filter(t => t.netId === netId);
    if (traces.length === 0) {
      return {
        netId,
        netName: name,
        totalResistanceOhm: 0,
        totalVoltageDropVolt: 0,
        totalPowerLossWatt: 0,
        averageImpedanceOhm: 50,
        peakTemperatureC: this.stackup.ambientTempC,
        worstCurrentDensityAMm2: 0,
        signalIntegrityClass: "ok",
        warnings: ["No routed PCB traces found for this net connectivity graph."]
      };
    }

    let totalResistance = 0;
    let totalVoltageDrop = 0;
    let totalPowerLoss = 0;
    let sumImpedance = 0;
    let peakTemp = this.stackup.ambientTempC;
    let worstDensity = 0;

    traces.forEach(trace => {
      const res = this.simulateTrace(trace, estimatedCurrentAmps);
      totalResistance += res.resistanceOhm;
      totalVoltageDrop += res.voltageDropVolt;
      totalPowerLoss += res.powerLossWatt;
      sumImpedance += res.impedanceOhm;
      if (res.temperatureC > peakTemp) peakTemp = res.temperatureC;
      if (res.currentDensityAMm2 > worstDensity) worstDensity = res.currentDensityAMm2;
    });

    const avgImpedance = sumImpedance / traces.length;

    // --- Constraints Verification Logic ---
    let siClass: NetSimulationReport["signalIntegrityClass"] = "ok";

    // 1. Temperature Limit checks
    if (peakTemp > 85.0) {
      siClass = "violation";
      warnings.push(`Thermal Violation: Peak temperature reached ${peakTemp.toFixed(1)}°C. Exceeds reliable FR4 industrial layout thresholds (85°C).`);
    } else if (peakTemp > 50.0) {
      siClass = "warning";
      warnings.push(`Thermal Warning: Temperature elevated to ${peakTemp.toFixed(1)}°C. Consider widening traces for better thermal dissipation.`);
    }

    // 2. High Current density warnings
    if (worstDensity > 100.0) {
      siClass = "violation";
      warnings.push(`Electromigration Hazard: Peak current density of ${worstDensity.toFixed(1)} A/mm² exceeds pure copper standards layout threshold (100 A/mm²).`);
    }

    // 3. High voltage losses for power distribution paths
    if (net?.netClass === "POWER" && totalVoltageDrop > 0.15) {
      if (siClass !== "violation") siClass = "warning";
      warnings.push(`IR Drop Warning: DC Voltage Drop on VCC power rail ${name} is ${totalVoltageDrop.toFixed(3)}V. Exceeds standard target margin of 150mV.`);
    }

    // 4. Uncoupled Impedance offsets
    if (net?.netClass === "DIFFERENTIAL" && (avgImpedance > 110 || avgImpedance < 75)) {
      if (siClass !== "violation") siClass = "warning";
      warnings.push(`Impedance Mismatch: Average trace impedance of ${avgImpedance.toFixed(1)} Ohms is outside differential matching corridors (target 90 Ohms).`);
    }

    return {
      netId,
      netName: name,
      totalResistanceOhm: totalResistance,
      totalVoltageDropVolt: totalVoltageDrop,
      totalPowerLossWatt: totalPowerLoss,
      averageImpedanceOhm: avgImpedance,
      peakTemperatureC: peakTemp,
      worstCurrentDensityAMm2: worstDensity,
      signalIntegrityClass: siClass,
      warnings
    };
  }

  /**
   * Analyzes high-speed radiation EMI/EMC leaks using classic electromagnetic physics formulas.
   */
  public analyzeEMILeakage(graph: ProjectGraph, netId: string, frequencyHz: number = 24e6): EMIRadiationReport {
    const traces = (graph.traces || []).filter(t => t.netId === netId);
    let totalLengthMm = 0;
    traces.forEach(t => {
      totalLengthMm += this.calculateTraceLength(t);
    });

    // Approximate Loop Area (Area = Length * dielectricHeight)
    // Minimizing return path distances ensures low EMI signature
    const loopAreaMm2 = totalLengthMm * this.stackup.dielectricHeightMm * 1.5;

    // Differential-mode radiation model approximation
    // E_max = 1.316 * 10^-6 * (I_amps * Area_sq_m * F_mhz^2) / Distance_m
    const currentAmps = 0.05; // Average digital driving logic
    const fMhz = frequencyHz / 1e6;
    const areaSqMeters = loopAreaMm2 / 1e6;
    const distanceMeters = 3.0; // Standard FCC compliance distance

    const fieldStrengthVm = (1.316e-6 * currentAmps * areaSqMeters * fMhz * fMhz) / distanceMeters;
    let dBuVm = 0;
    if (fieldStrengthVm > 0) {
      // Convert V/m to dBuV/m (decibels above one microvolt per meter)
      dBuVm = 20 * Math.log10(fieldStrengthVm / 1e-6);
    }

    let status: EMIRadiationReport["status"] = "safe";
    if (dBuVm > 40) {
      // FCC Class B threshold limit at 3 meters for 30~88MHz is approx 40 dBuV/m
      status = "noisy";
    } else if (dBuVm > 30) {
      status = "marginal";
    }

    return {
      netId,
      estimatedLoopAreaMm2: loopAreaMm2,
      radiatedFieldDBuVm: Math.max(0, dBuVm),
      crosstalkIndex: totalLengthMm > 100 ? 0.75 : 0.25,
      status
    };
  }

  /**
   * Helper utility to calculate needed trace width (H) to match specific Target single-ended Impedance.
   */
  public matchWidthForTargetImpedance(targetImpedanceOhm: number, isInnerLayer: boolean = false): number {
    const h = this.stackup.dielectricHeightMm;
    const t = this.stackup.copperThicknessMm;
    const er = this.stackup.dielectricConstant;

    // Iteratively search matching width with golden layout ratios
    let bestWidth = 0.2; // Baseline starting trace width in mm (default 8 mil)
    let bestDiff = 9999;

    for (let w = 0.05; w <= 3.0; w += 0.01) {
      const z = this.calculateTraceImpedance(w, isInnerLayer);
      const diff = Math.abs(z - targetImpedanceOhm);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestWidth = w;
      }
    }

    return parseFloat(bestWidth.toFixed(3));
  }
}
