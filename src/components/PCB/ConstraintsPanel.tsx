import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { NetClass, DifferentialPair } from '../../types';
import { PCBBoard } from '../../types/pcb';

interface ConstraintsPanelProps {
  board: PCBBoard;
  activeNetClasses: NetClass[];
  selectedNetClassId: string;
  setSelectedNetClassId: (id: string) => void;
  onShowAddClassModal: () => void;
  onDeleteNetClass: (id: string) => void;
  onUpdateNetClass: (id: string, updates: any) => void;
  onAssignNetClass: (netId: string, className: string) => void;
  activeDiffPairs: DifferentialPair[];
  onShowAddDpModal: () => void;
  onDeleteDiffPair: (id: string) => void;
}

export const ConstraintsPanel: React.FC<ConstraintsPanelProps> = React.memo(function ConstraintsPanel({
  board,
  activeNetClasses,
  selectedNetClassId,
  setSelectedNetClassId,
  onShowAddClassModal,
  onDeleteNetClass,
  onUpdateNetClass,
  onAssignNetClass,
  activeDiffPairs,
  onShowAddDpModal,
  onDeleteDiffPair
}) {
  const activeClass = activeNetClasses.find(nc => nc.id === selectedNetClassId);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4 font-mono text-[10px]">
      
      {/* Part A: SELECT OR EDIT NET CLASSES */}
      <div className="space-y-2 border-b border-white/5 pb-4 shrink-0 font-sans">
        <div className="flex items-center justify-between font-mono">
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-zinc-400">NET CLASS EDITOR</span>
          <div className="flex gap-1">
            <button 
              onClick={onShowAddClassModal}
              title="Add net class"
              className="p-1 px-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded cursor-pointer transition-all flex items-center justify-center font-bold"
            >
              <Plus size={10} />
            </button>
            {selectedNetClassId !== 'nc-default' && (
              <button 
                onClick={() => onDeleteNetClass(selectedNetClassId)}
                title="Delete selected class"
                className="p-1 px-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded cursor-pointer transition-all flex items-center justify-center"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>

        <select 
          value={selectedNetClassId}
          onChange={(e) => setSelectedNetClassId(e.target.value)}
          className="w-full bg-[#141414] border border-white/10 rounded-xl p-2 text-white font-mono text-[11px] outline-none cursor-pointer"
        >
          {activeNetClasses.map(nc => (
            <option key={nc.id} value={nc.id}>{nc.name}</option>
          ))}
        </select>

        {/* FIELDS FOR THE SELECTED NET CLASS */}
        {activeClass && (
          <div className="space-y-3 mt-3 bg-[#111111]/40 border border-white/5 rounded-xl p-3 font-mono">
            {/* Inheritance Dropdown */}
            <div className="flex flex-col gap-1">
              <span className="text-[8px] text-zinc-500 font-extrabold uppercase">INHERITS FROM</span>
              <select 
                value={(activeClass as any).parentId || "DEFAULT"}
                onChange={(e) => onUpdateNetClass(selectedNetClassId, { parentId: e.target.value === "DEFAULT" ? undefined : e.target.value })}
                className="w-full bg-[#181818] border border-white/5 rounded px-1.5 py-1 text-zinc-300 text-[10px] outline-none cursor-pointer"
              >
                <option value="DEFAULT">DEFAULT Class (root)</option>
                {activeNetClasses.filter(nc => nc.id !== selectedNetClassId && nc.name !== "DEFAULT").map(nc => (
                  <option key={nc.id} value={nc.id}>{nc.name}</option>
                ))}
              </select>
            </div>

            {/* Widths values */}
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-zinc-500 font-extrabold">MIN WIDTH (mm)</span>
                <input 
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={activeClass.minWidth}
                  onChange={(e) => onUpdateNetClass(selectedNetClassId, { minWidth: parseFloat(e.target.value) || 0.1 })}
                  className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-zinc-500 font-extrabold">PREF WIDTH (mm)</span>
                <input 
                  type="number"
                  step="0.05"
                  min="0.10"
                  value={(activeClass as any).preferredWidth ?? activeClass.minWidth}
                  onChange={(e) => onUpdateNetClass(selectedNetClassId, { preferredWidth: parseFloat(e.target.value) || activeClass.minWidth })}
                  className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center font-mono"
                />
              </div>
            </div>

            {/* Clearances spacing */}
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-zinc-500 font-extrabold">CLEARANCE (mm)</span>
                <input 
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={activeClass.minSpacing}
                  onChange={(e) => onUpdateNetClass(selectedNetClassId, { minSpacing: parseFloat(e.target.value) || 0.1 })}
                  className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-zinc-500 font-extrabold">IMPEDANCE (Ω)</span>
                <input 
                  type="number"
                  step="5"
                  placeholder="None"
                  value={activeClass.impedanceOhms || ""}
                  onChange={(e) => onUpdateNetClass(selectedNetClassId, { impedanceOhms: parseInt(e.target.value) || undefined })}
                  className="bg-[#181818] text-indigo-300 border border-white/10 rounded p-1 placeholder:text-zinc-700 outline-none text-center font-mono"
                />
              </div>
            </div>

            {/* Via Config */}
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-zinc-500 font-extrabold">VIA DRILL (mm)</span>
                <input 
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={activeClass.viaSize?.drillSize ?? 0.3}
                  onChange={(e) => onUpdateNetClass(selectedNetClassId, { 
                    viaSize: { 
                      drillSize: parseFloat(e.target.value) || 0.3,
                      padSize: activeClass.viaSize?.padSize || 0.6
                    } 
                  })}
                  className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-zinc-500 font-extrabold">VIA PAD (mm)</span>
                <input 
                  type="number"
                  step="0.05"
                  min="0.2"
                  value={activeClass.viaSize?.padSize ?? 0.6}
                  onChange={(e) => onUpdateNetClass(selectedNetClassId, { 
                    viaSize: { 
                      drillSize: activeClass.viaSize?.drillSize || 0.3, 
                      padSize: parseFloat(e.target.value) || 0.6 
                    } 
                  })}
                  className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center font-mono"
                />
              </div>
            </div>

            {/* Matched Length Setup */}
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-zinc-500 font-extrabold">LENGTH TARGET (mm)</span>
                <input 
                  type="number"
                  placeholder="None"
                  value={(activeClass as any).lengthTarget || ""}
                  onChange={(e) => onUpdateNetClass(selectedNetClassId, { lengthTarget: parseFloat(e.target.value) || undefined })}
                  className="bg-[#181818] text-emerald-300 border border-white/10 rounded p-1 placeholder:text-zinc-700 outline-none text-center font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-zinc-500 font-extrabold">TOLERANCE (mm)</span>
                <input 
                  type="number"
                  step="0.1"
                  placeholder="±0.5"
                  value={(activeClass as any).lengthTolerance || ""}
                  onChange={(e) => onUpdateNetClass(selectedNetClassId, { lengthTolerance: parseFloat(e.target.value) || undefined })}
                  className="bg-[#181818] text-zinc-300 border border-white/10 rounded p-1 placeholder:text-zinc-700 outline-none text-center font-mono"
                />
              </div>
            </div>

            {/* Layer Permissions Checkboxes */}
            <div className="flex flex-col gap-1">
              <span className="text-[8px] text-zinc-500 font-extrabold uppercase">ROUTING LAYERS APPROVED</span>
              <div className="flex items-center gap-3 text-[9px] text-zinc-300 mt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={!((activeClass as any).allowedLayers?.length) || (activeClass as any).allowedLayers.includes("F.Cu")}
                    onChange={(e) => {
                      const allowed: string[] = (activeClass as any).allowedLayers || ["F.Cu", "B.Cu"];
                      const next = e.target.checked 
                        ? [...allowed, "F.Cu"] 
                        : allowed.filter(l => l !== "F.Cu");
                      onUpdateNetClass(selectedNetClassId, { allowedLayers: next.length ? next : ["F.Cu"] });
                    }}
                    className="accent-indigo-500"
                  />
                  <span>Top (F.Cu)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={!((activeClass as any).allowedLayers?.length) || (activeClass as any).allowedLayers.includes("B.Cu")}
                    onChange={(e) => {
                      const allowed: string[] = (activeClass as any).allowedLayers || ["F.Cu", "B.Cu"];
                      const next = e.target.checked 
                        ? [...allowed, "B.Cu"] 
                        : allowed.filter(l => l !== "B.Cu");
                      onUpdateNetClass(selectedNetClassId, { allowedLayers: next.length ? next : ["B.Cu"] });
                    }}
                    className="accent-indigo-500"
                  />
                  <span>Bottom (B.Cu)</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Part B: NETS ASSOCIATION SECTION */}
      <div className="space-y-2 border-b border-white/5 pb-4 max-h-48 flex flex-col min-h-0">
        <span className="text-[9px] uppercase font-extrabold tracking-widest text-zinc-400 shrink-0">ASSIGN NETS TO CLASSES</span>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 font-sans">
          {board.nets.map(net => {
            const activeClass = activeNetClasses.find(nc => nc.name === (net as any).netClass) || activeNetClasses.find(nc => nc.name === 'DEFAULT') || { id: 'nc-default', name: 'DEFAULT' };
            return (
              <div key={net.id} className="flex items-center justify-between gap-2 p-1.5 bg-[#141414]/60 border border-white/5 rounded-lg text-[9px] font-mono">
                <span className="font-bold text-white truncate max-w-[80px]" title={net.name}>{net.name}</span>
                <select
                  value={activeClass.id}
                  onChange={(e) => {
                    const newClass = activeNetClasses.find(nc => nc.id === e.target.value);
                    if (newClass) onAssignNetClass(net.id, newClass.name);
                  }}
                  className="bg-[#1c1c1c] border border-white/10 rounded px-1.5 py-0.5 text-zinc-300 max-w-[124px] outline-none cursor-pointer font-mono"
                >
                  {activeNetClasses.map(nc => (
                    <option key={nc.id} value={nc.id}>{nc.name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Part C: MATCHED DIFFERENTIAL PAIR GROUPS */}
      <div className="space-y-2 flex flex-col flex-1 min-h-0 font-sans">
        <div className="flex items-center justify-between shrink-0 font-mono">
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-zinc-400">DIFFERENTIAL PAIRS</span>
          <button 
            onClick={onShowAddDpModal}
            className="p-1 px-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded cursor-pointer transition-all flex items-center justify-center font-bold"
          >
            <Plus size={10} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 font-mono">
          {activeDiffPairs.length === 0 ? (
            <div className="text-[9px] text-zinc-655 italic py-2 leading-tight text-zinc-500">No matched pair configuration found. Click (+) to group companion signals.</div>
          ) : (
            activeDiffPairs.map(dp => {
              const posNetName = board.nets.find(n => n.id === dp.positiveNetId)?.name || 'None';
              const negNetName = board.nets.find(n => n.id === dp.negativeNetId)?.name || 'None';
              return (
                <div key={dp.id} className="p-2 border border-white/5 bg-[#111] rounded-xl relative group">
                  <div className="flex justify-between items-center border-b border-white/5 pb-1 mb-1.5">
                    <span className="font-extrabold text-[#10b981] text-[10px] uppercase tracking-wider">{dp.name}</span>
                    <button
                      onClick={() => onDeleteDiffPair(dp.id)}
                      className="text-zinc-650 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <div className="space-y-1 text-[8px] text-zinc-400">
                    <div className="flex justify-between">
                      <span>P+ SIGNAL:</span>
                      <span className="text-white font-bold">{posNetName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>N- SIGNAL:</span>
                      <span className="text-white font-bold">{negNetName}</span>
                    </div>
                    <div className="flex justify-between border-t border-white/5 pt-1 mt-1 font-bold text-zinc-500">
                      <span>W / S Target:</span>
                      <span className="text-[#10b981]">{dp.width} / {dp.spacing} mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Skew Tolerance:</span>
                      <span className="text-amber-400">±{dp.skewTolerance} mm</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
});
