import React, { useState, useEffect } from 'react';
import { aiAttentionSystem, AttentionRegion } from '../lib/ai/attentionSystem';
import { motion, AnimatePresence } from 'motion/react';

export const AIAttentionOverlay: React.FC = () => {
  const [regions, setRegions] = useState<AttentionRegion[]>([]);

  useEffect(() => {
    return aiAttentionSystem.subscribe((currentList) => {
      setRegions(currentList);
    });
  }, []);

  if (regions.length === 0) return null;

  return (
    <div id="ai-attention-overlay" className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      <AnimatePresence>
        {regions.map((region) => {
          // Multiply coordinates cleanly to scale perfectly into typical viewport sizes (e.g., multiplier of 1.5 - 2x)
          const pxLeft = `${region.x * 1.5}px`;
          const pxTop = `${region.y * 1.3}px`;
          const pxRadius = `${region.radius}px`;

          return (
            <div
              key={region.id}
              className="absolute"
              style={{
                left: pxLeft,
                top: pxTop,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {/* Outer pulsing ring */}
              <motion.div
                initial={{ scale: 0.1, opacity: 0 }}
                animate={{ 
                  scale: [1, 1.4, 1], 
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute rounded-full border-2 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                style={{
                  width: pxRadius,
                  height: pxRadius,
                  transform: 'translate(-50%, -50%)',
                }}
              />

              {/* Inner glowing core */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute rounded-full bg-indigo-500/10 backdrop-blur-[1px] border border-indigo-400 flex items-center justify-center pointer-events-none"
                style={{
                  width: `calc(${pxRadius} * 0.85)`,
                  height: `calc(${pxRadius} * 0.85)`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {/* Floating focus label box tag */}
                <span className="absolute whitespace-nowrap bg-indigo-950/90 text-[7px] text-indigo-300 font-extrabold uppercase px-1.5 py-0.5 rounded border border-indigo-500/30 -top-6 tracking-widest flex items-center gap-1 shadow-lg backdrop-blur">
                  <span className="w-1 h-1 rounded-full bg-violet-400 animate-ping inline-block" />
                  {region.label}
                </span>
              </motion.div>
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
export default AIAttentionOverlay;
