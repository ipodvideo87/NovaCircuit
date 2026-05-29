import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Sparkles, 
  Cpu, 
  Layers, 
  Zap, 
  Terminal,
  Bot,
  User,
  MoreHorizontal,
  ShieldCheck,
  AlertTriangle,
  Database,
  AlertCircle,
  Eye,
  RefreshCw,
  Check,
  Play,
  Pause,
  RotateCcw,
  BadgeInfo,
  X
} from 'lucide-react';
import { AIActionConfirm } from './AIActionConfirm';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { ProjectGraph, AIAction } from '../types';
import { ProjectGraphModel } from '../lib/core/graph';
import { validateAndApplyActions } from '../lib/actionValidation';
import { compileActionBatch } from '../lib/ai/actionCompiler';
import { RepairDiagnostic } from '../lib/ai/actionRepair';
import { EngineeringCommandRuntime, CommandRuntimeStatus } from '../lib/engineering/commandRuntime';
import { TaskNode } from '../lib/engineering/taskGraph';

import { useProjectStore } from '../lib/core/store';

interface Message {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  tasks?: string[];
  reasoning?: string;
  executableActions?: AIAction[];
  rejectedActions?: { action: any; error: string }[];
  diagnostics?: RepairDiagnostic[];
  validationErrors?: string[];
  rawResponse?: any;
}

interface NovaCopilotProps {
  onAiAction?: (actions: AIAction[], explanation?: string) => void;
  projectState?: ProjectGraph;
  onAutoRoute?: () => void;
  onSmartAuto?: () => void;
}

export default React.memo(function NovaCopilot({ onAiAction, projectState, onAutoRoute, onSmartAuto }: NovaCopilotProps) {
  // Global Store state and action triggers
  const {
    commandRuntime,
    taskNodes,
    orchestrationProgress: progressStatus,
    executeEngineeringCommand,
    runMacro,
    stepEngineeringStage,
    runAllEngineeringStages,
    rollbackEngineeringCommand,
    resumeFromCheckpoint,
    requirePro,
    incrementAIActionCount
  } = useProjectStore();

  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "Nova AI initialized. Project graph loaded. I'm ready to assist with your hardware design — and I'll always show you the credit cost before running any action. What are we building?", 
      timestamp: new Date() 
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentTask, setCurrentTask] = useState<string>('');
  const [pendingConfirm, setPendingConfirm] = useState<{ prompt: string; resolve: (confirmed: boolean) => void } | null>(null);
  const [activeMessageTabs, setActiveMessageTabs] = useState<Record<number, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const [showMemory, setShowMemory] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);

  const projectStateRef = useRef(projectState);
  useEffect(() => {
    projectStateRef.current = projectState;
  }, [projectState]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Show the confirmation dialog and wait for user response
  const requestConfirmation = (prompt: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setPendingConfirm({ prompt, resolve });
    });
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const originalInput = input;
    setInput('');

    const gLower = originalInput.toLowerCase();
    const isMacro = gLower.includes('esp32') || gLower.includes('buck') || gLower.includes('converter') || 
                    gLower.includes('differential pair') || gLower.includes('diff pair') || 
                    gLower.includes('optimize power') || gLower.includes('pdn') || gLower.includes('decoupling') || 
                    gLower.includes('motor') || gLower.includes('h-bridge') || 
                    gLower.includes('sensor') || gLower.includes('low-pass') || 
                    gLower.includes('thermal') || gLower.includes('cooling') || 
                    gLower.includes('emi') || gLower.includes('shield') || 
                    gLower.includes('auto-place') || gLower.includes('mcu support') ||
                    gLower.includes('usb-c pd') || gLower.includes('usb pd') || gLower.includes('power delivery') ||
                    gLower.includes('clock distribution') || gLower.includes('si5338') || gLower.includes('shielding');

    // Check basic copilot usage authorization BEFORE showing confirm dialog
    if (!requirePro('ai_action')) {
      return;
    }

    // Show credit confirmation dialog — no silent charges ever
    const confirmed = await requestConfirmation(originalInput);
    if (!confirmed) return;

    setIsTyping(true);
    setCurrentTask('Compiling natural language intent...');

    if (isMacro) {
      if (!requirePro('advanced_macro')) {
        setIsTyping(false);
        setCurrentTask('');
        return;
      }

      setCurrentTask('Instantiating Hierarchical task planner...');
      await new Promise(r => setTimeout(r, 450));
      
      executeEngineeringCommand(originalInput);

      const assistantMessage: Message = {
        role: 'assistant',
        content: `I have compiled a multi-stage engineering execution plan DAG to process your layout instruction: "${originalInput}".\n\nYou can now step through these stages interactively using the Orchestrator panel.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
      setCurrentTask('');
      // Macro executes as a valid copilot action, increment the counter
      await incrementAIActionCount();
      return;
    }

    try {
      // Compile the project state into a semantic text digest
      let stateContext = "";
      if (projectStateRef.current) {
        const model = new ProjectGraphModel(projectStateRef.current);
        stateContext = `\n\nCURRENT PROJECT GRAPH STATE:\n${model.getSemanticDigestForAI()}`;
      }

      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: newMessages,
          projectState: projectStateRef.current,
          stateSummary: stateContext
        })
      });

      if (!response.ok) throw new Error("API failure");
      
      const data = await response.json();

      console.log("=== COMPILER INPUT RAW RESPONSE ===", data);

      // Invoke our Structured Action Compiler
      const compiled = compileActionBatch(data.actions || [], data.content || '');

      let validationErrors: string[] = [];
      if (compiled.executableActions.length > 0 && projectStateRef.current) {
        setCurrentTask(`Dry-running transaction safety checks on ${compiled.executableActions.length} Actions...`);
        const validation = validateAndApplyActions(compiled.executableActions, projectStateRef.current);
        validationErrors = validation.errors;
        await new Promise(r => setTimeout(r, 600)); // Smooth UX transition
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.content || "Operations parsed successfully.",
        reasoning: compiled.reasoning,
        executableActions: compiled.executableActions,
        rejectedActions: compiled.rejectedActions,
        diagnostics: compiled.diagnostics,
        validationErrors,
        timestamp: new Date(),
        rawResponse: data
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (compiled.executableActions.length > 0 && onAiAction && validationErrors.length === 0) {
        console.log("=== COMMITTING COMPILED ACTIONS ===", JSON.stringify(compiled.executableActions, null, 2));
        onAiAction(compiled.executableActions, data.content || "");
      }

      await incrementAIActionCount();
    } catch (error) {
      console.error("AI Compiler Error:", error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Critical failure in hardware compiler node. Action aborted to shield board state.",
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
      setCurrentTask('');
    }
  };

  const handleStepTick = async () => {
    setIsTyping(true);
    setCurrentTask('Applying deterministic transaction safety checks...');
    await new Promise(r => setTimeout(r, 400)); // smooth visual pacing
    await stepEngineeringStage();
    setIsTyping(false);
    setCurrentTask('');
  };

  const handleRunAll = async () => {
    if (isAutoExecuting) return;
    setIsAutoExecuting(true);
    setIsTyping(true);
    setCurrentTask('Processing parallel execution DAG nodes...');
    await runAllEngineeringStages();
    setIsTyping(false);
    setCurrentTask('');
    setIsAutoExecuting(false);
  };

  const handleRollbackAll = () => {
    rollbackEngineeringCommand();
    setIsAutoExecuting(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] text-gray-200 border-l border-white/5 shadow-2xl relative overflow-hidden font-mono">
      {/* Transparent AI Credit Confirmation Dialog */}
      <AIActionConfirm
        isOpen={!!pendingConfirm}
        prompt={pendingConfirm?.prompt || ''}
        creditCost={1}
        onConfirm={() => {
          if (pendingConfirm) {
            pendingConfirm.resolve(true);
            setPendingConfirm(null);
          }
        }}
        onCancel={() => {
          if (pendingConfirm) {
            pendingConfirm.resolve(false);
            setPendingConfirm(null);
          }
        }}
      />
      {/* Agent Header */}
      <div className="p-4 border-b border-white/5 bg-[#0a0a0a] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.4)]">
              <Bot size={18} className="text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#0a0a0a]" />
          </div>
          <div>
            <h2 className="text-[12px] font-black uppercase tracking-tighter text-white leading-none">Nova AI Agent</h2>
            <div className="flex items-center gap-2 mt-1.5">
               <span className="text-[7px] text-emerald-400 font-bold uppercase py-0.5 px-1 bg-emerald-400/10 rounded">Online</span>
               <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest">Expert Mode</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="text-right hidden sm:block">
              <div className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Uptime</div>
               <div className="text-[10px] text-white tabular-nums">99.98%</div>
            </div>
         </div>
      </div>

      {/* 🛠️ Hierarchical Task Orchestrator Console */}
      {commandRuntime && progressStatus && (
        <div className="bg-[#0b0b0b] border-b border-white/5 p-4 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-indigo-400 animate-pulse" />
              <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">
                Hierarchical Task Orchestrator
              </span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-gray-500 uppercase font-bold">
                Progress:
              </span>
              <span className="text-[10px] font-mono text-indigo-400 font-extrabold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                {progressStatus.percent}%
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-505 bg-indigo-500 transition-all duration-300"
              style={{ width: `${progressStatus.percent}%` }}
            />
          </div>

          {/* Task node stages */}
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 select-none">
            {taskNodes.map(node => (
              <div 
                key={node.id} 
                className={cn(
                  "p-2 rounded border text-[11px] font-mono flex items-start gap-2 transition-all",
                  node.status === 'completed' ? "bg-emerald-500/[0.02] border-emerald-500/10 text-emerald-300/80" :
                  node.status === 'running' ? "bg-indigo-500/[0.04] border-indigo-500/20 text-indigo-300 animate-pulse" :
                  node.status === 'failed' ? "bg-rose-500/[0.02] border-rose-500/20 text-rose-300" :
                  node.status === 'skipped' ? "bg-white/[0.01] border-white/5 text-gray-600 line-through" :
                  "bg-white/[0.01] border-white/5 text-gray-400"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {node.status === 'completed' && <Check size={11} className="text-emerald-400 font-bold" />}
                  {node.status === 'running' && <RefreshCw size={11} className="text-indigo-400 animate-spin" />}
                  {node.status === 'failed' && <AlertTriangle size={11} className="text-rose-400" />}
                  {node.status === 'skipped' && <AlertCircle size={11} className="text-gray-600" />}
                  {node.status === 'pending' && <span className="w-2 m-0.5 h-2 rounded-full bg-gray-600 block" />}
                </div>

                <div className="flex-1">
                  <div className="font-bold flex items-center justify-between">
                    <span>{node.name}</span>
                    <span className="text-[8px] uppercase tracking-wider font-extrabold opacity-70">
                      {node.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-snug font-sans">
                    {node.description}
                  </p>
                  {node.error && (
                    <div className="mt-1 text-[9px] text-rose-400 font-mono leading-tight border-l border-rose-500/35 pl-1.5">
                      Verify constraint violation: {node.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Interactive controls */}
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/5">
            <button
              type="button"
              disabled={isTyping || isAutoExecuting || progressStatus.percent === 100}
              onClick={handleStepTick}
              className="px-2.5 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 disabled:opacity-30 rounded text-[10px] font-bold uppercase tracking-tight flex items-center gap-1 cursor-pointer transition-all"
            >
              <Play size={10} fill="currentColor" />
              Step Stage
            </button>

            <button
              type="button"
              disabled={isTyping || isAutoExecuting || progressStatus.percent === 100}
              onClick={handleRunAll}
              className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 disabled:opacity-30 rounded text-[10px] font-bold uppercase tracking-tight flex items-center gap-1 cursor-pointer transition-all"
            >
              <Check size={10} />
              Run All
            </button>

            <button
              type="button"
              disabled={isTyping}
              onClick={handleRollbackAll}
              className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded text-[10px] font-bold uppercase tracking-tight flex items-center gap-1 cursor-pointer transition-all ml-auto"
            >
              <RotateCcw size={10} />
              Undo Block
            </button>

            <button
              type="button"
              onClick={() => setShowMemory(!showMemory)}
              className={cn(
                "px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-tight flex items-center gap-1 cursor-pointer transition-all border",
                showMemory 
                  ? "bg-amber-400/10 border-amber-400/20 text-amber-400" 
                  : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10"
              )}
            >
              <BadgeInfo size={10} />
              Memory
            </button>

            <button
              type="button"
              onClick={() => setShowCheckpoints(!showCheckpoints)}
              className={cn(
                "px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-tight flex items-center gap-1 cursor-pointer transition-all border",
                showCheckpoints 
                  ? "bg-sky-400/10 border-sky-400/20 text-sky-400" 
                  : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10"
              )}
            >
              <Database size={10} />
              Checkpoints ({commandRuntime?.getCheckpointRuntime().getCheckpoints().length || 0})
            </button>
          </div>

          {/* Collapsible stored checkpoints panel */}
          {showCheckpoints && commandRuntime && (
            <div className="border border-white/5 rounded bg-black/50 p-3 text-[10px] mt-1 text-gray-400">
              <div className="text-[9px] uppercase font-black text-sky-400 mb-2 tracking-widest flex items-center gap-1">
                <Database size={11} />
                Staged Transaction Checkpoints
              </div>
              <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                {commandRuntime.getCheckpointRuntime().getCheckpoints().map((checkpoint, idx) => (
                  <div key={checkpoint.id} className="flex items-center justify-between border-l border-sky-500/20 pl-2 py-1">
                    <div>
                      <div className="font-bold text-gray-300">
                        CP-{idx + 1}: {checkpoint.description}
                      </div>
                      <div className="text-[8px] text-gray-500 mt-0.5">
                        ID: {checkpoint.id.substring(0, 8)} | {new Date(checkpoint.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => resumeFromCheckpoint(checkpoint.id)}
                      className="px-2 py-0.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-300 rounded text-[9px] font-bold uppercase tracking-tighter"
                    >
                      Restore
                    </button>
                  </div>
                ))}
                {commandRuntime.getCheckpointRuntime().getCheckpoints().length === 0 && (
                  <div className="text-gray-500 italic text-center py-1">No transaction checkpoints recorded yet.</div>
                )}
              </div>
            </div>
          )}

          {/* Collapsible stored intention facts panel */}
          {showMemory && commandRuntime && (
            <div className="border border-white/5 rounded bg-black/50 p-3 text-[10px] mt-1 text-gray-400">
              <div className="text-[9px] uppercase font-black text-amber-400 mb-2 tracking-widest flex items-center gap-1">
                <BadgeInfo size={11} />
                Persistent Design Intent Memory Log
              </div>
              <div className="space-y-1.5 max-h-[110px] overflow-y-auto">
                {commandRuntime.getDesignIntentMemory().getAllFacts().map(fact => (
                  <div key={fact.id} className="border-l border-amber-500/20 pl-2 py-0.5">
                    <span className="text-gray-300 font-bold">[{fact.category.toUpperCase()}]</span> {fact.intentionText}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat / Terminal Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
        {messages.map((m, i) => (
          <div key={i} className="space-y-3">
            <div className={cn(
              "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest",
              m.role === 'assistant' ? "text-indigo-400" : "text-gray-500"
            )}>
              {m.role === 'assistant' ? <Bot size={12} /> : <User size={12} />}
              {m.role === 'assistant' ? "Nova.AI" : "Developer"}
              <span className="ml-auto opacity-30 font-normal">{m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div className={cn(
              "p-4 rounded-lg text-[13px] leading-relaxed relative border",
              m.role === 'assistant' 
                ? "bg-white/[0.02] border-white/5 text-gray-300" 
                : "bg-indigo-600/[0.05] border-indigo-500/20 text-indigo-100"
            )}>
              {m.reasoning && (
                <div className="mb-4 p-3 bg-white/[0.03] border border-white/5 rounded-md">
                  <div className="text-[10px] text-gray-500 uppercase font-black mb-1.5 flex items-center gap-2">
                    <Terminal size={10} />
                    Agent Strategy Tracing
                  </div>
                  <div className="text-[11px] text-indigo-300/80 italic font-sans leading-relaxed">
                    {m.reasoning}
                  </div>
                </div>
              )}

              <div className="font-sans whitespace-pre-wrap">
                {m.content}
              </div>

              {/* Advanced Structured Action Compiler Panel */}
              {m.role === 'assistant' && (
                (() => {
                  const hasCompilerData = (m.executableActions && m.executableActions.length > 0) ||
                                           (m.rejectedActions && m.rejectedActions.length > 0) ||
                                           (m.diagnostics && m.diagnostics.length > 0);
                  if (!hasCompilerData) return null;

                  const currentTab = activeMessageTabs[i] || 'tx';
                  const totalActions = m.executableActions?.length || 0;
                  const totalDiagnostics = m.diagnostics?.length || 0;
                  const totalRejected = m.rejectedActions?.length || 0;
                  const isBlocked = m.validationErrors && m.validationErrors.length > 0;

                  return (
                    <div className="mt-5 border border-white/5 rounded bg-black/60 overflow-hidden text-[11px] font-mono">
                      {/* Compiler Panel Header */}
                      <div className="bg-[#0f0f0f] px-3 py-2 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Cpu size={12} className="text-indigo-400 animate-pulse" />
                          <span className="text-[9px] font-black uppercase text-white/90 tracking-widest">
                            AI Execution Compiler Console
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isBlocked ? "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" :
                            totalActions > 0 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-gray-600"
                          )} />
                          <span className={cn(
                            "text-[8px] font-black uppercase",
                            isBlocked ? "text-rose-400" :
                            totalActions > 0 ? "text-emerald-400" : "text-gray-500"
                          )}>
                            {isBlocked ? "dry-run blocked" : totalActions > 0 ? "autocommit passed" : "read-only chat"}
                          </span>
                        </div>
                      </div>

                      {/* Tab Selectors */}
                      <div className="flex border-b border-white/5 bg-[#0b0b0b]">
                        <button
                          type="button"
                          onClick={() => setActiveMessageTabs(prev => ({ ...prev, [i]: 'tx' }))}
                          className={cn(
                            "px-3 py-2 text-[9px] font-extrabold uppercase tracking-tight border-r border-white/5 transition-all text-left flex items-center gap-1.5",
                            currentTab === 'tx' 
                              ? "bg-white/[0.03] text-indigo-400 border-b border-b-indigo-500" 
                              : "text-gray-500 hover:text-gray-300"
                          )}
                        >
                          <Database size={10} />
                          Transaction Stream ({totalActions})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMessageTabs(prev => ({ ...prev, [i]: 'repair' }))}
                          className={cn(
                            "px-3 py-2 text-[9px] font-extrabold uppercase tracking-tight border-r border-white/5 transition-all text-left flex items-center gap-1.5",
                            currentTab === 'repair' 
                              ? "bg-white/[0.03] text-indigo-400 border-b border-b-indigo-500" 
                              : "text-gray-500 hover:text-gray-400"
                          )}
                        >
                          <RefreshCw size={10} />
                          Repairs ({totalDiagnostics})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMessageTabs(prev => ({ ...prev, [i]: 'rejected' }))}
                          className={cn(
                            "px-3 py-2 text-[9px] font-extrabold uppercase tracking-tight border-r border-white/5 transition-all text-left flex items-center gap-1.5",
                            currentTab === 'rejected' 
                              ? "bg-white/[0.03] text-indigo-400 border-b border-b-indigo-500" 
                              : "text-gray-500 hover:text-gray-400"
                          )}
                        >
                          <AlertCircle size={10} />
                          Filtered ({totalRejected})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMessageTabs(prev => ({ ...prev, [i]: 'raw' }))}
                          className={cn(
                            "px-3 py-2 text-[9px] font-extrabold uppercase tracking-tight border-r border-white/5 transition-all text-left flex items-center gap-1.5 ml-auto",
                            currentTab === 'raw' 
                              ? "bg-white/[0.03] text-indigo-400 border-b border-b-indigo-500" 
                              : "text-gray-500 hover:text-gray-400"
                          )}
                        >
                          <Eye size={10} />
                          Raw AST
                        </button>
                      </div>

                      {/* Tab Content Areas */}
                      <div className="p-3 bg-black/40 min-h-[80px]">
                        {/* 1. Transaction Tab */}
                        {currentTab === 'tx' && (
                          <div className="space-y-2">
                            {totalActions === 0 ? (
                              <div className="p-3 text-gray-600 text-[10px] italic">
                                No executable board modifications detected in this response cycle.
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {m.executableActions?.map((act, actIdx) => (
                                  <div key={actIdx} className="bg-white/[0.01] border border-white/5 rounded p-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-indigo-400 font-bold tracking-tight uppercase">
                                        {act.name}
                                      </span>
                                      <span className="text-[8px] px-1 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 rounded">
                                        deterministic step {actIdx + 1}
                                      </span>
                                    </div>
                                    <pre className="text-[10px] text-gray-505 mt-1 text-gray-400 overflow-x-auto whitespace-pre-wrap">
                                      {JSON.stringify(act.args)}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Show Dry-Run validation failures inside current view */}
                            {m.validationErrors && m.validationErrors.length > 0 && (
                              <div className="mt-3 p-2.5 bg-rose-500/5 border border-rose-500/15 rounded space-y-1">
                                <span className="text-[9px] text-rose-400 font-black uppercase flex items-center gap-1">
                                  <AlertTriangle size={11} />
                                  Dry-Run Checker Blocked
                                </span>
                                <div className="space-y-1 text-rose-300 text-[10px] leading-snug">
                                  {m.validationErrors.map((err, errIdx) => (
                                    <div key={errIdx} className="pl-2 border-l border-rose-500/35">
                                      {err}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {totalActions > 0 && (!m.validationErrors || m.validationErrors.length === 0) && (
                              <div className="mt-2 text-emerald-400 flex items-center gap-1 text-[9px] uppercase font-bold bg-[#10b981]/5 p-2 rounded border border-[#10b981]/15 leading-tight">
                                <ShieldCheck size={11} />
                                Transactions compiled and dry-run valid. State modifications committed to board layout tree.
                              </div>
                            )}
                          </div>
                        )}

                        {/* 2. Repairs Tab */}
                        {currentTab === 'repair' && (
                          <div className="space-y-1.5">
                            {totalDiagnostics === 0 ? (
                              <div className="p-3 text-gray-600 text-[10px] italic">
                                Ideal graph compatibility. 0 lexical repairs applied.
                              </div>
                            ) : (
                              m.diagnostics?.map((diag, diagIdx) => (
                                <div key={diagIdx} className="flex flex-col gap-1 p-2 bg-white/[0.01] border border-white/5 rounded">
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "text-[8px] uppercase font-black px-1 rounded",
                                      diag.appliedSeverity === 'repaired' ? "bg-amber-400/10 text-amber-300 border border-amber-400/10" :
                                      diag.appliedSeverity === 'rejected' ? "bg-rose-500/10 text-rose-400 border border-rose-500/10" : "bg-gray-500/10 text-gray-400 border border-gray-500/10"
                                    )}>
                                      {diag.appliedSeverity}
                                    </span>
                                    <span className="text-gray-300 font-semibold">
                                      field: <span className="text-white font-mono">{diag.field}</span>
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-gray-400 pl-1 leading-snug">
                                    {diag.message}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* 3. Filtered Conversational Message Nodes Tab */}
                        {currentTab === 'rejected' && (
                          <div className="space-y-1.5">
                            {totalRejected === 0 ? (
                              <div className="p-3 text-gray-600 text-[10px] italic">
                                0 conversational text fragments filtered from execution loop.
                              </div>
                            ) : (
                              m.rejectedActions?.map((rej, rejIdx) => (
                                <div key={rejIdx} className="p-2 bg-white/[0.01] border border-white/5 rounded">
                                  <div className="flex items-center justify-between">
                                    <span className="text-gray-400 uppercase font-bold text-[9px] tracking-tight">
                                      node {rejIdx + 1}: {rej.action?.name || 'unknown'}
                                    </span>
                                    <span className="text-[8px] text-rose-400 uppercase font-black">
                                      filtered
                                    </span>
                                  </div>
                                  <div className="text-rose-300 text-[10px] mt-1 pr-1 leading-relaxed pl-1.5 border-l border-rose-500/20">
                                    {rej.error}
                                  </div>
                                  <pre className="text-[9px] text-gray-600 mt-1 pl-1.5 font-mono overflow-x-auto">
                                    {JSON.stringify(rej.action, null, 2)}
                                  </pre>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* 4. Raw Server Response AST */}
                        {currentTab === 'raw' && (
                          <div className="relative">
                            <pre className="text-[10px] text-indigo-200/90 leading-normal p-2 bg-[#080808] rounded border border-white/5 max-h-[220px] overflow-y-auto whitespace-pre overflow-x-auto">
                              {JSON.stringify(m.rawResponse || { content: m.content }, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        ))}
        
        {isTyping && (
           <div className="space-y-3">
             <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                <Bot size={12} />
                Nova.AI
                <motion.span 
                  animate={{ opacity: [1, 0, 1] }} 
                  className="ml-2 w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_5px_rgba(79,70,229,1)]"
                />
             </div>
             <div className="p-4 bg-white/[0.02] border border-white/5 rounded-lg">
                <div className="flex flex-col gap-3">
                   <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                        <Zap size={12} className="text-amber-500" />
                      </motion.div>
                      {currentTask || "Processing project graph..."}
                   </div>
                   <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-indigo-600"
                        animate={{ width: ["0%", "100%"] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                      />
                   </div>
                </div>
             </div>
           </div>
        )}
      </div>

      {/* Action Buttons - Quick Prompts */}
      <div className="px-4 py-2.5 bg-[#0a0a0a] border-y border-white/5 flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] text-gray-600 uppercase font-black tracking-widest">Quick Design</span>
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[8px] text-gray-700 uppercase font-bold tracking-widest">scroll →</span>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {onSmartAuto && (
            <button
              onClick={onSmartAuto}
              className="min-h-[36px] px-3 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 hover:border-emerald-400/60 rounded-lg text-[10px] font-bold text-emerald-300 hover:text-emerald-200 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
            >
              ⚡ Smart Auto
            </button>
          )}
          {onAutoRoute && (
            <button
              onClick={onAutoRoute}
              className="min-h-[36px] px-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 rounded-lg text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
            >
              🔌 Auto-Route
            </button>
          )}
          {[
            { label: '🐬 Flipper Zero Clone', cmd: 'Build a Flipper Zero clone — multi-protocol wireless security tool with STM32WB55, CC1101 Sub-GHz radio, NFC reader, 125kHz RFID, USB-C charging, and LiPo battery management', category: 'complex' },
            { label: '💡 LED Circuit', cmd: 'Design a simple LED blink circuit with a current-limiting resistor connected to a 3.3V GPIO pin', category: 'starter' },
            { label: '⚡ Buck Converter', cmd: 'Create a 12V to 5V 2A buck converter power stage', category: 'power' },
            { label: '🔵 ESP32 Board', cmd: 'Add an ESP32 WiFi module with decoupling capacitors and antenna clearance', category: 'mcu' },
            { label: '🔌 USB-C Power', cmd: 'Add USB-C Power Delivery input stage with CC resistors', category: 'power' },
            { label: '🌡️ Sensor Hub', cmd: 'Generate an I2C sensor interface with pull-up resistors for temperature and humidity sensing', category: 'sensor' },
            { label: '🔊 Audio Amp', cmd: 'Create a small audio amplifier output stage with volume control', category: 'analog' },
            { label: '🔋 LiPo Charger', cmd: 'Add a single-cell LiPo battery charger circuit with charge status LED', category: 'power' },
            { label: '🚗 Motor Driver', cmd: 'Create an H-bridge motor driver stage for a DC motor', category: 'power' },
            { label: '📡 RF Antenna', cmd: 'Add a 2.4GHz antenna matching network with impedance matching', category: 'rf' },
            { label: '✅ Run DRC', cmd: 'Run a complete design rule check and electrical rules check on the current board', category: 'verify' },
            { label: '🔎 Check Errors', cmd: 'Review the current schematic for any electrical errors or missing connections', category: 'verify' },
            { label: '🏭 Export BOM', cmd: 'Generate a bill of materials for the current design with part numbers and quantities', category: 'export' },
          ].map((tool, i) => (
            <button 
              key={i} 
              onClick={() => { setInput(tool.cmd); setTimeout(() => handleSend(), 50); }}
              className="min-h-[36px] px-3 bg-white/[0.03] hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/20 rounded-lg text-[10px] font-bold text-gray-500 hover:text-indigo-300 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-5 bg-[#0a0a0a] shrink-0">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500/50 font-mono text-sm leading-none">{'>'}</div>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Ask Nova AI anything..." 
            className="w-full bg-[#111] border border-white/5 rounded-lg py-4 pl-10 pr-12 text-[13px] text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-gray-800 font-medium"
          />
          <button 
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-500 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center rounded transition-all disabled:opacity-10"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.onAiAction === next.onAiAction && prev.projectState === next.projectState && prev.onAutoRoute === next.onAutoRoute && prev.onSmartAuto === next.onSmartAuto;
});
