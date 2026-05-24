import { useState, useCallback, useRef, useEffect } from 'react';
import { ProjectGraph } from '../types';

export function deepCloneGraph(graph: ProjectGraph): ProjectGraph {
  return {
    components: graph.components.map(c => ({
      ...c,
      position: { ...c.position },
      boardPosition: c.boardPosition ? { ...c.boardPosition } : undefined,
      properties: { ...c.properties },
      metadata: c.metadata ? { ...c.metadata } : undefined,
      pins: c.pins.map(p => ({ ...p }))
    })),
    nets: graph.nets.map(n => ({
      ...n,
      connections: n.connections.map(conn => ({ ...conn }))
    })),
    traces: graph.traces ? graph.traces.map(t => ({ ...t })) : undefined,
    vias: graph.vias ? graph.vias.map(v => ({ ...v })) : undefined,
    keepouts: graph.keepouts ? graph.keepouts.map(k => ({
      ...k,
      layers: [...k.layers],
      restrictions: [...k.restrictions]
    })) : undefined,
    outline: graph.outline ? { points: graph.outline.points.map(p => ({ ...p })) } : undefined,
    netClasses: graph.netClasses ? graph.netClasses.map(nc => ({
      ...nc,
      viaSize: nc.viaSize ? { ...nc.viaSize } : undefined
    })) : undefined,
    diffPairs: graph.diffPairs ? graph.diffPairs.map(dp => ({ ...dp })) : undefined,
  };
}

const CACHE_KEY = 'eda_autosave_v1';

export function useTransactionManager(initialState: ProjectGraph, maxHistory = 50) {
  const [isRestored, setIsRestored] = useState(false);

  const [history, setHistory] = useState<ProjectGraph[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.components) && Array.isArray(parsed.nets)) {
          // Found valid cache -> schedule restored flag
          setTimeout(() => setIsRestored(true), 100);
          return [parsed];
        }
      }
    } catch (err) {
      console.warn("Failed to parse cached project.", err);
    }
    return [deepCloneGraph(initialState)];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeGraph, setActiveGraph] = useState<ProjectGraph>(() => deepCloneGraph(history ? history[0] : initialState));

  const historyRef = useRef(history);
  const indexRef = useRef(currentIndex);
  
  // Interaction memory state (Transient tracking)
  const interactionBaseRef = useRef<ProjectGraph | null>(null);
  const isInsideInteractionRef = useRef(false);

  // Sync active component layout when initial changes occur or history updates
  useEffect(() => {
    historyRef.current = history;
    indexRef.current = currentIndex;
    setActiveGraph(deepCloneGraph(history[currentIndex]));
  }, [history, currentIndex]);

  // Throttle autosaves
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitTransaction = useCallback((newGraph: ProjectGraph) => {
    const trimmedHistory = historyRef.current.slice(0, indexRef.current + 1);
    const clonedGraph = deepCloneGraph(newGraph);
    
    let nextHistory = [...trimmedHistory, clonedGraph];
    if (nextHistory.length > maxHistory) {
      nextHistory = nextHistory.slice(nextHistory.length - maxHistory);
    }
    
    // Synchronously update refs to prevent stale state on rapid successive calls
    historyRef.current = nextHistory;
    indexRef.current = nextHistory.length - 1;
    
    setHistory(nextHistory);
    setCurrentIndex(nextHistory.length - 1);
    setActiveGraph(clonedGraph);

    // Debounced autosave
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(clonedGraph));
      } catch (err) {
        console.warn("Failed to autosave project", err);
      }
    }, 1000); // 1s throttle

  }, [maxHistory]);

  const undo = useCallback((): ProjectGraph | null => {
    if (indexRef.current > 0) {
      const newIndex = indexRef.current - 1;
      indexRef.current = newIndex;
      setCurrentIndex(newIndex);
      const prevGraph = historyRef.current[newIndex];
      setActiveGraph(deepCloneGraph(prevGraph));
      return prevGraph;
    }
    return null;
  }, []);

  const redo = useCallback((): ProjectGraph | null => {
    if (indexRef.current < historyRef.current.length - 1) {
      const newIndex = indexRef.current + 1;
      indexRef.current = newIndex;
      setCurrentIndex(newIndex);
      const nextGraph = historyRef.current[newIndex];
      setActiveGraph(deepCloneGraph(nextGraph));
      return nextGraph;
    }
    return null;
  }, []);

  const rollback = useCallback((): ProjectGraph => {
    return historyRef.current[indexRef.current];
  }, []);

  const clearRestoredFlag = useCallback(() => setIsRestored(false), []);

  /**
   * Initializes a transient workspace interaction state.
   */
  const beginInteractionTransaction = useCallback(() => {
    interactionBaseRef.current = deepCloneGraph(historyRef.current[indexRef.current]);
    isInsideInteractionRef.current = true;
  }, []);

  /**
   * Appends intermediate layout changes without logging history checkpoints.
   */
  const appendInteractionDelta = useCallback((updatedGraph: ProjectGraph) => {
    if (!isInsideInteractionRef.current) {
      beginInteractionTransaction();
    }
    setActiveGraph(deepCloneGraph(updatedGraph));
  }, [beginInteractionTransaction]);

  /**
   * Commits the final accumulated state as a single history record.
   */
  const commitInteractionTransaction = useCallback((finalGraph: ProjectGraph) => {
    isInsideInteractionRef.current = false;
    interactionBaseRef.current = null;
    commitTransaction(finalGraph);
  }, [commitTransaction]);

  return {
    history,
    currentIndex,
    activeGraph,
    commitTransaction,
    undo,
    redo,
    rollback,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
    isRestored,
    clearRestoredFlag,
    beginInteractionTransaction,
    appendInteractionDelta,
    commitInteractionTransaction
  };
}
