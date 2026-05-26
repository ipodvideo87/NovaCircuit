import React, { useState, useEffect } from 'react';
import { aiPreviewRenderer, DraftTracePreview } from '../lib/ai/previewRenderer';
import { motion } from 'motion/react';

export const RoutingPreviewOverlay: React.FC = () => {
  const [traces, setTraces] = useState<DraftTracePreview[]>([]);

  useEffect(() => {
    return aiPreviewRenderer.subscribe(() => {
      setTraces(aiPreviewRenderer.getTracePreviews());
    });
  }, []);

  if (traces.length === 0) return null;

  return (
    <svg 
      id="routing-preview-overlay"
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
      style={{ minWidth: "100%", minHeight: "100%" }}
    >
      {traces.map((trace) => {
        // Build svg d-path relative to scaled positions
        if (trace.points.length < 2) return null;

        const pathCoords = trace.points.map(pt => `${pt.x * 1.5},${pt.y * 1.3}`).join(' L ');
        const pathD = `M ${pathCoords}`;

        return (
          <g key={trace.id}>
            {/* Pulsing outer trace signal shield */}
            <motion.path
              d={pathD}
              fill="none"
              stroke="#818cf8"
              strokeWidth={trace.width * 2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ strokeDasharray: "8, 8", strokeDashoffset: 0, opacity: 0.2 }}
              animate={{
                strokeDashoffset: [0, -32],
                opacity: [0.2, 0.45, 0.2]
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "linear"
              }}
            />

            {/* Core precise trace conductor line */}
            <path
              d={pathD}
              fill="none"
              stroke="#4338ca"
              strokeWidth={trace.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_2px_rgba(99,102,241,0.8)]"
            />
          </g>
        );
      })}
    </svg>
  );
};
export default RoutingPreviewOverlay;
