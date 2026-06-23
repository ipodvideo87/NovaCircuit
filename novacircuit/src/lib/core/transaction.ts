import { create } from 'zustand';
import type { PCBBoard, PCBComponent, PDNOptimizerSuggestion } from '../../types/pcb';
import { suggestionToComponent } from '../pdnAnalyzer';

// ─── Seed Data ────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const COMPONENT_TYPES = [
  'MCU', 'CONNECTOR', 'LDO', 'CAPACITOR', 'RESISTOR',
  'OSCILLATOR', 'RF_ANTENNA', 'MOSFET', 'OP-AMP', 'ADC',
  'VOLTAGE_REF', 'IC',
];

const POWER_NETS = ['vcc-3.3v', 'vcc-5v', 'gnd', 'usb-dp', 'usb-dn', 'wifi-ant-rf'];

function generateInitialBoard(): PCBBoard {
  const components: PCBComponent[] = Array.from({ length: 300 }, (_, i) => ({
    id: `comp-${i}`,
    x: randomBetween(-800, 800),
    y: randomBetween(-600, 600),
    rotation: [0, 90, 180, 270][Math.floor(Math.random() * 4)],
    name: `${COMPONENT_TYPES[i % COMPONENT_TYPES.length]}-${i}`,
    type: COMPONENT_TYPES[i % COMPONENT_TYPES.length],
  }));

  const traces = Array.from({ length: 150 }, (_, i) => ({
    id: `trace-${i}`,
    startX: randomBetween(-800, 800),
    startY: randomBetween(-600, 600),
    endX: randomBetween(-800, 800),
    endY: randomBetween(-600, 600),
    width: [0.18, 0.25, 0.32, 0.5][Math.floor(Math.random() * 4)],
    netId: POWER_NETS[i % POWER_NETS.length],
  }));

  return { components, traces, ratnest: [] };
}

// ─── Store Interface ──────────────────────────────────────────────────────────

interface TransactionStore {
  history: PCBBoard[];
  currentIndex: number;
  lastSaveTime: number;
  selectedComponentId: string | null;
  selectedTraceId: string | null;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | null;

  commitTransaction: (board: PCBBoard) => void;
  undo: () => PCBBoard | null;
  redo: () => PCBBoard | null;
  setSelectedComponentId: (id: string | null) => void;
  setSelectedTraceId: (id: string | null) => void;
  setExperienceLevel: (level: 'beginner' | 'intermediate' | 'advanced') => void;

  /**
   * Apply a list of PDN optimizer suggestions as a single committed transaction.
   * Each suggestion that has type ADD_CAP converts its virtual cap into a real
   * PCBComponent (CAPACITOR) and appends it to the board.
   */
  applyPDNSuggestions: (suggestions: PDNOptimizerSuggestion[]) => PCBBoard;
}

// ─── Zustand Store ────────────────────────────────────────────────────────────

const savedLevel = typeof window !== 'undefined'
  ? (localStorage.getItem('novacircuit_experience_level') as TransactionStore['experienceLevel'])
  : null;

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  history: [generateInitialBoard()],
  currentIndex: 0,
  lastSaveTime: Date.now(),
  selectedComponentId: null,
  selectedTraceId: null,
  experienceLevel: savedLevel,

  commitTransaction: (board: PCBBoard) => {
    const { history, currentIndex } = get();
    // Truncate redo history beyond current pointer
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(board);

    const now = Date.now();
    const { lastSaveTime } = get();
    if (now - lastSaveTime > 30_000) {
      // Auto-save checkpoint (could persist to IndexedDB / localStorage here)
      set({ history: newHistory, currentIndex: newHistory.length - 1, lastSaveTime: now });
    } else {
      set({ history: newHistory, currentIndex: newHistory.length - 1 });
    }
  },

  undo: () => {
    const { currentIndex, history } = get();
    if (currentIndex <= 0) return null;
    const newIndex = currentIndex - 1;
    set({ currentIndex: newIndex });
    return history[newIndex];
  },

  redo: () => {
    const { currentIndex, history } = get();
    if (currentIndex >= history.length - 1) return null;
    const newIndex = currentIndex + 1;
    set({ currentIndex: newIndex });
    return history[newIndex];
  },

  setSelectedComponentId: (id: string | null) => {
    set({ selectedComponentId: id, selectedTraceId: null });
  },

  setSelectedTraceId: (id: string | null) => {
    set({ selectedTraceId: id, selectedComponentId: null });
  },

  setExperienceLevel: (level) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('novacircuit_experience_level', level);
    }
    set({ experienceLevel: level });
  },

  applyPDNSuggestions: (suggestions: PDNOptimizerSuggestion[]) => {
    const { history, currentIndex } = get();
    const currentBoard = history[currentIndex];

    const existingIds = new Set(currentBoard.components.map(c => c.id));
    const newComponents = suggestions
      .filter(s => s.type === 'ADD_CAP' && !s.applied)
      .map(s => suggestionToComponent(s, existingIds));

    const updatedBoard: PCBBoard = {
      ...currentBoard,
      components: [...currentBoard.components, ...newComponents],
    };

    // Commit as new undo checkpoint
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(updatedBoard);
    set({ history: newHistory, currentIndex: newHistory.length - 1 });

    return updatedBoard;
  },
}));
