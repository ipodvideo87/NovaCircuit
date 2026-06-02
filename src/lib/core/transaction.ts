import { create } from 'zustand';
import { PCBBoard } from '../../types/pcb';

interface TransactionState {
  history: PCBBoard[];
  currentIndex: number;
  lastSaveTime: number;
  selectedComponentId: string | null;
  selectedTraceId: string | null;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | null;
  commitTransaction: (board: PCBBoard) => void;
  undo: () => PCBBoard | null;
  redo: () => PCBBoard | null;
  checkpoint: () => void;
  loadBoard: (board: PCBBoard) => void;
  setSelectedComponentId: (id: string | null) => void;
  setSelectedTraceId: (id: string | null) => void;
  setExperienceLevel: (level: 'beginner' | 'intermediate' | 'advanced' | null) => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  history: [{
    components: Array.from({ length: 300 }).map((_, i) => ({
      id: `comp-${i}`,
      x: Math.random() * 800,
      y: Math.random() * 600,
      rotation: 0,
      name: `U${i}`,
      type: 'IC'
    })),
    traces: Array.from({ length: 150 }).map((_, i) => ({
      id: `trace-${i}`,
      startX: Math.random() * 800,
      startY: Math.random() * 600,
      endX: Math.random() * 800,
      endY: Math.random() * 600,
      width: 0.25,
      netId: `net-${i}`
    })),
    ratnest: Array.from({ length: 50 }).map((_, i) => ({
      id: `rat-${i}`,
      startX: Math.random() * 800,
      startY: Math.random() * 600,
      endX: Math.random() * 800,
      endY: Math.random() * 600,
      netId: `net-${i}`
    }))
  }],
  currentIndex: 0,
  lastSaveTime: Date.now(),
  selectedComponentId: null,
  selectedTraceId: null,
  experienceLevel: (typeof window !== 'undefined' ? localStorage.getItem('novacircuit_experience_level') : null) as 'beginner' | 'intermediate' | 'advanced' | null,
  
  setSelectedComponentId: (id: string | null) => set({ selectedComponentId: id, selectedTraceId: null }),
  setSelectedTraceId: (id: string | null) => set({ selectedTraceId: id, selectedComponentId: null }),
  setExperienceLevel: (level: 'beginner' | 'intermediate' | 'advanced' | null) => {
    if (typeof window !== 'undefined') {
      if (level) {
        localStorage.setItem('novacircuit_experience_level', level);
      } else {
        localStorage.removeItem('novacircuit_experience_level');
      }
    }
    set({ experienceLevel: level });
  },
  
  commitTransaction: (board: PCBBoard) => set((state) => {
    const newHistory = state.history.slice(0, state.currentIndex + 1);
    newHistory.push(board);
    
    // Auto-save check
    const now = Date.now();
    if (now - state.lastSaveTime > 30000) {
      console.log("Auto-saving checkpoint...");
      // In a real app we would persist to backend/indexedDB here
      return { history: newHistory, currentIndex: newHistory.length - 1, lastSaveTime: now };
    }
    
    return { history: newHistory, currentIndex: newHistory.length - 1 };
  }),
  
  undo: () => {
    const state = get();
    if (state.currentIndex > 0) {
      set({ currentIndex: state.currentIndex - 1 });
      return state.history[state.currentIndex - 1];
    }
    return null;
  },
  
  redo: () => {
    const state = get();
    if (state.currentIndex < state.history.length - 1) {
      set({ currentIndex: state.currentIndex + 1 });
      return state.history[state.currentIndex + 1];
    }
    return null;
  },
  
  checkpoint: () => set({ lastSaveTime: Date.now() }),
  
  loadBoard: (board: PCBBoard) => set((state) => {
    const newHistory = state.history.slice(0, state.currentIndex + 1);
    newHistory.push(board);
    return {
      history: newHistory,
      currentIndex: newHistory.length - 1,
      lastSaveTime: Date.now()
    };
  })
}));
