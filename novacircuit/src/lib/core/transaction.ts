// ─────────────────────────────────────────────────────────────────────────────
// NovaCircuit Transaction Store (Zustand)
//
// Central state manager with undo/redo history, selection state,
// experience level, PDN analysis cache, via management, and stackup config.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import {
  PCBBoard,
  PCBComponent,
  PCBTrace,
  PCBVia,
  PCBStackup,
  PDNAnalysisResult,
  StackupPreset,
  ViaDRCResult,
} from '../../types/pcb';
import {
  getDefaultStackup,
  runViaDRC,
  summarizeVias,
  ViaSummary,
} from '../viaManager';

// ── Demo / Stress-Test Data ───────────────────────────────────────────────────

function generateDemoComponents(count: number): PCBComponent[] {
  const types = ['MCU', 'CONNECTOR', 'LDO', 'CAPACITOR', 'RESISTOR', 'MOSFET', 'OP-AMP', 'ADC'];
  return Array.from({ length: count }, (_, i) => ({
    id: `comp-${i + 1}`,
    x: (Math.random() - 0.5) * 400,
    y: (Math.random() - 0.5) * 400,
    rotation: [0, 90, 180, 270][Math.floor(Math.random() * 4)],
    name: `${types[i % types.length]}_${i + 1}`,
    type: types[i % types.length],
  }));
}

function generateDemoTraces(count: number): PCBTrace[] {
  const nets = ['vcc-3.3v', 'gnd', 'usb-dp', 'usb-dn', 'spi-clk', 'spi-mosi', 'i2c-scl', 'i2c-sda'];
  return Array.from({ length: count }, (_, i) => ({
    id: `trace-${i + 1}`,
    startX: (Math.random() - 0.5) * 400,
    startY: (Math.random() - 0.5) * 400,
    endX: (Math.random() - 0.5) * 400,
    endY: (Math.random() - 0.5) * 400,
    width: 0.15 + Math.random() * 0.25,
    netId: nets[i % nets.length],
    layer: 'F.Cu' as const,
  }));
}

const INITIAL_BOARD: PCBBoard = {
  components: generateDemoComponents(300),
  traces: generateDemoTraces(150),
  ratnest: [],
  vias: [],
  stackup: getDefaultStackup('4L'),
  netClasses: {},
};

// ── Store Interface ───────────────────────────────────────────────────────────

export type ExperienceLevel = 'beginner' | 'intermediate' | 'expert';

export interface TransactionStore {
  // ── History ──────────────────────────────────────────────────────────────
  history: PCBBoard[];
  currentIndex: number;

  // ── Selection state ───────────────────────────────────────────────────────
  selectedComponentId: string | null;
  selectedTraceId: string | null;
  selectedViaId: string | null;

  // ── User preferences ──────────────────────────────────────────────────────
  experienceLevel: ExperienceLevel;

  // ── PDN cache ─────────────────────────────────────────────────────────────
  pdnAnalysisResult: PDNAnalysisResult | null;

  // ── Via / DRC state ───────────────────────────────────────────────────────
  viaDRCResult: ViaDRCResult | null;
  viaSummary: ViaSummary | null;
  activeStackupPreset: StackupPreset;

  // ── Actions ───────────────────────────────────────────────────────────────
  commitTransaction: (board: PCBBoard) => void;
  undo: () => PCBBoard | null;
  redo: () => PCBBoard | null;
  currentBoard: () => PCBBoard;

  setSelectedComponent: (id: string | null) => void;
  setSelectedTrace: (id: string | null) => void;
  setSelectedVia: (id: string | null) => void;
  setExperienceLevel: (level: ExperienceLevel) => void;
  setPDNAnalysisResult: (result: PDNAnalysisResult | null) => void;

  // Via-specific actions
  addVia: (via: PCBVia) => void;
  removeVia: (viaId: string) => void;
  updateVia: (via: PCBVia) => void;
  runViasDRC: () => ViaDRCResult;
  setStackupPreset: (preset: StackupPreset) => void;
  refreshViaSummary: () => void;
}

// ── Store Implementation ──────────────────────────────────────────────────────

const EXPERIENCE_KEY = 'novacircuit_experience_level';
const AUTO_SAVE_INTERVAL_MS = 30_000;

function loadExperienceLevel(): ExperienceLevel {
  try {
    const stored = localStorage.getItem(EXPERIENCE_KEY);
    if (stored === 'beginner' || stored === 'intermediate' || stored === 'expert') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable in some environments
  }
  return 'intermediate';
}

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

export const useTransactionStore = create<TransactionStore>((set, get) => {
  // Start auto-save timer
  if (typeof window !== 'undefined') {
    autoSaveTimer = setInterval(() => {
      const board = get().currentBoard();
      try {
        localStorage.setItem('novacircuit_autosave', JSON.stringify(board));
      } catch {
        // Ignore quota errors
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }

  return {
    // ── Initial state ────────────────────────────────────────────────────────
    history: [INITIAL_BOARD],
    currentIndex: 0,

    selectedComponentId: null,
    selectedTraceId: null,
    selectedViaId: null,

    experienceLevel: loadExperienceLevel(),
    pdnAnalysisResult: null,
    viaDRCResult: null,
    viaSummary: null,
    activeStackupPreset: '4L',

    // ── History actions ──────────────────────────────────────────────────────
    commitTransaction: (board: PCBBoard) => {
      set((state) => {
        const truncated = state.history.slice(0, state.currentIndex + 1);
        const newHistory = [...truncated, board];
        // Cap history at 100 entries to bound memory usage
        const bounded = newHistory.length > 100
          ? newHistory.slice(newHistory.length - 100)
          : newHistory;
        return {
          history: bounded,
          currentIndex: bounded.length - 1,
        };
      });
    },

    undo: () => {
      const { history, currentIndex } = get();
      if (currentIndex <= 0) return null;
      const newIndex = currentIndex - 1;
      set({ currentIndex: newIndex });
      return history[newIndex];
    },

    redo: () => {
      const { history, currentIndex } = get();
      if (currentIndex >= history.length - 1) return null;
      const newIndex = currentIndex + 1;
      set({ currentIndex: newIndex });
      return history[newIndex];
    },

    currentBoard: () => {
      const { history, currentIndex } = get();
      return history[currentIndex];
    },

    // ── Selection actions ────────────────────────────────────────────────────
    setSelectedComponent: (id) =>
      set({ selectedComponentId: id, selectedTraceId: null, selectedViaId: null }),

    setSelectedTrace: (id) =>
      set({ selectedTraceId: id, selectedComponentId: null, selectedViaId: null }),

    setSelectedVia: (id) =>
      set({ selectedViaId: id, selectedComponentId: null, selectedTraceId: null }),

    setExperienceLevel: (level) => {
      set({ experienceLevel: level });
      try {
        localStorage.setItem(EXPERIENCE_KEY, level);
      } catch {
        // Ignore
      }
    },

    setPDNAnalysisResult: (result) => set({ pdnAnalysisResult: result }),

    // ── Via actions ──────────────────────────────────────────────────────────
    addVia: (via: PCBVia) => {
      const board = get().currentBoard();
      const vias = [...(board.vias ?? []), via];
      const newBoard: PCBBoard = { ...board, vias };
      get().commitTransaction(newBoard);
      get().refreshViaSummary();
    },

    removeVia: (viaId: string) => {
      const board = get().currentBoard();
      const vias = (board.vias ?? []).filter((v) => v.id !== viaId);
      const newBoard: PCBBoard = { ...board, vias };
      get().commitTransaction(newBoard);
      // Deselect if the removed via was selected
      if (get().selectedViaId === viaId) {
        set({ selectedViaId: null });
      }
      get().refreshViaSummary();
    },

    updateVia: (via: PCBVia) => {
      const board = get().currentBoard();
      const vias = (board.vias ?? []).map((v) => (v.id === via.id ? via : v));
      const newBoard: PCBBoard = { ...board, vias };
      get().commitTransaction(newBoard);
      get().refreshViaSummary();
    },

    runViasDRC: () => {
      const board = get().currentBoard();
      const stackup = board.stackup ?? getDefaultStackup('4L');
      const result = runViaDRC(board.vias ?? [], stackup);
      set({ viaDRCResult: result });
      return result;
    },

    setStackupPreset: (preset: StackupPreset) => {
      const board = get().currentBoard();
      const newStackup = getDefaultStackup(preset);
      const newBoard: PCBBoard = { ...board, stackup: newStackup };
      get().commitTransaction(newBoard);
      set({ activeStackupPreset: preset });
      // Re-run DRC against new stackup
      const result = runViaDRC(board.vias ?? [], newStackup);
      set({ viaDRCResult: result });
      get().refreshViaSummary();
    },

    refreshViaSummary: () => {
      const board = get().currentBoard();
      const stackup = board.stackup ?? getDefaultStackup('4L');
      const summary = summarizeVias(board.vias ?? [], stackup);
      set({ viaSummary: summary });
    },
  };
});
