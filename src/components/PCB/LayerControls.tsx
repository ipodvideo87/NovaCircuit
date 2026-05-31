import React from 'react';
import { Eye } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LayerConfig {
  id: string;
  name: string;
  color: string;
  visible: boolean;
}

interface LayerControlsProps {
  layers: LayerConfig[];
  onToggleLayer: (id: string) => void;
}

export const LayerControls: React.FC<LayerControlsProps> = React.memo(function LayerControls({
  layers,
  onToggleLayer
}) {
  return (
    <div className="space-y-4">
      <h4 className="text-[9px] uppercase tracking-[0.1em] font-extrabold text-zinc-500">Board Layers</h4>
      <div className="space-y-3">
        {layers.map(layer => (
          <div 
            key={layer.id} 
            className="flex items-center justify-between group cursor-pointer" 
            onClick={() => onToggleLayer(layer.id)}
          >
            <div className="flex items-center gap-3">
              <div className={cn("w-3 h-3 rounded-full", layer.color, !layer.visible && "opacity-20")} />
              <span className={cn("text-[11px] font-bold uppercase tracking-tight transition-colors", layer.visible ? "text-gray-300" : "text-gray-600")}>
                {layer.name}
              </span>
            </div>
            <button 
              className="opacity-0 group-hover:opacity-100 transition-opacity" 
              onClick={(e) => { 
                e.stopPropagation(); 
                onToggleLayer(layer.id); 
              }}
            >
              <Eye size={14} className={cn(layer.visible ? "text-gray-400" : "text-gray-700")} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});
