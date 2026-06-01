import React, { useState, useMemo } from 'react';
import { Search, X, BookOpen, HelpCircle as HelpIcon } from 'lucide-react';

interface HelpItem {
  id: string;
  title: string;
  category: 'Concepts' | 'Stackup' | 'DFM Rules' | 'Templates';
  keywords: string[];
  description: string;
  content: string;
}

const HELP_DATA: HelpItem[] = [
  {
    id: "microstrip",
    title: "RF & Impedance Microstrip Matching",
    category: "Stackup",
    keywords: ["impedance", "microstrip", "rf", "width", "ipc-2141", "ohms"],
    description: "Calculates track physical width for controlled line impedance.",
    content: "Controlled impedance prevents signal reflections on high-frequency nets (e.g. Wi-Fi feedlines, USB high-speed lines).\n\nUse the STACKUP tab to change FR4 dielectric thickness (H) and dielectric constant (Er). NovaCircuit dynamically applies the standard IPC-2141 microstrip impedance solver to calculate the ideal track width (e.g. 0.32mm for 50 ohm matched networks on a 1.6mm substrate)."
  },
  {
    id: "serpentine",
    title: "Serpentine Length Tuning for Phase Matching",
    category: "Concepts",
    keywords: ["serpentine", "tuning", "wiggles", "length", "delay", "phase"],
    description: "How to tune trace length to match physical flight-time.",
    content: "When signals travel along parallel lines (like differential USB pairs or SPI memory paths), they must arrive at the destination at the exact same picosecond to prevent data corruption isochronism.\n\nNovaCircuit implements automatic serpentine length tuning. Select a high-speed trace, click 'Tuning Waves (Serpentine)', and adjust Amplitude dynamically to match flight-time across parallel differential nets."
  },
  {
    id: "acid-traps",
    title: "Acid Traps & Copper Short Constraints",
    category: "DFM Rules",
    keywords: ["acid trap", "dfm", "erc", "trace angle", "shorts", "manufacturing"],
    description: "Detects sharp <90° angles that accumulate chemical etchants.",
    content: "During chemical etching of the copper clad board, etchant chemicals can crawl and pool in narrow, sharp corners (<90° track changes) rather than washing away. This can over-etch and create open circuits or high resistance.\n\nRun highly professional 'Validate' checklists to automatically audit if any track bends violate design limits."
  },
  {
    id: "ratsnest",
    title: "Ratsnest & Routing Airwires",
    category: "Concepts",
    keywords: ["ratsnest", "airwires", "connections", "unrouted", "nets"],
    description: "Guides you for remaining layout board interconnections.",
    content: "A ratsnest is composed of dynamic dashed lines showing direct electrical connections that need copper traces. As you route traces, ratsnest lines automatically collapse.\n\nEnsure 0 remaining ratsnest connections under the Validate panel before ordering from your fabrication house."
  },
  {
    id: "templates",
    title: "Reference Design Templates",
    category: "Templates",
    keywords: ["esp32", "usb-c", "stm32", "boards", "power delivery"],
    description: "Use proven configurations of MCUs, analog front-ends, or power buck-regulators.",
    content: "NovaCircuit includes fully populated high-frequency layouts:\n\n• ESP32 IoT Board: Wi-Fi matched 50Ω feedline to an Inverted-F antenna.\n• USB-PD 65W: High power switching thermal copper widths.\n• STM32 Analog System: Signal buffers with separate analog grounding boundaries."
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts & Touch Controls",
    category: "Concepts",
    keywords: ["shortcuts", "keys", "panning", "zooming", "middle click", "touch"],
    description: "Interactive EDA gestures for high-speed routing.",
    content: "• Undo & Redo: Cmd/Ctrl + Z / Cmd/Ctrl + Shift + Z\n• Support Help Center: Cmd/Ctrl + /\n• Desktop Panning: Drag with standard Middle-Click / Spacebar drag\n• Desktop Zooming: Cmd/Ctrl + Mouse Wheel\n• Touch Devices: Single-finger swipe to pan; Two-finger pinch to zoom-in or zoom-out."
  }
];

interface Props {
  onClose: () => void;
}

export const HelpDialog: React.FC<Props> = ({ onClose }) => {
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<HelpItem | null>(HELP_DATA[0]);

  const filteredItems = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return HELP_DATA;
    return HELP_DATA.filter(item => 
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      item.keywords.some(k => k.includes(query))
    );
  }, [search]);

  // Handle select logic
  const handleSelectItem = (item: HelpItem) => {
    setSelectedItem(item);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-[#0f0f15] border border-white/10 rounded-2xl w-full max-w-3xl h-[85vh] md:h-[600px] flex flex-col overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="p-4 border-b border-white/5 flex items-center justify-between bg-[#111119] shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <BookOpen size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase text-white tracking-widest">Help Center & Command Palette</h3>
              <p className="text-[9px] text-gray-500 font-mono">NovaCircuit EDA documentation database</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </header>

        {/* Search Input bar */}
        <div className="p-4 border-b border-white/5 bg-[#0a0a0f] relative shrink-0">
          <Search size={16} className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search keywords: 'impedance', 'acid trap', 'shortcuts', 'serpentine', 'USB-C'..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#111118] border border-white/5 focus:border-indigo-500/50 rounded-xl py-2 px-10 text-xs text-white placeholder-gray-500 focus:outline-none transition-all"
            autoFocus
          />
        </div>

        {/* Content Panel splitter */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-[#0c0c11]">
          {/* Left panel: Article List */}
          <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto p-2 space-y-1 max-h-[35%] md:max-h-none shrink-0">
            <span className="text-[9px] font-black uppercase text-gray-650 tracking-wider p-2 block">SEARCH RESULTS ({filteredItems.length})</span>
            {filteredItems.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">No matches found</div>
            ) : (
              filteredItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  className={`w-full text-left p-3 rounded-xl transition-all flex flex-col gap-1 focus:outline-none ${
                    selectedItem?.id === item.id 
                    ? 'bg-indigo-600/15 border border-indigo-500/30 text-white' 
                    : 'border border-transparent hover:bg-white/5 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-bold tracking-wide leading-tight">{item.title}</span>
                  </div>
                  <span className="text-[9px] text-gray-500 shrink-0 leading-normal truncate w-full">{item.description}</span>
                  <span className="text-[7.5px] font-bold font-mono text-indigo-400/80 px-1.5 py-0.5 rounded bg-indigo-500/5 border border-indigo-500/10 self-start uppercase mt-1">
                    {item.category}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Right panel: Reader screen */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#0a0a0e] select-text">
            {selectedItem ? (
              <article className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    {selectedItem.category}
                  </span>
                </div>
                <h1 className="text-base font-black text-white uppercase tracking-tight">{selectedItem.title}</h1>
                <p className="text-xs text-indigo-300 font-medium pb-4 border-b border-white/5">
                  {selectedItem.description}
                </p>
                <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {selectedItem.content}
                </div>
              </article>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-500">
                <HelpIcon size={32} className="text-gray-700 mb-2" />
                <p className="text-xs">Select an article from side list to view interactive simulation details.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer info center */}
        <footer className="p-3 bg-[#111119] border-t border-white/5 flex items-center justify-between text-[9px] text-gray-500 font-mono">
          <span>Search index status: Online | Shortcuts: Ctrl + /</span>
          <span>© NovaCircuit EDA</span>
        </footer>
      </div>
    </div>
  );
};
