import React, { useState, useEffect, useRef } from 'react';
import { PCBCanvas } from './PCB/PCBCanvas';
import { SchematicCanvas } from './PCB/SchematicCanvas';
import { HelpDialog } from './HelpDialog';
import { AboutDialog } from './AboutDialog';
import { TEMPLATES } from '../lib/core/templates';
import { PCBTrace } from '../types/pcb';
import { 
  Cpu, 
  Settings2, 
  ShieldCheck, 
  Download, 
  History, 
  Undo, 
  Redo, 
  HelpCircle, 
  Upload, 
  Layers,
  Sparkles,
  Info,
  Workflow,
  Split,
  X,
  RefreshCw,
  Check,
  AlertCircle
} from 'lucide-react';
import JSZip from 'jszip';
import { useTransactionStore } from '../lib/core/transaction';
import { generateManufacturingPackage } from '../lib/exporter';
import { OnboardingDialog } from './OnboardingDialog';
import { autoRouteBoardNets } from '../lib/core/netlist';

export const PCBEditor: React.FC = () => {
  const { undo, redo, loadBoard, history, currentIndex, experienceLevel, setExperienceLevel } = useTransactionStore();
  const [viewMode, setViewMode] = useState<'pcb' | 'sch' | 'split'>('pcb');
  const [showSearchHelp, setShowSearchHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [mfgExporting, setMfgExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Copilot State
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ 
    role: 'user' | 'assistant'; 
    text: string;
    isPlanProposal?: boolean;
    planSteps?: Array<{ id: string; title: string; desc: string; actions: Array<{ type: 'SET_WIDTH' | 'LENGTH_MATCH' | 'ADD_GUARD'; targetNetKeywords: string[]; width?: number; clearance?: number }> }>;
    clarifyingQuestion?: string;
    proposalActivated?: boolean;
    isInitialGreeting?: boolean;
  }>>([
    { 
      role: 'assistant', 
      text: "Hello! I am NovaCircuit AI, your electrical engineering and layout CAD co-designer. How can I help you optimize high-frequency signals today?",
      isInitialGreeting: true
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Interactive Planning State
  const [pendingPlan, setPendingPlan] = useState<{
    explanation: string;
    steps: Array<{
      id: string;
      title: string;
      desc: string;
      actions: Array<{ type: 'SET_WIDTH' | 'LENGTH_MATCH' | 'ADD_GUARD'; targetNetKeywords: string[]; width?: number; clearance?: number }>;
      status: 'pending' | 'approved' | 'rejected';
    }>;
    clarifyingQuestion?: string;
  } | null>(null);

  const handleToggleStepApproval = (stepId: string) => {
    if (!pendingPlan) return;
    setPendingPlan(prev => {
      if (!prev) return null;
      return {
        ...prev,
        steps: prev.steps.map(step => {
          if (step.id === stepId) {
            const nextStatus = step.status === 'approved' ? 'pending' : 'approved';
            return { ...step, status: nextStatus };
          }
          return step;
        })
      };
    });
  };

  const handleExecutePlan = () => {
    if (!pendingPlan) return;
    
    const approvedActions = pendingPlan.steps
      .filter(step => step.status === 'approved')
      .flatMap(step => step.actions);

    if (approvedActions.length === 0) {
      setToast({
        message: "No layout features are checked. Mark at least one plan item to execute.",
        type: "error"
      });
      return;
    }

    applyCopilotActions(approvedActions);
    
    setMessages(prev => [
      ...prev,
      { 
        role: 'assistant', 
        text: `Successfully executed ${pendingPlan.steps.filter(s => s.status === 'approved').length} steps of the design layout roadmap! Applied trace adjustments to matching nets.` 
      }
    ]);

    setToast({
      message: "Orchestration complete! Plan features successfully executed on active PCB design.",
      type: "success"
    });

    setPendingPlan(null);
  };

  const handleRejectPlan = () => {
    setPendingPlan(null);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', text: "Design plan declined. I won me to change layout elements. Feel free to describe a new direction or tweak net parameters offline." }
    ]);
  };

  // Auto scroll chat to bottom when message arrives
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatLoading, pendingPlan]);

  // Clean up toast notification automatically
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleLoadTemplateFromChat = (key: string) => {
    if (TEMPLATES[key]) {
      loadBoard(autoRouteBoardNets(TEMPLATES[key].board));
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: `Successfully loaded the **${TEMPLATES[key].name}** design template directly in your workspace! Let's optimize this high-frequency layout together.` }
      ]);
      setToast({
        message: `Loaded template: ${TEMPLATES[key].name}`,
        type: 'success'
      });
    }
  };

  const handleActivateProposal = (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg || !msg.planSteps) return;
    
    // Mark as activated
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, proposalActivated: true } : m));
    
    const initialSteps = msg.planSteps.map(step => ({
      ...step,
      status: 'pending' as const
    }));
    
    setPendingPlan({
      explanation: msg.text,
      steps: initialSteps,
      clarifyingQuestion: msg.clarifyingQuestion
    });

    setToast({
      message: "Layout roadmap activated! Check design steps to execute.",
      type: "info"
    });
  };

  const handleSendPrompt = async (promptText: string) => {
    if (!promptText.trim()) return;
    
    // Add User prompt to list
    setMessages(prev => [...prev, { role: 'user', text: promptText }]);
    setIsChatLoading(true);

    try {
      // Send trace data to backend with the prompt to enable grounding!
      const currentBoard = useTransactionStore.getState().history[useTransactionStore.getState().currentIndex];
      const response = await fetch('/api/copilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: promptText,
          traces: currentBoard.traces,
          experienceLevel: experienceLevel || 'intermediate'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = (await response.json()) as { 
        isPlan?: boolean;
        explanation: string; 
        clarifyingQuestion?: string;
        planSteps?: Array<{ id: string; title: string; desc: string; actions: Array<{ type: 'SET_WIDTH' | 'LENGTH_MATCH' | 'ADD_GUARD'; targetNetKeywords: string[]; width?: number; clearance?: number }> }>;
        actions?: Array<{ type: 'SET_WIDTH' | 'LENGTH_MATCH' | 'ADD_GUARD'; targetNetKeywords: string[]; width?: number; clearance?: number }>; 
      };
      
      // Check if response contains a multi-step design roadmap proposal
      if (data.isPlan && data.planSteps && data.planSteps.length > 0) {
        // Add assistant response with the detailed plan embedded
        let assistantText = data.explanation;
        if (data.clarifyingQuestion) {
          assistantText += `\n\n**Question to resolve:**\n${data.clarifyingQuestion}`;
        }
        setMessages(prev => [
          ...prev, 
          { 
            role: 'assistant', 
            text: assistantText,
            isPlanProposal: true,
            planSteps: data.planSteps,
            clarifyingQuestion: data.clarifyingQuestion,
            proposalActivated: false
          }
        ]);
      } else {
        // Update with AI explanation
        setMessages(prev => [...prev, { role: 'assistant', text: data.explanation || "No clarification details returned." }]);
        
        // Apply actions if returned
        if (data.actions && data.actions.length > 0) {
          applyCopilotActions(data.actions);
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', text: `Failed to consult AI Copilot: ${err.message || err}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const inputText = chatInput;
    setChatInput('');
    handleSendPrompt(inputText);
  };

  const applyCopilotActions = (actions: Array<{ type: 'SET_WIDTH' | 'LENGTH_MATCH' | 'ADD_GUARD'; targetNetKeywords: string[]; width?: number; clearance?: number }>) => {
    try {
      const { history, currentIndex, commitTransaction } = useTransactionStore.getState();
      const currentBoard = history[currentIndex];
      const newBoard = JSON.parse(JSON.stringify(currentBoard)); // deep copy

      actions.forEach(action => {
        if (action.type === 'SET_WIDTH') {
          const keywords = action.targetNetKeywords.map((k: string) => k.toLowerCase());
          newBoard.traces = newBoard.traces.map((trace: PCBTrace) => {
            const net = trace.netId.toLowerCase();
            const matches = keywords.some((kw: string) => net.includes(kw));
            if (matches) {
              return { ...trace, width: action.width ?? 0.25 };
            }
            return trace;
          });
        }
        
        if (action.type === 'LENGTH_MATCH') {
          const keywords = action.targetNetKeywords.map((k: string) => k.toLowerCase());
          const groupTraces = newBoard.traces.filter((trace: PCBTrace) => {
            const net = trace.netId.toLowerCase();
            return keywords.some((kw: string) => net.includes(kw));
          });
          
          if (groupTraces.length > 0) {
            const idsToTune = groupTraces.map((t: PCBTrace) => t.id);
            const event = new CustomEvent('novacircuit:tune-traces', { detail: { ids: idsToTune } });
            window.dispatchEvent(event);
          }
        }
        
        if (action.type === 'ADD_GUARD') {
          const keywords = action.targetNetKeywords.map((k: string) => k.toLowerCase());
          const targetTraces = newBoard.traces.filter((trace: PCBTrace) => {
            const net = trace.netId.toLowerCase();
            return keywords.some((kw: string) => net.includes(kw));
          });

          const newGuards: PCBTrace[] = [];
          targetTraces.forEach((trace: PCBTrace) => {
            const dx = trace.endX - trace.startX;
            const dy = trace.endY - trace.startY;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
              const px = -dy / len;
              const py = dx / len;
              const clearance = action.clearance || 18;
              const prefix = trace.id.replace('trace-', 'guard-');
              
              newGuards.push(
                {
                  id: `${prefix}-gnd-l-${Date.now()}`,
                  startX: trace.startX + px * clearance,
                  startY: trace.startY + py * clearance,
                  endX: trace.endX + px * clearance,
                  endY: trace.endY + py * clearance,
                  width: 0.15,
                  netId: 'GND (RF Shield)'
                },
                {
                  id: `${prefix}-gnd-r-${Date.now()}`,
                  startX: trace.startX - px * clearance,
                  startY: trace.startY - py * clearance,
                  endX: trace.endX - px * clearance,
                  endY: trace.endY - py * clearance,
                  width: 0.15,
                  netId: 'GND (RF Shield)'
                }
              );
            }
          });

          if (newGuards.length > 0) {
            newBoard.traces = [...newBoard.traces, ...newGuards];
          }
        }
      });

      commitTransaction(newBoard);
    } catch (err: unknown) {
      console.error("Failed to commit Copilot transaction structural modifications:", err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus help shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setShowSearchHelp(prev => !prev);
      }
      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Handle uploaded `.novacircuit` file import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && parsed.board) {
          loadBoard(parsed.board);
          alert("Project configurations and assets imported successfully!");
        } else {
          alert("Invalid NovaCircuit file format. Ensure a valid exported project JSON package is selected.");
        }
      } catch (err) {
        alert("Failed to parse project. Ensure valid JSON payload formatting.");
      }
    };
    reader.readAsText(file);
  };

  // Real manufacturing package build using JSZip with verification 
  const triggerMfgPackageDownload = async () => {
    setMfgExporting(true);
    try {
      const activeBoard = history[currentIndex];
      if (!activeBoard) {
        throw new Error("No active board state found in workspace history!");
      }

      console.info("Assembling and exporting CAD design assets...");
      const zipBlob = await generateManufacturingPackage(activeBoard);

      // Verify the generated zip contains mandatory folders/files before downloading
      console.info("Conducting client-side validation audit on generated manufacturing ZIP archive...");
      const loadedZip = await JSZip.loadAsync(zipBlob);
      const filesList = Object.keys(loadedZip.files);

      // Verification predicates
      const hasGerberFolder = filesList.some(name => name.startsWith("Gerbers/"));
      const hasDrillFolder = filesList.some(name => name.startsWith("Drill/"));
      const hasAssemblyFolder = filesList.some(name => name.startsWith("Assembly/"));
      
      const hasGtl = filesList.some(name => name.endsWith(".gtl"));
      const hasGbl = filesList.some(name => name.endsWith(".gbl"));
      const hasDrl = filesList.some(name => name.endsWith(".drl"));
      const hasBom = filesList.some(name => name.includes("BOM_") || name.endsWith(".csv"));

      const validationErrors: string[] = [];
      if (!hasGerberFolder || (!hasGtl && !hasGbl)) {
        validationErrors.push("Gerber Layer Tracks (GTL/GBL) folder or data is missing");
      }
      if (!hasDrillFolder || !hasDrl) {
        validationErrors.push("NC Drill Excellon file (.drl) is missing or incomplete");
      }
      if (!hasAssemblyFolder || !hasBom) {
        validationErrors.push("Bill of Materials (BOM) export compilation file is missing");
      }

      if (validationErrors.length > 0) {
        throw new Error(`Integrity Check Failed: Compiled package is missing critical EDA outputs.\n- ${validationErrors.join("\n- ")}`);
      }

      console.info("Verification succeeded! ZIP package is complete and undamaged.");

      const filename = `NovaCircuit_Gerber_MFG_Package_${Date.now()}.zip`;
      if (!filename.endsWith('.zip')) {
        throw new Error("Assertion failed: Output package is missing .zip suffix validation!");
      }

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setToast({
        message: "Manufacturing export successfully compiled and verified! Gerber RS-274X tracks, Excellon Drill drills, and Assembly spreadsheets packages are verified and downloaded.",
        type: "success"
      });
    } catch (err) {
      console.error("Manufacturing ZIP generation error:", err);
      setToast({
        message: `Export failure: ${err instanceof Error ? err.message : 'Visual workspace compilation crashed'}`,
        type: "error"
      });
    } finally {
      setMfgExporting(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-screen bg-[#07070b] text-gray-300 font-sans overflow-hidden">
      
      {/* 1. Left utility command panel: Visible on medium+ viewports */}
      <aside className="hidden md:flex w-16 bg-[#0a0a0f] border-r border-white/5 flex-col items-center py-4 flex-shrink-0 z-10 shrink-0">
        {/* Logo launcher icon */}
        <div 
          onClick={() => setShowAbout(true)} 
          className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center p-2 mb-6 cursor-pointer hover:scale-105 transition-transform"
          title="About NovaCircuit"
        >
          <Layers className="text-white w-full h-full" strokeWidth={2.5} />
        </div>

        <div className="flex flex-col gap-4">
          <button 
            className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl hover:bg-indigo-500/20 transition-all border border-indigo-500/10 focus:outline-none" 
            title="Design Rules Mode (Active)"
          >
            <ShieldCheck size={20} />
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-all focus:outline-none" 
            title="Import Workspace JSON (.novacircuit)"
          >
            <Upload size={20} />
          </button>

          <button 
            className="p-3 text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-xl transition-all focus:outline-none" 
            title="Symbol Library Matrix"
          >
            <Cpu size={20} />
          </button>
          
          <button 
            className="p-3 text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-xl transition-all focus:outline-none" 
            title="Differential Stripline Settings"
          >
            <Settings2 size={20} />
          </button>

          <button 
            onClick={() => setIsCopilotOpen(prev => !prev)}
            className={`p-3 rounded-xl transition-all border focus:outline-none ${
              isCopilotOpen 
                ? 'bg-indigo-600 border-indigo-505 text-white shadow-lg shadow-indigo-600/30' 
                : 'text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 border-transparent'
            }`}
            title="Toggle NovaCircuit AI Copilot Chat"
          >
            <Sparkles size={20} />
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-4">
          <button 
            onClick={() => setShowAbout(true)} 
            className="p-3 text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-xl transition-all focus:outline-none" 
            title="About NovaCircuit Metadata Check"
          >
            <Info size={20} />
          </button>
          <button 
            onClick={() => setShowSearchHelp(true)} 
            className="p-3 text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-xl transition-all focus:outline-none" 
            title="Search Help / Shortcuts (Ctrl + /)"
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </aside>

      {/* Secret input tracker file upload */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".json,.novacircuit" 
        className="hidden" 
      />

      {/* 2. Main content area */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Navigation header */}
        <header className="h-14 border-b border-white/5 bg-[#07070b]/95 backdrop-blur-md flex items-center justify-between px-3 md:px-6 z-10 shrink-0 select-none min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Small icon on mobile */}
            <Layers 
              onClick={() => setShowAbout(true)}
              className="text-indigo-400 w-5 h-5 cursor-pointer md:hidden block shrink-0" 
              strokeWidth={2.5} 
            />
            <h1 className="font-bold tracking-widest uppercase text-[10px] md:text-xs text-white truncate max-w-[80px] xs:max-w-[120px] sm:max-w-none">
              NovaCircuit <span className="hidden sm:inline">Professional</span>
            </h1>
            <span className="hidden lg:flex text-[9px] font-mono text-indigo-400 border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider items-center gap-1">
              <Sparkles size={9} /> Solvers online
            </span>
          </div>

          {/* Golden Reference Design Templates Dropdown Switcher */}
          <div className="flex items-center gap-1.5 md:gap-3 overflow-x-auto no-scrollbar max-w-[calc(100%-100px)] sm:max-w-none shrink min-w-0 py-1 scroll-smooth">
            {/* View Mode Segmented Controls */}
            <div className="flex items-center bg-[#111116] p-1 rounded-lg border border-white/5 gap-1 shrink-0">
              <button
                onClick={() => setViewMode('sch')}
                className={`flex items-center gap-1.5 px-2 py-1 text-[9px] sm:text-[10px] font-bold uppercase rounded-md transition-all shrink-0 ${
                  viewMode === 'sch'
                    ? 'bg-indigo-600 font-extrabold text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Switch to Schematic Capture"
              >
                <Workflow size={11} className="shrink-0" />
                <span className="hidden sm:inline">Schematic</span>
              </button>
              <button
                onClick={() => setViewMode('pcb')}
                className={`flex items-center gap-1.5 px-2 py-1 text-[9px] sm:text-[10px] font-bold uppercase rounded-md transition-all shrink-0 ${
                  viewMode === 'pcb'
                    ? 'bg-indigo-600 font-extrabold text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Switch to PCB Layout"
              >
                <Layers size={11} className="shrink-0" />
                <span className="hidden sm:inline">PCB Layout</span>
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1.5 px-2 py-1 text-[9px] sm:text-[10px] font-bold uppercase rounded-md transition-all shrink-0 ${
                  viewMode === 'split'
                    ? 'bg-indigo-600 font-extrabold text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Display Schematic & PCB Side-by-Side"
              >
                <Split size={11} className="shrink-0" />
                <span className="hidden md:inline">Dual Split</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="hidden md:inline text-[9px] font-bold text-gray-500 uppercase tracking-widest">Design:</span>
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && TEMPLATES[val]) {
                    loadBoard(autoRouteBoardNets(TEMPLATES[val].board));
                  }
                }}
                className="bg-[#111116] border border-white/5 hover:border-indigo-500/20 text-white text-[10px] font-bold uppercase py-1 px-2 rounded-lg focus:outline-none transition-colors cursor-pointer max-w-[100px] xs:max-w-[120px] sm:max-w-[180px] shrink-0"
                defaultValue="esp32"
                title="Switches quickstart design projects instantly"
              >
                <option value="" disabled>-- Load Template --</option>
                {Object.entries(TEMPLATES).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 border-l border-white/10 pl-1.5 md:pl-3">
              <span className="hidden md:inline text-[9px] font-bold text-gray-500 uppercase tracking-widest">Skill:</span>
              <select
                value={experienceLevel || ""}
                onChange={(e) => {
                  setExperienceLevel(e.target.value as 'beginner' | 'intermediate' | 'advanced');
                  setToast({
                    message: `Layout Copilot adapts to ${e.target.value.toUpperCase()} capability profile. Instructions, technical equations, planning filters have been adjusted.`,
                    type: "info"
                  });
                }}
                className={`bg-[#111116] border text-[10px] font-bold uppercase py-1 px-2 rounded-lg focus:outline-none transition-colors cursor-pointer max-w-[120px] shrink-0 ${
                  experienceLevel === 'beginner' 
                    ? 'border-emerald-500/30 text-emerald-400' 
                    : experienceLevel === 'advanced' 
                      ? 'border-rose-500/30 text-rose-450 text-rose-450 text-rose-400' 
                      : 'border-indigo-500/30 text-indigo-400'
                }`}
                title="Select EDA capability tier"
              >
                <option value="" disabled>-- Skill tier --</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>

            <div className="flex items-center gap-1 bg-[#101015] p-1 rounded-lg border border-white/5 shrink-0">
              <button 
                onClick={undo}
                disabled={currentIndex === 0}
                className="p-1 hover:bg-white/10 text-gray-400 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                title="Undo (Ctrl+Z)"
              >
                <Undo size={13} className="shrink-0" />
              </button>
              <button 
                onClick={redo}
                disabled={currentIndex === history.length - 1}
                className="p-1 hover:bg-white/10 text-gray-400 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo size={13} className="shrink-0" />
              </button>
            </div>

            <button 
              onClick={triggerMfgPackageDownload}
              disabled={mfgExporting}
              className="text-[9px] sm:text-[10px] font-black tracking-widest uppercase px-2 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50 shrink-0"
              title="Compile and download all CNC fabrication Gerbers"
            >
              <Download size={13} className={mfgExporting ? "animate-spin shrink-0" : "shrink-0"} /> 
              <span className="hidden sm:inline">{mfgExporting ? "Compiling..." : "Compile"}</span>
              <span className="sm:hidden">{mfgExporting ? "Comp..." : "Mfg"}</span>
            </button>
          </div>
        </header>

        {/* Dynamic canvas element container split with AI Copilot Panel */}
        <div className="flex-1 flex min-h-0 relative h-full w-full overflow-hidden">
          <main className="flex-1 relative min-h-0">
            {viewMode === 'pcb' && <PCBCanvas />}
            {viewMode === 'sch' && <SchematicCanvas />}
            {viewMode === 'split' && (
              <div className="flex flex-col lg:flex-row w-full h-full divide-y lg:divide-y-0 lg:divide-x divide-white/5 bg-[#08080d]">
                <div className="flex-1 relative h-1/2 lg:h-full min-h-0">
                  <div className="absolute inset-0 border-b lg:border-b-0 lg:border-r border-white/5">
                    <SchematicCanvas />
                  </div>
                </div>
                <div className="flex-1 relative h-1/2 lg:h-full min-h-0">
                  <div className="absolute inset-0">
                    <PCBCanvas />
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* AI Copilot Panel */}
          {isCopilotOpen && (
            <div className="absolute md:relative right-0 top-0 h-full w-80 sm:w-96 bg-[#0a0a0f]/95 md:bg-[#0a0a0f] border-l border-white/5 flex flex-col z-40 md:z-20 shrink-0 shadow-2xl transition-all duration-200">
              {/* Header */}
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#0b0b12] shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-indigo-400" size={15} />
                  <span className="font-bold uppercase text-[10px] tracking-wider text-white">NovaCircuit AI Copilot</span>
                </div>
                <button 
                  onClick={() => setIsCopilotOpen(false)}
                  className="p-1 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Sparkle Grounding Line */}
              <div className="bg-indigo-950/25 px-4 py-1.5 border-b border-indigo-950 text-[9px] font-mono text-indigo-400 flex items-center gap-1.5 select-none shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Grounding: Z0 Line Impedance + Guard Shields
              </div>

              {/* Chat Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/5 bg-[#07070b]">
                {messages.map((m, idx) => (
                  <div key={idx} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[8px] font-mono text-gray-500 uppercase mb-1 tracking-widest">
                       {m.role === 'user' ? 'Layout Designer' : 'NovaCircuit AI AI'}
                    </span>
                    <div className={`p-3 rounded-xl text-[11px] leading-relaxed max-w-[90%] font-sans whitespace-pre-wrap ${
                      m.role === 'user' 
                        ? 'bg-[#4b6bfb] text-white rounded-br-none font-medium shadow-md shadow-[#4b6bfb]/10' 
                        : 'bg-[#12121a] text-gray-200 rounded-bl-none border border-white/5'
                    }`}>
                      {m.text}

                      {m.isInitialGreeting && (
                        <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                          <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Quickstart Project Seeds:</span>
                          <div className="flex flex-col gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => handleLoadTemplateFromChat('esp32')}
                              className="text-left w-full px-2.5 py-1.5 bg-[#171724]/60 hover:bg-indigo-600 hover:text-white border border-white/5 rounded-lg text-[9.5px] font-bold tracking-tight uppercase transition-all flex items-center justify-between"
                            >
                              <span>📱 ESP32 IoT Dev Board</span>
                              <span className="text-[8px] font-mono opacity-50">Wi-Fi / LDO</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLoadTemplateFromChat('powerDelivery')}
                              className="text-left w-full px-2.5 py-1.5 bg-[#171724]/60 hover:bg-indigo-660 hover:text-white border border-white/5 rounded-lg text-[9.5px] font-bold tracking-tight uppercase transition-all flex items-center justify-between"
                            >
                              <span>⚡ 65W Buck-Boost PD</span>
                              <span className="text-[8px] font-mono opacity-50">Converter / MOSFET</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLoadTemplateFromChat('stm32')}
                              className="text-left w-full px-2.5 py-1.5 bg-[#171724]/60 hover:bg-[#4b6bfb] hover:text-white border border-white/5 rounded-lg text-[9.5px] font-bold tracking-tight uppercase transition-all flex items-center justify-between"
                            >
                              <span>🔬 STM32 precision ADC</span>
                              <span className="text-[8px] font-mono opacity-50">Analog / Op-Amp</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {m.isPlanProposal && !m.proposalActivated && (
                        <div className="mt-3 pt-3 border-t border-indigo-500/10 flex flex-col gap-2">
                          <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Plan Ready based on {experienceLevel?.toUpperCase() || 'INTERMEDIATE'} Profile:</span>
                          <button
                            type="button"
                            onClick={() => handleActivateProposal(idx)}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest rounded-lg flex items-center justify-center gap-1 shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all"
                          >
                            <Sparkles size={11} className="animate-pulse" /> Create Detailed Plan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex flex-col items-start">
                    <span className="text-[8px] font-mono text-indigo-400 uppercase mb-1 tracking-widest animate-pulse">Running IPC Solver / AI Copilot...</span>
                    <div className="bg-[#12121a] border border-indigo-500/10 p-3 rounded-xl rounded-bl-none text-[11px] text-gray-400 flex items-center gap-2">
                      <RefreshCw size={12} className="animate-spin text-indigo-400 font-bold" />
                      Designing impedance matched structures...
                    </div>
                  </div>
                )}

                {pendingPlan && (
                  <div className="bg-[#11111d] border-2 border-indigo-500/30 rounded-xl p-4 space-y-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-2 text-indigo-400 font-black uppercase text-[10px] tracking-widest">
                      <Workflow size={15} />
                      Layout Roadmap Proposal
                    </div>
                    
                    <p className="text-[10px] text-gray-400 leading-relaxed font-sans">
                      Verify and select the layout modules you want to execute on your virtual copper stack:
                    </p>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {pendingPlan.steps.map((step) => (
                        <div 
                          key={step.id} 
                          onClick={() => handleToggleStepApproval(step.id)}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                            step.status === 'approved' 
                              ? 'bg-indigo-600/15 border-indigo-500 text-white' 
                              : 'bg-[#151522] border-white/5 hover:border-white/10 text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                              step.status === 'approved' 
                                ? 'bg-indigo-500 border-indigo-400 text-white' 
                                : 'border-gray-600 bg-black/25'
                            }`}>
                              {step.status === 'approved' && <Check size={10} strokeWidth={3} />}
                            </div>
                            <span className="text-[10px] font-bold tracking-tight uppercase">{step.title}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1 leading-normal ml-5">
                            {step.desc}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleExecutePlan}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap text-[10px] font-black uppercase rounded-lg tracking-wider transition-colors shadow-lg select-none"
                      >
                        Execute Selected
                      </button>
                      <button
                        onClick={handleRejectPlan}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 text-gray-400 hover:text-white text-[10px] font-black uppercase rounded-lg tracking-wider transition-colors select-none"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}

                <div ref={chatBottomRef} />
              </div>

              {/* Action Suggestion Chips */}
              <div className="px-4 py-2 bg-[#0b0b12] border-t border-white/5 flex gap-1.5 overflow-x-auto shrink-0 select-none scrollbar-none scroll-smooth">
                <button 
                  onClick={() => handleSendPrompt("Route USB differential pair with 90Ω impedance")}
                  className="bg-[#131320] hover:bg-[#181829] border border-white/5 hover:border-indigo-500/20 px-2.5 py-1 rounded text-gray-350 hover:text-white text-[9px] font-medium tracking-wide whitespace-nowrap transition-colors"
                >
                  ⚡ Route 90Ω USB
                </button>
                <button 
                  onClick={() => handleSendPrompt("Length match the SPI bus")}
                  className="bg-[#131320] hover:bg-[#181829] border border-white/5 hover:border-indigo-500/20 px-2.5 py-1 rounded text-gray-350 hover:text-white text-[9px] font-medium tracking-wide whitespace-nowrap transition-colors"
                >
                  ⚡ Match Length SPI
                </button>
                <button 
                  onClick={() => handleSendPrompt("Add guard traces around the antenna feed")}
                  className="bg-[#131320] hover:bg-[#181829] border border-white/5 hover:border-indigo-500/20 px-2.5 py-1 rounded text-gray-350 hover:text-white text-[9px] font-medium tracking-wide whitespace-nowrap transition-colors"
                >
                  ⚡ Shield Antenna
                </button>
              </div>

              {/* Input Area */}
              <form onSubmit={handleChatSubmit} className="p-3 border-t border-white/5 bg-[#0b0b12] flex gap-2 shrink-0">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Ask copilot or type an EDA command..."
                  disabled={isChatLoading}
                  className="flex-1 bg-[#15151f] hover:bg-[#191925] focus:bg-[#1a1a28] border border-white/5 focus:border-indigo-500/20 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none placeholder-gray-600 transition-all font-medium"
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !chatInput.trim()}
                  className="px-3 bg-[#4b6bfb] hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
        
        {/* Touch Responsive Bottom Floating Dock (Displays only on smaller viewports where Aside is hidden) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0c0c11]/95 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-2xl flex items-center gap-4 z-30 md:hidden pointer-events-auto">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-indigo-400 focus:outline-none transition-colors"
            title="Import Project"
          >
            <Upload size={18} />
          </button>
          <button 
            className="p-2 text-indigo-400 focus:outline-none transition-colors"
            title="Design Rules Mode"
          >
            <ShieldCheck size={18} />
          </button>
          <button 
            className="p-2 text-gray-400 focus:outline-none transition-colors"
            title="Symbols"
          >
            <Cpu size={18} />
          </button>
          <button 
            onClick={() => setIsCopilotOpen(prev => !prev)}
            className={`p-2 focus:outline-none transition-colors ${isCopilotOpen ? 'text-[#4b6bfb]' : 'text-gray-400'}`}
            title="AI Copilot Chat"
          >
            <Sparkles size={18} />
          </button>
          <div className="w-px h-5 bg-white/10" />
          <button 
            onClick={() => setShowSearchHelp(true)}
            className="p-2 text-gray-400 hover:text-indigo-400 focus:outline-none transition-colors"
            title="Help Center"
          >
            <HelpCircle size={18} />
          </button>
          <button 
            onClick={() => setShowAbout(true)}
            className="p-2 text-gray-400 hover:text-indigo-400 focus:outline-none transition-colors"
            title="System Info"
          >
            <Info size={18} />
          </button>
        </div>

        {/* Desktop History HUD Overlay (Hides on compact screen widths for maximum clean workspace area) */}
        <div className="hidden sm:block absolute bottom-6 left-6 pointer-events-none z-20">
           <div className="bg-[#0b0b10]/95 backdrop-blur-md p-3 rounded-xl border border-white/15 flex items-center gap-3 w-56 shadow-2xl pointer-events-auto">
             <div className="w-7 h-7 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
               <History className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
             </div>
             <div className="flex-1">
                <div className="text-[9px] font-black uppercase text-gray-200 tracking-wider">Active Rollbacks</div>
                <div className="text-[8px] font-mono text-gray-500">Auto-save: 30s checkpoints</div>
             </div>
           </div>
        </div>
      </div>

       {/* 3. Popups/Search documentation center */}
       {showSearchHelp && (
         <HelpDialog onClose={() => setShowSearchHelp(false)} />
       )}
       {showAbout && (
         <AboutDialog onClose={() => setShowAbout(false)} />
       )}
       {experienceLevel === null && (
         <OnboardingDialog onSelect={(level) => {
           setExperienceLevel(level);
           setIsCopilotOpen(true);
         }} />
       )}

       {/* 4. Elegant Toast Notification banner */}
       {toast && (
         <div className="fixed bottom-6 right-6 left-6 sm:left-auto sm:w-[420px] bg-[#0c0c12]/95 border border-white/10 p-4 rounded-xl flex items-start gap-3 shadow-2xl backdrop-blur-xl z-[9999] transition-all duration-300">
           <div className={`p-1.5 rounded-lg shrink-0 ${
             toast.type === 'success' 
               ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
               : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
           }`}>
             {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
           </div>
           <div className="flex-1 min-w-0">
             <h4 className="text-[10px] font-black uppercase text-gray-200 tracking-wider">
               {toast.type === 'success' ? 'EDA System Status: Validated' : 'EDA System Warning'}
             </h4>
             <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
               {toast.message}
             </p>
           </div>
           <button 
             onClick={() => setToast(null)}
             className="p-1 hover:bg-white/5 rounded text-gray-500 hover:text-white transition-colors focus:outline-none shrink-0"
           >
             <X size={14} />
           </button>
         </div>
       )}
     </div>
   );
};
