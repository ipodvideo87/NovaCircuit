import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useProjectStore } from '../lib/core/store';
import { ConstraintRuntime } from '../lib/constraints/constraintRuntime';
import { 
  ConstraintType, 
  ConstraintScope, 
  ConstraintSource, 
  EngineeringConstraint 
} from '../lib/constraints/constraintSchemas';
import { 
  ShieldAlert, 
  Plus, 
  Check, 
  X, 
  Grid, 
  AlertTriangle, 
  Scale, 
  Tag, 
  Info, 
  Sparkles,
  Zap,
  Flame,
  Binary
} from 'lucide-react';

export const ConstraintInspector: React.FC = () => {
  const { graph, setGraph } = useProjectStore();

  // Instantiate live runtime
  const constraintRuntime = useMemo(() => new ConstraintRuntime(graph), [graph]);
  const activeConstraints = useMemo(() => constraintRuntime.getGraph().getAllConstraints(), [constraintRuntime]);
  const conflictsList = useMemo(() => constraintRuntime.findConflicts(), [constraintRuntime]);

  // Input states for registering a custom constraint manually
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<ConstraintType>(ConstraintType.NETCLASS);
  const [newScope, setNewScope] = useState<ConstraintScope>(ConstraintScope.NETCLASS);
  const [newTarget, setNewTarget] = useState("");
  const [minWidth, setMinWidth] = useState("0.25");
  const [minSpacing, setMinSpacing] = useState("0.25");
  const [targetImpedance, setTargetImpedance] = useState("90");
  const [priority, setPriority] = useState("50");
  const [description, setDescription] = useState("");

  // Testing Resolver state for specific net names
  const [testNetId, setTestNetId] = useState("");
  const [testClassName, setTestClassName] = useState("");
  const [resolvedRules, setResolvedRules] = useState<any | null>(null);

  // Available nets to test derived rules
  const availableNets = useMemo(() => {
    return graph.nets.map(n => n.name).filter(Boolean) as string[];
  }, [graph]);

  const handleCreateConstraint = (e: React.FormEvent) => {
    e.preventDefault();

    const now = Date.now();
    const parameters: Record<string, any> = {};

    if (newType === ConstraintType.NETCLASS) {
      parameters.minWidth = parseFloat(minWidth) || 0.2;
      parameters.preferredWidth = (parseFloat(minWidth) || 0.2) * 1.25;
      parameters.minSpacing = parseFloat(minSpacing) || 0.2;
    } else if (newType === ConstraintType.CLEARANCE) {
      parameters.minSpacing = parseFloat(minSpacing) || 0.2;
    } else if (newType === ConstraintType.IMPEDANCE) {
      parameters.targetImpedance = parseFloat(targetImpedance) || 90;
      parameters.minWidth = parseFloat(minWidth) || 0.15;
    } else if (newType === ConstraintType.DIFF_PAIR) {
      parameters.targetImpedance = parseFloat(targetImpedance) || 90;
      parameters.spacing = parseFloat(minSpacing) || 0.15;
      parameters.width = parseFloat(minWidth) || 0.15;
    } else if (newType === ConstraintType.CURRENT_REQMNT) {
      parameters.currentAmps = 3.0;
      parameters.minWidth = 1.0;
    } else {
      parameters.minSpacing = parseFloat(minSpacing) || 0.2;
    }

    const compiled: EngineeringConstraint = {
      id: `c-manual-${now}`,
      type: newType,
      scope: newScope,
      target: newTarget.toUpperCase().trim() || "DEFAULT",
      parameters,
      priority: parseInt(priority) || 50,
      source: ConstraintSource.USER,
      isLocked: false,
      description: description.trim() || `User manual override constraint rule.`,
      createdAt: now
    };

    const updatedGraph = constraintRuntime.addConstraint(compiled);
    setGraph(updatedGraph);
    
    // Reset forms
    setShowAddForm(false);
    setNewTarget("");
    setDescription("");
  };

  const handleDeleteConstraint = (id: string) => {
    const updatedGraph = constraintRuntime.removeConstraint(id);
    setGraph(updatedGraph);
  };

  const handleEvaluateResolver = () => {
    if (!testNetId) return;
    const rules = constraintRuntime.getResolver().resolveNetRules(
      testNetId, 
      testClassName || undefined, 
      150, 150 // coordinate test default
    );
    setResolvedRules(rules);
  };

  const typeColorClasses: Record<ConstraintType, string> = {
    [ConstraintType.NETCLASS]: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    [ConstraintType.CLEARANCE]: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    [ConstraintType.IMPEDANCE]: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    [ConstraintType.DIFF_PAIR]: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    [ConstraintType.SKEW_MATCH]: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    [ConstraintType.CREEPAGE]: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    [ConstraintType.THERMAL]: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    [ConstraintType.EMI_REGION]: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    [ConstraintType.KEEPOUT]: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    [ConstraintType.PLACEMENT_REGION]: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    [ConstraintType.MANUFACTURING]: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
    [ConstraintType.VIA_RESTRICTION]: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    [ConstraintType.LAYER_RESTRICTION]: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    [ConstraintType.CURRENT_REQMNT]: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    [ConstraintType.RETURN_PATH]: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    [ConstraintType.RF_ISOLATION]: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    [ConstraintType.AI_INTENT]: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
    [ConstraintType.OPTIMIZATION_WEIGHT]: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  };

  return (
    <div id="constraint-inspector-card" className="w-full bg-neutral-950 border border-white/10 rounded-xl p-4 flex flex-col gap-4 font-sans text-xs text-gray-300">
      
      {/* HUD Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Scale size={14} className="text-emerald-400" />
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest leading-none">Unified Constraint Manager</h3>
            <p className="text-[10px] text-gray-500 font-sans mt-1">Govern routing rules, match impedances, prevent spacing conflicts.</p>
          </div>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={`p-1.5 px-3 rounded-lg border text-[9px] font-black uppercase transition flex items-center gap-1 shrink-0 ${
            showAddForm 
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}
        >
          {showAddForm ? <X size={10} /> : <Plus size={10} />}
          {showAddForm ? 'Cancel' : 'Add Rule'}
        </button>
      </div>

      {/* Slide down Add physical constraint inline HUD */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form 
            id="add-constraint-form"
            onSubmit={handleCreateConstraint}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
            className="bg-neutral-900 border border-white/5 rounded-xl p-3 space-y-3 shrink-0"
          >
            <div className="text-[9px] text-gray-400 font-black tracking-widest uppercase">Create New Design Rule override</div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[8px] text-gray-500 font-extrabold uppercase">Rule Type</label>
                <select 
                  value={newType}
                  onChange={e => setNewType(e.target.value as ConstraintType)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-mono"
                >
                  {Object.values(ConstraintType).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[8px] text-gray-500 font-extrabold uppercase">Scope Range</label>
                <select 
                  value={newScope}
                  onChange={e => setNewScope(e.target.value as ConstraintScope)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-mono"
                >
                  {Object.values(ConstraintScope).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[8px] text-gray-500 font-extrabold uppercase">Target name string (e.g. "GND", "POWER")</label>
                <input 
                  type="text"
                  placeholder="Target key identifier..."
                  value={newTarget}
                  onChange={e => setNewTarget(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-mono uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[8px] text-gray-500 font-extrabold uppercase">Priority index (0-100)</label>
                <input 
                  type="number"
                  min="0"
                  max="100"
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-mono"
                />
              </div>
            </div>

            {/* Context dependent settings */}
            <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-2">
              {newType !== ConstraintType.CLEARANCE && (
                <div className="space-y-1">
                  <label className="text-[8px] text-gray-500 font-extrabold uppercase">Trace Width (mm)</label>
                  <input 
                    type="text"
                    value={minWidth}
                    onChange={e => setMinWidth(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-mono"
                  />
                </div>
              )}

              {newType !== ConstraintType.IMPEDANCE && (
                <div className="space-y-1">
                  <label className="text-[8px] text-gray-500 font-extrabold uppercase">Clearance (mm)</label>
                  <input 
                    type="text"
                    value={minSpacing}
                    onChange={e => setMinSpacing(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-mono"
                  />
                </div>
              )}

              {(newType === ConstraintType.IMPEDANCE || newType === ConstraintType.DIFF_PAIR) && (
                <div className="space-y-1">
                  <label className="text-[8px] text-gray-500 font-extrabold uppercase">Impedance (Ω)</label>
                  <input 
                    type="text"
                    value={targetImpedance}
                    onChange={e => setTargetImpedance(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-mono"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[8px] text-gray-500 font-extrabold uppercase">Abstract Description</label>
              <input 
                type="text"
                placeholder="Brief justification summary..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-sans"
              />
            </div>

            <button 
              type="submit"
              className="w-full p-2 bg-emerald-500 text-black font-black uppercase text-[9.5px] rounded-lg hover:bg-emerald-400 transition"
            >
              Commit Constraint Rule
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Constraint Static Overlaps / Conflicts Diagnosis Panel */}
      {conflictsList.length > 0 && (
        <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-3 space-y-2 shrink-0">
          <div className="text-[10px] font-black text-rose-400 tracking-wider uppercase flex items-center gap-1">
            <AlertTriangle size={12} /> SPACING/OVERLAP CONFLICTS DETECTED ({conflictsList.length})
          </div>
          <div className="space-y-1.5 max-h-24 overflow-y-auto">
            {conflictsList.map(c => (
              <div key={c.id} className="p-2 bg-neutral-900/60 border border-rose-500/10 rounded-lg leading-relaxed text-[8.5px]">
                <div className="text-gray-300 font-sans"><span className="text-rose-400 font-bold">&#10006; </span>{c.message}</div>
                <div className="text-gray-500 italic font-sans mt-0.5">&rarr; ResolutionHint: {c.resolutionHint}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Constraints Ledger Main panel */}
      <div className="space-y-2">
        <div className="text-[10px] tracking-widest uppercase font-black text-gray-400">Governance Ledger ({activeConstraints.length})</div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {activeConstraints.length === 0 ? (
            <div className="p-4 bg-neutral-900/20 border border-dashed border-white/5 rounded-xl text-center text-gray-500 italic font-sans text-[9px]">No custom constraints specified. Standard JLCPCB manufacturing standards applied.</div>
          ) : (
            activeConstraints.map(c => {
              const badgeClass = typeColorClasses[c.type] || "bg-neutral-800 text-gray-400 border-white/5";

              return (
                <div key={c.id} className="p-2.5 bg-neutral-900/40 border border-white/5 hover:border-white/10 rounded-lg flex items-start gap-2.5 justify-between transition leading-snug">
                  
                  <div className="flex items-start gap-2 max-w-[80%]">
                    <div className="p-1 rounded bg-black/40 border border-white/5 shrink-0 mt-0.5">
                      <Binary size={10} className="text-gray-400" />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`text-[7px] uppercase font-black px-1.5 py-0.2 rounded font-mono border ${badgeClass}`}>{c.type}</span>
                        <span className="text-[6.5px] uppercase bg-white/5 text-gray-500 px-1 rounded font-mono font-bold shrink-0">{c.scope}</span>
                      </div>

                      <div className="font-extrabold text-[10px] text-white">
                        Target Name: <span className="font-mono text-cyan-400 uppercase font-bold">{c.target || '* (Global default)'}</span>
                      </div>

                      <p className="text-[8px] text-gray-400 italic" title={c.description}>
                        {c.description || 'Continuous layout safety monitoring rule.'}
                      </p>

                      <div className="flex items-center gap-2 border-t border-white/5 pt-1 mt-1 font-mono text-[7px] text-gray-500 flex-wrap">
                        {Object.entries(c.parameters).map(([k, v]) => (
                          <div key={k}>{k}: <span className="text-gray-300 font-bold">{JSON.stringify(v)}</span></div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                    <span className="text-[7.5px] font-black text-emerald-400 font-mono">P: {c.priority}</span>
                    <span className="text-[6px] uppercase font-bold text-gray-500 font-mono bg-neutral-800 px-1 rounded">{c.source}</span>
                    {!c.isLocked && (
                      <button 
                        onClick={() => handleDeleteConstraint(c.id)}
                        className="p-1 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition mt-1"
                        title="Delete this constraint"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>

      <hr className="border-white/5 text-center leading-none italic text-gray-600 text-[6px] uppercase tracking-widest block"></hr>

      {/* Cumulative Rules dynamic solver test bench */}
      <div className="space-y-2">
        <div className="text-[10px] tracking-widest uppercase font-black text-gray-400">Rules Resolver Testbench</div>
        
        <div className="bg-neutral-900 border border-white/5 rounded-xl p-3 space-y-3">
          <p className="text-[9px] text-gray-400 font-sans leading-relaxed">Enter a net and class name to simulate the live multi-layer constraint solver output.</p>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[8px] text-gray-500 font-extrabold uppercase">Test Net ID</label>
              <select 
                value={testNetId}
                onChange={e => setTestNetId(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-mono uppercase"
              >
                <option value="">-- Choose Net --</option>
                {availableNets.map(net => (
                  <option key={net} value={net}>{net}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[8px] text-gray-500 font-extrabold uppercase">Derived NetClass Override</label>
              <input 
                type="text"
                placeholder="e.g. NETCLASS"
                value={testClassName}
                onChange={e => setTestClassName(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[10px] text-gray-200 outline-none focus:border-emerald-500 transition font-mono uppercase"
              />
            </div>
          </div>

          <button
            onClick={handleEvaluateResolver}
            disabled={!testNetId}
            className="w-full p-2 bg-neutral-800 border border-white/5 text-[9.5px] font-black uppercase text-white rounded-lg hover:bg-neutral-700 disabled:opacity-30 disabled:pointer-events-none transition"
          >
            Solve Cumulative Guidelines
          </button>

          {resolvedRules && (
            <div className="p-2 bg-black/60 border border-white/5 rounded-lg space-y-1 text-[8.5px] font-mono select-all">
              <div className="text-gray-500 uppercase tracking-widest font-black text-[7.5px] border-b border-white/5 pb-1 mb-1">CUMULATIVE GEOMETRY OUTPUTS</div>
              <div className="text-gray-400">Min Trace Width: <span className="text-white font-bold">{resolvedRules.minWidth.toFixed(3)}mm</span></div>
              <div className="text-gray-400">Pref Route Width: <span className="text-white font-bold">{resolvedRules.preferredWidth.toFixed(3)}mm</span></div>
              <div className="text-gray-400">Max Spacing Clearance: <span className="text-white font-bold">{resolvedRules.minSpacing.toFixed(3)}mm</span></div>
              <div className="text-gray-400">Allowed Board Layers: <span className="text-white font-bold">{resolvedRules.allowedLayers.join(', ')}</span></div>
              <div className="text-gray-400">Via Drill Size: <span className="text-white font-bold">{resolvedRules.viaDrillSize.toFixed(3)}mm</span></div>
              <div className="text-gray-400">Via Pad Size: <span className="text-white font-bold">{resolvedRules.viaPadSize.toFixed(3)}mm</span></div>
              {resolvedRules.impedanceOhms !== undefined && (
                <div className="text-pink-400">Match Impedance: <span className="font-bold">{resolvedRules.impedanceOhms}Ω</span></div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
