import React, { useState } from 'react';
import { Cpu, ChevronRight } from 'lucide-react';
import { useTransactionStore } from '../lib/core/transaction';

interface OnboardingDialogProps {
  onClose: () => void;
}

type Level = 'beginner' | 'intermediate' | 'advanced';

const LEVELS: { id: Level; label: string; description: string }[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'New to PCB design — I want guided tooltips and simplified UI.',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    description: 'Comfortable with schematics and basic routing, exploring advanced features.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Professional EDA engineer — show me all controls, minimal hand-holding.',
  },
];

const OnboardingDialog: React.FC<OnboardingDialogProps> = ({ onClose }) => {
  const setExperienceLevel = useTransactionStore(s => s.setExperienceLevel);
  const [selected, setSelected] = useState<Level | null>(null);

  const handleContinue = () => {
    if (selected) {
      setExperienceLevel(selected);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="
        bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl
        w-full max-w-md mx-4
      ">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500
            flex items-center justify-center mx-auto mb-3">
            <Cpu size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-100 mb-1">Welcome to NovaCircuit</h1>
          <p className="text-sm text-slate-400">
            Tell us your experience level so we can tailor the interface.
          </p>
        </div>

        {/* Level selector */}
        <div className="px-6 pb-4 space-y-2">
          {LEVELS.map(level => (
            <button
              key={level.id}
              onClick={() => setSelected(level.id)}
              className={`
                w-full text-left px-4 py-3 rounded-xl border transition-all
                ${selected === level.id
                  ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-300'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'
                }
              `}
            >
              <p className="font-semibold text-sm">{level.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{level.description}</p>
            </button>
          ))}
        </div>

        {/* Continue */}
        <div className="px-6 pb-6">
          <button
            onClick={handleContinue}
            disabled={!selected}
            className="
              w-full flex items-center justify-center gap-2 py-3 rounded-xl
              bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors
            "
          >
            Continue to NovaCircuit
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingDialog;
