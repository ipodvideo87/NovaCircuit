import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, GripVertical, Plus, Star, History, Box, Info } from 'lucide-react';
import { GlobalLibrary, LibraryComponent, getRecommendedValue } from '../../lib/componentLibrary';
import { useProjectStore } from '../../lib/core/store';
import { cn } from '../../lib/utils';

function FootprintThumbnail({ footprintId }: { footprintId: string }) {
  const fp = useMemo(() => GlobalLibrary.getFootprint(footprintId), [footprintId]);
  if (!fp) return <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center"><Box className="w-4 h-4 text-gray-700"/></div>;

  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  fp.pads.forEach(p => {
    minX = Math.min(minX, p.x - p.width / 2);
    maxX = Math.max(maxX, p.x + p.width / 2);
    minY = Math.min(minY, p.y - p.height / 2);
    maxY = Math.max(maxY, p.y + p.height / 2);
  });
  const w = Math.max(fp.dimensions.width, maxX - minX + 1);
  const h = Math.max(fp.dimensions.height, maxY - minY + 1);
  const size = Math.max(w, h);
  
  return (
    <svg viewBox={`${-size/2} ${-size/2} ${size} ${size}`} className="w-8 h-8 opacity-70">
      {fp.graphics?.filter(g => g.layer === 'Silkscreen').map((g, i) => {
        if (g.type === 'rect') return <rect key={`silk-${i}`} x={(g.x||0) - (g.width||0)/2} y={(g.y||0) - (g.height||0)/2} width={g.width} height={g.height} fill="none" stroke="#22d3ee" strokeWidth={g.strokeWidth || 0.1}/>;
        if (g.type === 'circle') return <circle key={`silk-${i}`} cx={g.x} cy={g.y} r={g.radius} fill="#22d3ee" />;
        return null;
      })}
      {fp.pads.map((p, i) => (
        <rect 
          key={p.id}
          x={p.x - p.width / 2} 
          y={p.y - p.height / 2} 
          width={p.width} 
          height={p.height} 
          rx={p.shape === 'circle' ? p.width / 2 : (p.shape === 'roundrect' ? 0.2 : 0)}
          fill={p.type === 'smd' ? '#ef4444' : '#fbbf24'} 
        />
      ))}
    </svg>
  );
}

export function ComponentLibraryPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const graph = useProjectStore(state => state.graph);
  const commitTransaction = useProjectStore(state => state.commitTransaction);

  useEffect(() => {
    try {
      const storedRecent = localStorage.getItem('nova_recent_components');
      if (storedRecent) setRecent(JSON.parse(storedRecent));
      const storedFav = localStorage.getItem('nova_favorites');
      if (storedFav) setFavorites(JSON.parse(storedFav));
    } catch(e) {}
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const results = useMemo(() => {
    if (category === 'Recent') {
      const filtered = recent.map(p => GlobalLibrary.getComponent(p)).filter(Boolean) as LibraryComponent[];
      if (searchQuery) return filtered.filter(c => c.partNumber.toLowerCase().includes(searchQuery.toLowerCase()));
      return filtered;
    }
    if (category === 'Favorites') {
      const filtered = favorites.map(p => GlobalLibrary.getComponent(p)).filter(Boolean) as LibraryComponent[];
      if (searchQuery) return filtered.filter(c => c.partNumber.toLowerCase().includes(searchQuery.toLowerCase()));
      return filtered;
    }
    return GlobalLibrary.searchComponents(searchQuery, category === 'All' ? undefined : category);
  }, [searchQuery, category, recent, favorites]);

  const categories = ['All', 'Favorites', 'Recent', 'MCU', 'Power', 'RF', 'IC', 'Connector', 'Resistor', 'Capacitor', 'Inductor', 'Diode', 'Other'];

  const toggleFavorite = (comp: LibraryComponent, e: React.MouseEvent) => {
    e.stopPropagation();
    let newFavs;
    if (favorites.includes(comp.partNumber)) {
      newFavs = favorites.filter(p => p !== comp.partNumber);
    } else {
      newFavs = [comp.partNumber, ...favorites];
    }
    setFavorites(newFavs);
    localStorage.setItem('nova_favorites', JSON.stringify(newFavs));
  };

  const handleDragStart = (e: React.DragEvent, comp: LibraryComponent) => {
    (window as any).__draggingLibraryComponent = comp;
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'library_component',
      partNumber: comp.partNumber,
      offsetX: e.nativeEvent.offsetX,
      offsetY: e.nativeEvent.offsetY
    }));
    e.dataTransfer.effectAllowed = 'copy';
    
    // Auto-create a dragging element
    const dragIcon = document.createElement('div');
    dragIcon.className = "px-3 py-1 bg-indigo-500/20 border border-indigo-500 text-indigo-100 font-mono text-xs rounded shadow-lg absolute -top-10";
    dragIcon.textContent = comp.partNumber;
    document.body.appendChild(dragIcon);
    e.dataTransfer.setDragImage(dragIcon, 20, 20);
    setTimeout(() => document.body.removeChild(dragIcon), 0);
  };

  const addComponentToCenter = (comp: LibraryComponent) => {
    // Determine a new designator
    const symbol = GlobalLibrary.getSymbol(comp.symbolId);
    const prefix = symbol?.defaultPrefix || 'U';
    
    // Find next available designator
    let num = 1;
    const existing = graph.components;
    while (existing.some(c => c.designator === `${prefix}${num}`)) {
      num++;
    }
    const designator = `${prefix}${num}`;
    const val = getRecommendedValue(comp);

    // Add component to graph at 50,50
    const newComponent = {
      id: `comp_${Math.random().toString(36).slice(2, 9)}`,
      designator,
      partType: comp.category,
      partNumber: comp.partNumber,
      footprint: comp.defaultFootprint,
      position: { x: 50, y: 50 },
      boardPosition: { x: 50, y: 50 },
      layer: "F.Cu" as const,
      rotation: 0,
      pins: symbol ? symbol.units[0].pins.map(p => ({
        name: p.name || p.id,
        type: (p.type as import('../../types').PinType) || "passive"
      })) : [],
      properties: { ...comp.metadata, value: val }
    };

    const newGraph = {
      ...graph,
      components: [...graph.components, newComponent]
    };
    commitTransaction(newGraph);

    const newRecent = [comp.partNumber, ...recent.filter(p => p !== comp.partNumber)].slice(0, 10);
    setRecent(newRecent);
    localStorage.setItem('nova_recent_components', JSON.stringify(newRecent));
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-l border-white/5 w-80 text-sm text-gray-300">
      <div className="p-4 border-b border-white/5 space-y-3">
        <h3 className="font-medium text-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Library
          </div>
          <div className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-gray-500 font-mono tracking-widest border border-white/5">
            ⌘K
          </div>
        </h3>
        <div className="relative">
          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search parts, values, or footprints..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#111] border border-white/10 rounded px-3 py-1.5 text-xs outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "px-2 py-1 rounded text-[10px] transition-colors uppercase tracking-wider font-semibold",
                category === c ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-[#111] hover:bg-[#1a1a1a] text-gray-400 border border-transparent"
              )}
            >
              {c === 'Favorites' ? <Star className="w-3 h-3 inline mr-1" /> : null}
              {c === 'Recent' ? <History className="w-3 h-3 inline mr-1" /> : null}
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {results.map(comp => {
          const isFav = favorites.includes(comp.partNumber);
          return (
            <div 
              key={comp.partNumber}
              draggable
              onDragStart={(e) => handleDragStart(e, comp)}
              onDragEnd={() => { (window as any).__draggingLibraryComponent = null; }}
              className="group flex flex-col p-2.5 rounded bg-[#111] border border-white/5 hover:border-indigo-500/30 cursor-grab active:cursor-grabbing transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-indigo-300">{comp.partNumber}</span>
                  {comp.metadata.value || getRecommendedValue(comp) !== comp.partNumber ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 rounded">{getRecommendedValue(comp)}</span>
                  ) : null}
                </div>
                <div className="flex gap-1 items-center">
                  <button 
                    onClick={(e) => toggleFavorite(comp, e)}
                    className={cn("p-1 rounded transition-colors", isFav ? "text-amber-400" : "text-gray-600 hover:text-amber-400 opacity-0 group-hover:opacity-100")}
                  >
                    <Star className={cn("w-3.5 h-3.5", isFav && "fill-current")} />
                  </button>
                  <button 
                    onClick={() => addComponentToCenter(comp)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-all"
                    title="Place on center"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              <span className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed" title={comp.metadata.description}>
                {comp.metadata.description || comp.category}
              </span>
              
              <div className="flex justify-between items-end mt-2 pt-2 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <FootprintThumbnail footprintId={comp.defaultFootprint} />
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 uppercase tracking-widest">{comp.defaultFootprint}</span>
                    {comp.metadata.manufacturer && (
                      <span className="text-[9px] text-indigo-400/50 uppercase tracking-widest">{comp.metadata.manufacturer}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center text-gray-600 group-hover:text-indigo-400 transition-colors">
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          );
        })}
        {results.length === 0 && (
          <div className="p-8 text-center text-gray-500 text-xs flex flex-col items-center gap-2">
            <Info className="w-6 h-6 opacity-50" />
            No components match your search.
          </div>
        )}
      </div>
    </div>
  );
}
