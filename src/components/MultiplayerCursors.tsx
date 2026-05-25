import React from 'react';
import { UserPresence } from '../lib/collaborationRuntime';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Cpu } from 'lucide-react';
import { PCBComponent } from '../types';

interface MultiplayerCursorsProps {
  presences: UserPresence[];
  activeLocks: Record<string, string>;
  scale?: number;
  components?: PCBComponent[];
  canvasType?: 'schematic' | 'pcb';
}

const USER_COLORS = [
  '#f43f5e', // rose-500
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#eab308', // yellow-500
  '#a855f7', // purple-500
  '#06b6d4', // cyan-500
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[index];
}

function getUserInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const MultiplayerCursors: React.FC<MultiplayerCursorsProps> = ({
  presences,
  activeLocks,
  scale = 1,
  components = [],
  canvasType = 'pcb'
}) => {
  return (
    <>
      {/* 1. Selection Boxes Overlay Container */}
      <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        <AnimatePresence>
          {presences.map((p) => {
            if (!p.selectionBox) return null;
            const color = getUserColor(p.userId);
            const { startX, startY, endX, endY } = p.selectionBox;
            const left = Math.min(startX, endX);
            const top = Math.min(startY, endY);
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);

            if (width < 2 || height < 2) return null;

            return (
              <motion.div
                key={`select_${p.userId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                exit={{ opacity: 0 }}
                className="absolute border border-dashed rounded"
                style={{
                  left,
                  top,
                  width,
                  height,
                  borderColor: color,
                  backgroundColor: `${color}0c`,
                  boxShadow: `0 0 6px ${color}20`
                }}
              >
                <div 
                  className="absolute top-0 left-0 -translate-y-full text-[8px] font-black px-1.5 py-0.5 rounded-t font-mono text-white flex items-center gap-1 shadow-md"
                  style={{ backgroundColor: color }}
                >
                  <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                  {p.userName}'s select area
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* 2. Cursor Identities, Trace Badges, and AI Activity Overlays */}
      <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
        {presences.map((p) => {
          if (!p.cursorPosition) return null;
          const color = getUserColor(p.userId);
          const x = p.cursorPosition.x;
          const y = p.cursorPosition.y;
          const initials = getUserInitials(p.userName);

          return (
            <div
              key={p.userId}
              className="absolute left-0 top-0 transition-transform duration-75 ease-out"
              style={{
                transform: `translate(${x}px, ${y}px) scale(${scale})`
              }}
            >
              {/* Collaborative AI Activity Ambient Halo */}
              {p.isAIProcessing && (
                <div className="absolute -left-6 -top-6 w-12 h-12 rounded-full border border-dashed animate-spin flex items-center justify-center pointer-events-none"
                  style={{ borderColor: color, animationDuration: '6s' }}
                >
                  <span className="w-8 h-8 rounded-full border border-dashed animate-ping absolute opacity-40"
                    style={{ borderColor: color }}
                  />
                </div>
              )}

              {/* Modern Vector SVG Cursor Arrow */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                style={{ color }}
              >
                <path
                  d="M5.65376 12.3825L19.56 19.3356C20.6908 19.901 22 19.0805 22 17.8106V3.81937C22 2.50341 20.6152 1.6919 19.5106 2.3331L5.60431 10.3752C4.54418 10.999 4.54418 11.821 5.65376 12.3825Z"
                  fill="currentColor"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Cursor Card Metadata Overlay with User Avatar initials */}
              <div
                className="absolute left-4 top-4 px-2 py-1 rounded-xl text-white font-sans shrink-0 flex flex-col gap-0.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] border border-white/10"
                style={{ backgroundColor: `${color}f0` }}
              >
                <div className="flex items-center gap-1.5 font-bold text-[9px] uppercase tracking-wider">
                  <div className="w-4 h-4 rounded-full bg-white/20 text-[7px] flex items-center justify-center font-black border border-white/30">
                    {initials}
                  </div>
                  <span className="max-w-[100px] truncate">{p.userName}</span>
                  <span className="opacity-75 text-[7px] font-mono px-1 bg-white/10 rounded">
                    {p.role}
                  </span>
                </div>

                {/* Routing Status Indicator */}
                {p.activeTraceId && (
                  <div className="text-[7px] font-mono opacity-90 border-t border-white/10 mt-0.5 pt-0.5 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-yellow-400 animate-pulse" />
                    Routing: <span className="font-bold">{p.activeTraceId}</span>
                  </div>
                )}

                {/* AI Work status */}
                {p.isAIProcessing && (
                  <div className="text-[7px] font-mono text-emerald-100 font-extrabold border-t border-white/20 mt-0.5 pt-0.5 flex items-center gap-1 animate-pulse">
                    🤖 Coprocessor acting...
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Coordinate-matched Locked Bounding Highlights */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
        {Object.entries(activeLocks).map(([elementId, userId]) => {
          const color = getUserColor(userId as string);
          
          // Match the component spatial position on canvas to overlay locking bounds
          const targetComp = components.find(c => c.id === elementId);
          if (!targetComp) return null;

          // Compute schematic or PCB position offsets
          // In schematic view, coordinates are typically scaled (step 20) or in pixels directly.
          // In PCB view, coordinates are stored in millimeters, and are mapped/scaled.
          // To make it fully robust, we look up position relative to the element
          const x = canvasType === 'pcb' 
            ? (targetComp.boardPosition?.x ?? targetComp.position.x)
            : targetComp.position.x;
          const y = canvasType === 'pcb'
            ? (targetComp.boardPosition?.y ?? targetComp.position.y)
            : targetComp.position.y;

          // Estimate component footprint bounds (in px/mm)
          const scaleOffset = canvasType === 'pcb' ? 1.5 : 1.2;
          const w = 40;
          const h = 40;

          return (
            <div
              key={`lock_highlight_${elementId}`}
              className="absolute pointer-events-none border-2 border-dashed animate-pulse rounded-xl flex items-center justify-center"
              style={{
                left: x - w / 2,
                top: y - h / 2,
                width: w,
                height: h,
                borderColor: color,
                boxShadow: `0 0 10px ${color}30, inset 0 0 10px ${color}10`,
                animationDuration: '3s'
              }}
            >
              {/* Floating lock indicator above component */}
              <div 
                className="absolute -top-5 px-1.5 py-0.5 rounded text-[8px] font-mono text-white flex items-center gap-1 shadow-md border"
                style={{ backgroundColor: color, borderColor: `${color}aa` }}
              >
                <Lock size={8} className="animate-bounce" />
                <span>Locked by {activeLocks[elementId].substring(5, 9)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
