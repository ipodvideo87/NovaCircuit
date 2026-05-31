import React, { useState, useMemo } from 'react';
import { 
  Check, 
  Layers, 
  Cpu, 
  Shuffle, 
  Settings2, 
  Sparkles,
  Link,
  ChevronRight
} from 'lucide-react';
import { ProjectGraph, PCBComponent } from '../../types';
import { cn } from '../../lib/utils';

// Standard PCB Footprint definitions with pins
const AVAILABLE_FOOTPRINTS = [
  { id: '0805', name: '0805 (Metric 2012)', type: 'SMD Passives', pinCount: 2, desc: 'Standard SMD resistor & capacitor package' },
  { id: '0603', name: '0603 (Metric 1608)', type: 'SMD Passives', pinCount: 2, desc: 'Compact high-density passive package' },
  { id: '1206', name: '1206 (Metric 3216)', type: 'SMD Passives', pinCount: 2, desc: 'High-power SMD passive package' },
  { id: 'SOT-23', name: 'SOT-23-3', type: 'Transistors/Diodes', pinCount: 3, desc: 'Standard small-outline transistor package' },
  { id: 'SOT-223', name: 'SOT-223-4', type: 'Voltage Regulators', pinCount: 4, desc: 'Medium-power regulator package with thermal tab' },
  { id: 'SOIC-8', name: 'SOIC-8 (150 mil)', type: 'Integrated Circuits', pinCount: 8, desc: 'Small Outline IC package, 1.27mm pitch' },
  { id: 'SOP-8', name: 'SOP-8 / MSOP-8', type: 'Integrated Circuits', pinCount: 8, desc: 'Mini small outline package' },
  { id: 'QFN-32', name: 'QFN-32 (5x5mm)', type: 'Integrated Circuits', pinCount: 32, desc: 'Quad Flat No-lead compact microcontroller package' },
  { id: 'QFN-64', name: 'QFN-64 (9x9mm)', type: 'Integrated Circuits', pinCount: 64, desc: 'High-density quad flat package, 0.5mm pitch' },
  { id: 'LQFP-48', name: 'LQFP-48 (7x7mm)', type: 'Integrated Circuits', pinCount: 48, desc: 'Low-profile Quad Flat Package' },
  { id: 'USB-C', name: 'USB Type-C PCB', type: 'Connectors', pinCount: 16, desc: '16-Pin hybrid USB-C receptacle footprint' },
  { id: 'HDR-1x4', name: 'Header 1x4 (2.54mm)', type: 'Connectors', pinCount: 4, desc: 'Through-hole single-row header pin' },
];

interface SymbolFootprintMapperProps {
  graph: ProjectGraph;
  onUpdateComponentFootprint: (componentId: string, footprint: string) => void;
  onClose: () => void;
}

export const SymbolFootprintMapper: React.FC<SymbolFootprintMapperProps> = React.memo(function SymbolFootprintMapper({
  graph,
  onUpdateComponentFootprint,
  onClose,
}) {
  const [selectedCompId, setSelectedCompId] = useState<string | null>(
    graph.components[0]?.id || null
  );
  
  const [selectedFootprintId, setSelectedFootprintId] = useState<string>('');

  // Find currently active component definition
  const selectedComp = useMemo(() => {
    return graph.components.find(c => c.id === selectedCompId) || null;
  }, [graph.components, selectedCompId]);

  // Set default package selection when component changes
  React.useEffect(() => {
    if (selectedComp) {
      setSelectedFootprintId(selectedComp.footprint);
    }
  }, [selectedCompId, selectedComp]);

  // Filter footprints compatible or logical for the category
  const activePinCount = selectedComp?.pins?.length ?? 2;

  const handleApplyMapping = () => {
    if (selectedCompId && selectedFootprintId) {
      onUpdateComponentFootprint(selectedCompId, selectedFootprintId);
    }
  };

  return (
    <div className="flex flex-col h-[70vh] bg-[#09090d] text-gray-200">
      {/* HUD Bar */}
      <div className="p-3 bg-indigo-500/5 border border-indigo-500/15 rounded-xl flex items-center justify-between mb-4 text-[11px] shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-indigo-400 animate-pulse" />
          <span className="font-sans font-bold text-gray-300">NovaCircuit Symbol ↔ Footprint Pin Mapping Engine</span>
        </div>
        <span className="font-mono text-zinc-500 uppercase text-[9px] font-extrabold bg-zinc-900 border border-white/5 p-1 rounded">Netlist Compliant</span>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {/* Left Column: Component List */}
        <div className="w-56 border-r border-white/5 flex flex-col min-h-0">
          <h3 className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider mb-2 shrink-0">Components list</h3>
          <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800">
            {graph.components.map(comp => {
              const works = comp.id === selectedCompId;
              return (
                <button
                  key={comp.id}
                  onClick={() => setSelectedCompId(comp.id)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between group cursor-pointer",
                    works 
                      ? "bg-indigo-600/10 border-indigo-500 text-white" 
                      : "bg-[#111115]/50 border-white/5 hover:bg-[#15151b] text-zinc-400"
                  )}
                >
                  <div className="truncate pr-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("font-extrabold text-[11px] uppercase", works ? "text-indigo-400" : "text-zinc-300")}>
                        {comp.designator}
                      </span>
                      <span className="text-[9px] text-zinc-500 truncate">({comp.partType})</span>
                    </div>
                    <div className="text-[9px] font-mono text-zinc-500 mt-0.5 truncate">{comp.footprint}</div>
                  </div>
                  <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Column: Schematic mapping visualizer */}
        <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col justify-between overflow-hidden min-h-0 relative">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
          
          {selectedComp ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3 shrink-0">
                <div>
                  <h4 className="font-extrabold text-[12px] text-white flex items-center gap-1.5">
                    <Cpu size={14} className="text-indigo-400" />
                    {selectedComp.designator} Pinout configuration
                  </h4>
                  <p className="text-[9px] text-zinc-500 mt-0.5 font-mono">Assigned footprint pins: {activePinCount}</p>
                </div>
              </div>

              {/* Pin Map list */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                <div className="grid grid-cols-2 gap-2 text-[9px] text-zinc-500 font-extrabold mb-1">
                  <span>SCHEMATIC SYMBOL PIN</span>
                  <span>PHYSICAL FOOTPRINT PAD</span>
                </div>
                {selectedComp.pins?.map((pin, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-2 rounded-xl bg-[#131317]/50 border border-white/5 text-[10px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center bg-indigo-500/10 text-indigo-400 font-extrabold rounded-lg font-mono text-[9px]">
                        {pin.name}
                      </span>
                      <span className="text-zinc-300 capitalize">{pin.type.replace('_', ' ')}</span>
                    </div>

                    <Shuffle size={11} className="text-zinc-600 shrink-0" />

                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold font-mono">Pad {index + 1}</span>
                      <div className="w-5 h-5 flex items-center justify-center bg-emerald-500/15 text-emerald-400 rounded-lg text-[9px] font-mono font-extrabold">
                        {index + 1}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-600 italic text-[10px]">
              No component selected to inspect.
            </div>
          )}
        </div>

        {/* Right Column: Footprint Selection */}
        <div className="w-64 flex flex-col justify-between overflow-hidden min-h-0">
          <div className="flex-1 flex flex-col min-h-0">
            <h3 className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider mb-2 shrink-0">Package Type Footprints</h3>
            
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-zinc-800">
              {AVAILABLE_FOOTPRINTS.map(fp => {
                const isSelected = fp.id === selectedFootprintId;
                const matchesPinCount = fp.pinCount === activePinCount;
                
                return (
                  <button
                    key={fp.id}
                    onClick={() => setSelectedFootprintId(fp.id)}
                    className={cn(
                      "w-full text-left p-2.5 rounded-xl border transition-all relative block cursor-pointer group",
                      isSelected 
                        ? "bg-emerald-600/10 border-emerald-500 text-white" 
                        : "bg-[#111]/40 border-white/5 hover:bg-[#14141c] text-zinc-400"
                    )}
                  >
                    <div className="flex justify-between items-center">
                      <span className={cn("font-bold text-[10px] uppercase font-mono", isSelected ? "text-emerald-400" : "text-zinc-300")}>
                        {fp.id}
                      </span>
                      {isSelected ? (
                        <Check size={11} className="text-emerald-400 shrink-0" />
                      ) : (
                        <span className="text-[8px] uppercase tracking-wider font-extrabold text-zinc-600">Pad: {fp.pinCount}</span>
                      )}
                    </div>
                    <p className="text-[9px] text-zinc-500 mt-1 leading-snug">{fp.desc}</p>
                    
                    {!matchesPinCount && activePinCount > 0 && (
                      <div className="absolute right-2 bottom-2 text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-500 px-1 rounded font-extrabold">
                        PIN MISMATCH
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-white/5 mt-3 shrink-0 space-y-2">
            <button
              onClick={handleApplyMapping}
              disabled={!selectedCompId || !selectedFootprintId || selectedFootprintId === selectedComp?.footprint}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-[10px] uppercase tracking-widest font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
            >
              <Link size={12} />
              Commit Map Re-Assignment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
