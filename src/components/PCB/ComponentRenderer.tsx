import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { BoardComponent } from '../../types/pcb';

interface PCBComponentNodeProps {
  comp: BoardComponent;
  isSelected: boolean;
  processScale: number;
  showLabels: boolean;
  isFCuVisible: boolean;
  isBCuVisible: boolean;
  isReadOnly?: boolean;
  isLocked?: boolean;
  onSelect?: (id: string, e?: React.PointerEvent) => void;
  onPadClick?: (compId: string, padId: string, e: React.PointerEvent) => void;
  zoom?: number;
  minX?: number;
  minY?: number;
  previewStatus?: 'green' | 'amber' | 'red';
}

export const PCBComponentNode = React.memo<PCBComponentNodeProps>(function PCBComponentNode({ 
  comp, 
  isSelected, 
  processScale, 
  showLabels, 
  isFCuVisible, 
  isBCuVisible, 
  isReadOnly = false, 
  isLocked = false, 
  onSelect, 
  onPadClick, 
  zoom = 1,
  minX = -50,
  minY = -50,
  previewStatus
}) {
  const actualReadOnly = isReadOnly || isLocked;
  
  // Color style mapping for copilot proposals
  const getPreviewStyles = () => {
    switch (previewStatus) {
      case 'green':
        return "border-emerald-500 bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.3)] text-emerald-400";
      case 'amber':
        return "border-amber-500 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.3)] text-amber-500";
      case 'red':
        return "border-rose-500 bg-rose-500/10 shadow-[0_0_15px_rgba(239,68,68,0.5)] text-rose-400 animate-pulse";
      default:
        return isSelected ? "border-indigo-500 shadow-[0_0_15px_#6366f1] bg-indigo-500/10 text-indigo-400" : 
               isLocked ? "border-rose-500/50 bg-rose-500/[0.03] animate-pulse text-rose-400" : 
               "border-amber-500/30 bg-amber-500/5 text-amber-500";
    }
  };

  return (
    <motion.div 
      className={cn(
        "absolute group z-20 transition-all duration-150", 
        actualReadOnly ? "cursor-default" : "cursor-pointer hover:scale-[1.03] active:scale-[0.98]",
        isSelected && "z-30"
      )}
      onPointerDown={(e) => { 
        if (actualReadOnly) return;
        e.stopPropagation(); 
        onSelect?.(comp.id, e); 
      }}
      style={{ 
         left: comp.x * processScale + (-minX * processScale),
         top: comp.y * processScale + (-minY * processScale),
         transform: `rotate(${comp.rotation}deg)` 
      }}
    >
       <div className={cn("relative border -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-colors", 
          getPreviewStyles()
       )} style={{ width: 10 * processScale, height: 10 * processScale }}>
          <span className="text-[6px] font-mono whitespace-nowrap font-bold">{comp.designator}</span>
          {zoom >= 0.6 && comp.pads.map((pad: any) => {
            const padVisible = pad.layer === 'F.Cu' ? isFCuVisible : (pad.layer === 'B.Cu' ? isBCuVisible : true);
            if (!padVisible) return null;
            return (
              <div key={pad.id} className={cn("absolute rounded-sm", pad.layer === 'F.Cu' ? 'bg-red-500/90 border border-red-500/30 cursor-crosshair hover:bg-red-400' : 'bg-blue-500/90 border border-blue-500/30 cursor-crosshair hover:bg-blue-400', isSelected && 'ring-1 ring-white/50')}
                onPointerDown={(e) => {
                   if (actualReadOnly) return;
                   e.stopPropagation();
                   onPadClick?.(comp.id, pad.id, e);
                }}
                style={{
                  left: (pad.x - comp.x) * processScale + (-minX * processScale) - (pad.width * processScale / 2),
                  top: (pad.y - comp.y) * processScale + (-minY * processScale) - (pad.height * processScale / 2),
                  width: pad.width * processScale,
                  height: pad.height * processScale,
                  borderRadius: pad.shape === 'circle' || pad.shape === 'oval' ? '9999px' : '2px'
                }}
              >
                {(showLabels || isSelected) && (
                  <span className="absolute inset-0 flex items-center justify-center text-[4px] font-mono text-white/50 pointer-events-none">{pad.id}</span>
                )}
              </div>
            );
          })}
       </div>
     </motion.div>
  );
}, (prev, next) => {
  if (prev.previewStatus !== next.previewStatus ||
      prev.isSelected !== next.isSelected ||
      prev.processScale !== next.processScale ||
      prev.showLabels !== next.showLabels ||
      prev.isFCuVisible !== next.isFCuVisible ||
      prev.isBCuVisible !== next.isBCuVisible ||
      prev.isReadOnly !== next.isReadOnly ||
      prev.isLocked !== next.isLocked ||
      prev.zoom !== next.zoom ||
      prev.minX !== next.minX ||
      prev.minY !== next.minY ||
      prev.comp.id !== next.comp.id ||
      prev.comp.x !== next.comp.x ||
      prev.comp.y !== next.comp.y ||
      prev.comp.rotation !== next.comp.rotation ||
      prev.comp.layer !== next.comp.layer ||
      prev.comp.designator !== next.comp.designator) {
    return false;
  }
  return true;
});
