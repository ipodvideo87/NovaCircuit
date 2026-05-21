import { useState, useCallback, useRef } from 'react';
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
  };
}

export function useTransactionManager(initialState: ProjectGraph, maxHistory = 50) {
  const [history, setHistory] = useState<ProjectGraph[]>([deepCloneGraph(initialState)]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const historyRef = useRef(history);
  const indexRef = useRef(currentIndex);

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
  }, [maxHistory]);

  const undo = useCallback((): ProjectGraph | null => {
    if (indexRef.current > 0) {
      const newIndex = indexRef.current - 1;
      indexRef.current = newIndex;
      setCurrentIndex(newIndex);
      return deepCloneGraph(historyRef.current[newIndex]);
    }
    return null;
  }, []);

  const redo = useCallback((): ProjectGraph | null => {
    if (indexRef.current < historyRef.current.length - 1) {
      const newIndex = indexRef.current + 1;
      indexRef.current = newIndex;
      setCurrentIndex(newIndex);
      return deepCloneGraph(historyRef.current[newIndex]);
    }
    return null;
  }, []);

  const rollback = useCallback((): ProjectGraph => {
    return deepCloneGraph(historyRef.current[indexRef.current]);
  }, []);

  return {
    history,
    currentIndex,
    commitTransaction,
    undo,
    redo,
    rollback,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
  };
}
