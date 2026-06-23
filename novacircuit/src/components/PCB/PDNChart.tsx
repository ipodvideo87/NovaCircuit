/**
 * PDNChart — Bode-style |Z| vs Frequency chart
 *
 * Renders a log-log SVG plot of:
 *   • Actual PDN impedance curve (color-coded per net)
 *   • Target impedance line (dashed cyan)
 *   • Violation regions (shaded red)
 *   • Knee frequency marker
 *   • Frequency decade grid lines
 *
 * Pure SVG — no external charting dependencies.
 */

import React, { useMemo } from 'react';
import type { PDNImpedancePoint, PDNTargetLine } from '../../types/pcb';

interface PDNChartProps {
  /** Impedance sweep data points */
  curve: PDNImpedancePoint[];
  /** Target impedance line */
  targetLine: PDNTargetLine;
  /** Net ID for label/colour */
  netId: string;
  /** Width of the SVG viewport in px */
  width?: number;
  /** Height of the SVG viewport in px */
  height?: number;
  /** Whether to show the violation fill */
  showViolations?: boolean;
  /** Optional second curve to overlay (e.g. after optimization) */
  optimizedCurve?: PDNImpedancePoint[];
}

// Per-net accent colours
const NET_COLORS: Record<string, string> = {
  'vcc-3.3v':  '#34d399',  // emerald
  'vcc-5v':    '#f59e0b',  // amber
  'vbus':      '#60a5fa',  // blue
  'vcc-1.8v':  '#a78bfa',  // violet
  'vcc-1.2v':  '#fb7185',  // rose
};
const DEFAULT_NET_COLOR = '#94a3b8';   // slate

const MARGIN = { top: 24, right: 20, bottom: 52, left: 64 };

// ─── Axis Helpers ─────────────────────────────────────────────────────────────

function logTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const startDecade = Math.floor(Math.log10(min));
  const endDecade = Math.ceil(Math.log10(max));
  for (let d = startDecade; d <= endDecade; d++) {
    ticks.push(Math.pow(10, d));
    [2, 5].forEach(m => {
      const v = m * Math.pow(10, d);
      if (v >= min && v <= max) ticks.push(v);
    });
  }
  return ticks.filter(t => t >= min && t <= max).sort((a, b) => a - b);
}

function formatTickHz(f: number): string {
  if (f >= 1e9) return `${f / 1e9}G`;
  if (f >= 1e6) return `${f / 1e6}M`;
  if (f >= 1e3) return `${f / 1e3}k`;
  return `${f}`;
}

function formatTickOhm(z: number): string {
  if (z >= 1) return `${z}Ω`;
  if (z >= 1e-3) return `${(z * 1e3).toFixed(0)}mΩ`;
  return `${(z * 1e6).toFixed(0)}µΩ`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PDNChart: React.FC<PDNChartProps> = ({
  curve,
  targetLine,
  netId,
  width = 640,
  height = 300,
  showViolations = true,
  optimizedCurve,
}) => {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const { xScale, yScale, xTicks, yTicks, zMin, zMax, fMin, fMax } = useMemo(() => {
    if (curve.length === 0) return {
      xScale: () => 0, yScale: () => 0,
      xTicks: [], yTicks: [],
      zMin: 1e-3, zMax: 10, fMin: 1e3, fMax: 1e9,
    };

    const frequencies = curve.map(p => p.frequency);
    const impedances = [
      ...curve.map(p => p.impedanceMag),
      ...targetLine.points.map(p => p.impedanceMag),
      ...(optimizedCurve ?? []).map(p => p.impedanceMag),
    ].filter(v => v > 0 && isFinite(v));

    const fMin = Math.min(...frequencies);
    const fMax = Math.max(...frequencies);
    const rawZMin = Math.min(...impedances);
    const rawZMax = Math.max(...impedances);

    // Extend range by one decade for headroom
    const logZMin = Math.floor(Math.log10(rawZMin)) - 0;
    const logZMax = Math.ceil(Math.log10(rawZMax)) + 0;
    const zMin = Math.pow(10, logZMin);
    const zMax = Math.pow(10, logZMax);

    const logFMin = Math.log10(fMin);
    const logFMax = Math.log10(fMax);
    const logZMinV = Math.log10(zMin);
    const logZMaxV = Math.log10(zMax);

    const xScale = (f: number) =>
      ((Math.log10(f) - logFMin) / (logFMax - logFMin)) * innerW;
    const yScale = (z: number) =>
      innerH - ((Math.log10(Math.max(z, 1e-12)) - logZMinV) / (logZMaxV - logZMinV)) * innerH;

    const xTicks = logTicks(fMin, fMax);
    const yTicks = logTicks(zMin, zMax);

    return { xScale, yScale, xTicks, yTicks, zMin, zMax, fMin, fMax };
  }, [curve, targetLine, optimizedCurve, innerW, innerH]);

  const netColor = NET_COLORS[netId] ?? DEFAULT_NET_COLOR;

  // Build SVG path string from array of points
  function buildPath(points: PDNImpedancePoint[]): string {
    if (points.length === 0) return '';
    return points.reduce((acc, pt, i) => {
      const x = xScale(pt.frequency);
      const z = Math.max(pt.impedanceMag, zMin);
      const y = yScale(z);
      if (!isFinite(x) || !isFinite(y)) return acc;
      return acc + (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
    }, '');
  }

  // Build violation fill polygon
  function buildViolationFill(): string {
    if (!showViolations || curve.length === 0) return '';
    // Forward along actual curve, backward along target line — only above target
    const above = curve.map((pt, i) => ({
      actual: pt.impedanceMag,
      target: targetLine.points[i]?.impedanceMag ?? Infinity,
      f: pt.frequency,
    })).filter(p => p.actual > p.target);

    if (above.length === 0) return '';

    // Create polygon segments per contiguous violation region
    let path = '';
    let inViolation = false;
    const regionPoints: { x: number; yA: number; yT: number }[] = [];

    const flush = () => {
      if (regionPoints.length < 2) return;
      const forward = regionPoints.map(p => `${p.x},${p.yA}`).join(' ');
      const backward = [...regionPoints].reverse().map(p => `${p.x},${p.yT}`).join(' ');
      path += `M${forward} L${backward} Z `;
    };

    curve.forEach((pt, i) => {
      const target = targetLine.points[i]?.impedanceMag ?? Infinity;
      const violation = pt.impedanceMag > target;
      if (violation) {
        if (!inViolation) { inViolation = true; regionPoints.length = 0; }
        regionPoints.push({
          x: xScale(pt.frequency),
          yA: yScale(Math.max(pt.impedanceMag, zMin)),
          yT: yScale(Math.max(target, zMin)),
        });
      } else if (inViolation) {
        inViolation = false;
        flush();
      }
    });
    if (inViolation) flush();

    return path;
  }

  const actualPath = buildPath(curve);
  const targetPath = buildPath(targetLine.points);
  const optimizedPath = optimizedCurve ? buildPath(optimizedCurve) : '';
  const violationPath = buildViolationFill();

  // Knee frequency marker
  const kneeX = xScale(targetLine.kneeFrequency);
  const kneeInRange =
    targetLine.kneeFrequency >= fMin && targetLine.kneeFrequency <= fMax;

  return (
    <svg
      width={width}
      height={height}
      aria-label={`PDN impedance chart for ${netId}`}
      className="select-none"
      style={{ fontFamily: 'ui-monospace, monospace' }}
    >
      <defs>
        <clipPath id={`chart-clip-${netId}`}>
          <rect x={0} y={0} width={innerW} height={innerH} />
        </clipPath>
        <pattern
          id={`grid-${netId}`}
          x={0} y={0} width={innerW} height={innerH}
          patternUnits="userSpaceOnUse"
        >
          {/* Background */}
          <rect width={innerW} height={innerH} fill="#0f172a" />
        </pattern>
      </defs>

      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {/* ── Background ── */}
        <rect width={innerW} height={innerH} fill="#0f172a" rx={4} />

        {/* ── Y-axis grid lines ── */}
        {yTicks.map(z => {
          const y = yScale(z);
          const isDecade = Number.isInteger(Math.round(Math.log10(z) * 10) / 10) &&
            Math.abs(Math.log10(z) - Math.round(Math.log10(z))) < 0.001;
          return (
            <g key={`ygrid-${z}`}>
              <line
                x1={0} y1={y} x2={innerW} y2={y}
                stroke={isDecade ? '#1e293b' : '#111827'}
                strokeWidth={isDecade ? 1 : 0.5}
              />
              {isDecade && (
                <text
                  x={-6} y={y + 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="#64748b"
                >
                  {formatTickOhm(z)}
                </text>
              )}
            </g>
          );
        })}

        {/* ── X-axis grid lines ── */}
        {xTicks.map(f => {
          const x = xScale(f);
          const isDecade = Number.isInteger(Math.round(Math.log10(f) * 10) / 10) &&
            Math.abs(Math.log10(f) - Math.round(Math.log10(f))) < 0.001;
          return (
            <g key={`xgrid-${f}`}>
              <line
                x1={x} y1={0} x2={x} y2={innerH}
                stroke={isDecade ? '#1e293b' : '#111827'}
                strokeWidth={isDecade ? 1 : 0.5}
              />
              {isDecade && (
                <text
                  x={x} y={innerH + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#64748b"
                >
                  {formatTickHz(f)}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Frequency Hz label ── */}
        <text
          x={innerW / 2} y={innerH + 34}
          textAnchor="middle"
          fontSize={10}
          fill="#475569"
        >
          Frequency (Hz)
        </text>

        {/* ── Y-axis label ── */}
        <text
          x={-innerH / 2} y={-48}
          textAnchor="middle"
          fontSize={10}
          fill="#475569"
          transform="rotate(-90)"
        >
          |Z| (Ω)
        </text>

        {/* ── Chart border ── */}
        <rect
          x={0} y={0} width={innerW} height={innerH}
          fill="none"
          stroke="#1e293b"
          strokeWidth={1}
          rx={4}
        />

        {/* ── Content clipped to chart area ── */}
        <g clipPath={`url(#chart-clip-${netId})`}>

          {/* Violation fill */}
          {violationPath && (
            <path
              d={violationPath}
              fill="#ef4444"
              fillOpacity={0.12}
            />
          )}

          {/* Target impedance line */}
          {targetPath && (
            <path
              d={targetPath}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              opacity={0.85}
            />
          )}

          {/* Optimized curve (overlay) */}
          {optimizedPath && (
            <path
              d={optimizedPath}
              fill="none"
              stroke="#86efac"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              opacity={0.8}
            />
          )}

          {/* Actual PDN impedance curve */}
          {actualPath && (
            <path
              d={actualPath}
              fill="none"
              stroke={netColor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Knee frequency marker */}
          {kneeInRange && (
            <g>
              <line
                x1={kneeX} y1={0} x2={kneeX} y2={innerH}
                stroke="#facc15"
                strokeWidth={1}
                strokeDasharray="4 2"
                opacity={0.6}
              />
              <text
                x={kneeX + 4}
                y={12}
                fontSize={8}
                fill="#facc15"
                opacity={0.8}
              >
                fknee
              </text>
            </g>
          )}

          {/* Z_target flat level annotation */}
          {targetLine.zTarget < zMax && targetLine.zTarget > zMin && (
            <text
              x={innerW - 4}
              y={yScale(targetLine.zTarget) - 4}
              textAnchor="end"
              fontSize={8}
              fill="#22d3ee"
              opacity={0.7}
            >
              Z_target = {targetLine.zTarget < 1
                ? `${(targetLine.zTarget * 1000).toFixed(0)} mΩ`
                : `${targetLine.zTarget.toFixed(2)} Ω`}
            </text>
          )}

        </g>

        {/* ── Legend ── */}
        <g transform={`translate(8, 6)`}>
          <rect x={0} y={0} width={optimizedCurve ? 210 : 160} height={16} rx={3}
            fill="#0f172a" fillOpacity={0.8} />
          <line x1={4} y1={8} x2={20} y2={8}
            stroke={netColor} strokeWidth={2} />
          <text x={24} y={11} fontSize={8} fill={netColor}>
            {netId} PDN
          </text>
          <line x1={optimizedCurve ? 80 : 75} y1={8}
            x2={optimizedCurve ? 96 : 91} y2={8}
            stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="5 2" />
          <text x={optimizedCurve ? 100 : 95} y={11} fontSize={8} fill="#22d3ee">
            Z_target
          </text>
          {optimizedCurve && (
            <>
              <line x1={152} y1={8} x2={168} y2={8}
                stroke="#86efac" strokeWidth={1.5} strokeDasharray="3 2" />
              <text x={172} y={11} fontSize={8} fill="#86efac">
                Optimized
              </text>
            </>
          )}
        </g>

      </g>
    </svg>
  );
};

export default PDNChart;
