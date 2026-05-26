import React, { useState, useEffect } from 'react';
import { aiPreviewRenderer, DraftComponentPreview } from '../lib/ai/previewRenderer';
import { motion, AnimatePresence } from 'motion/react';

export const PlacementPreviewGhosts: React.FC = () => {
  const [ghosts, setGhosts] = useState<DraftComponentPreview[]>([]);

  useEffect(() => {
    return aiPreviewRenderer.subscribe(() => {
      setGhosts(aiPreviewRenderer.getComponentGhosts());
    });
  }, []);

  if (ghosts.length === 0) return null;

  return (
    <div id="placement-preview-ghosts" className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      <AnimatePresence>
        {ghosts.map((ghost) => {
          // Multiply coordinates to position correctly onto local SVG scaling layouts cleanly
          const styleLeft = `${ghost.x * 1.5}px`;
          const styleTop = `${ghost.y * 1.3}px`;
          const styleWidth = `${ghost.width * 1.5}px`;
          const styleHeight = `${ghost.height * 1.3}px`;

          return (
            <motion.div
              key={ghost.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: [0.35, 0.7, 0.35],
                scale: 1,
              }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute border border-indigo-400 border-dashed rounded bg-indigo-500/10 flex flex-col items-center justify-center p-1"
              style={{
                left: styleLeft,
                top: styleTop,
                width: styleWidth,
                height: styleHeight,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <span className="text-[7px] text-indigo-300 font-black tracking-tighter uppercase leading-none truncate w-full text-center">
                {ghost.designator}
              </span>
              <span className="text-[5.5px] text-gray-500 font-mono tracking-tight leading-none truncate mt-0.5 w-full text-center">
                {ghost.name} ({ghost.footprint})
              </span>

              {/* Pins preview circles indicators inside the ghost */}
              <div className="absolute inset-x-0 bottom-0.5 flex justify-between px-1 pointer-events-none">
                {ghost.pins.map((pin, i) => (
                  <span key={i} className="w-1 h-1 rounded-full bg-indigo-400 border border-black/40" />
                ))}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
export default PlacementPreviewGhosts;
