import React from 'react';
import { UserPresence } from '../lib/collaborationRuntime';
import { motion } from 'motion/react';

interface MultiplayerCursorsProps {
  presences: UserPresence[];
  activeLocks: Record<string, string>;
  scale?: number;
}

const USER_COLORS = [
  '#f43f5e', // Rose
  '#10b981', // Emerald
  '#3b82f6', // Indigo
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[index];
}

export const MultiplayerCursors: React.FC<MultiplayerCursorsProps> = ({
  presences,
  activeLocks,
  scale = 1
}) => {
  return (
    <>
      <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
        {presences.map((p) => {
          if (!p.cursorPosition) return null;
          const color = getUserColor(p.userId);
          const x = p.cursorPosition.x;
          const y = p.cursorPosition.y;

          return (
            <div
              key={p.userId}
              className="absolute left-0 top-0 transition-transform duration-75 ease-out"
              style={{
                transform: `translate(${x}px, ${y}px)`
              }}
            >
              {/* Modern SVG Cursor Arrow */}
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

              {/* Cursor Avatar Metadata Pill */}
              <div
                className="absolute left-4 top-4 px-2 py-0.5 rounded-full font-mono text-[8px] font-black text-white shrink-0 flex items-center gap-1 shadow-lg border border-white/10"
                style={{ backgroundColor: color }}
              >
                <span className="max-w-[80px] truncate">{p.userName}</span>
                <span className="opacity-60 text-[7px]">[{p.role}]</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Synchronized Element Selection/Lock Highlights */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {Object.entries(activeLocks).map(([elementId, userId]) => {
          const color = getUserColor(userId as string);
          return (
            <div
              key={elementId}
              className="absolute pointer-events-none border border-dashed animate-pulse rounded"
              style={{
                borderColor: color,
                boxShadow: `0 0 8px ${color}40`,
                // Element locations are usually tied to DOM rendering wrappers, 
                // but this acts as an overlay validator check indicator.
              }}
            />
          );
        })}
      </div>
    </>
  );
};
