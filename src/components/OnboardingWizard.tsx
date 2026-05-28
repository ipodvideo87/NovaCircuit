import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, CircuitBoard, Cpu, Zap, Users, Sparkles, Check } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { UserMode } from './ModeSelector';

interface OnboardingWizardProps {
  mode: UserMode;
  onFinish: (projectName: string, template: string) => void;
  onSkip: () => void;
}

const TEMPLATES = {
  maker: [
    { id: 'blink', label: 'Arduino Blink', description: 'LED + resistor + microcontroller. The classic first project.', icon: '💡' },
    { id: 'sensor', label: 'Temperature Sensor', description: 'DHT22 sensor with power filtering and I2C output.', icon: '🌡️' },
    { id: 'usb_power', label: 'USB-C Power Bank', description: 'Simple 5V USB-C power output with protection circuit.', icon: '🔋' },
    { id: 'blank', label: 'Blank Canvas', description: 'Start fresh with an empty schematic.', icon: '✏️' },
  ],
  engineer: [
    { id: 'esp32', label: 'ESP32-S3 Module', description: 'Full-featured ESP32-S3 with USB, antenna, decoupling.', icon: '📡' },
    { id: 'buck', label: 'Buck Converter', description: '12V → 3.3V switching power supply, 2A rated.', icon: '⚡' },
    { id: 'motor', label: 'H-Bridge Motor Driver', description: 'Dual H-bridge with current sensing and protection.', icon: '⚙️' },
    { id: 'blank', label: 'Blank Canvas', description: 'Start fresh — you know what you\'re doing.', icon: '✏️' },
  ],
  studio: [
    { id: 'iot_node', label: 'IoT Sensor Node', description: 'Wi-Fi sensor platform ready for team iteration.', icon: '📶' },
    { id: 'power_mgmt', label: 'Power Management', description: 'Multi-rail power architecture with BOM cost tracking.', icon: '🔌' },
    { id: 'carrier', label: 'Carrier Board', description: 'Modular carrier for Raspberry Pi CM4 or Jetson Nano.', icon: '🖥️' },
    { id: 'blank', label: 'Blank Canvas', description: 'Start from scratch as a team.', icon: '✏️' },
  ],
};

const STEPS = ['Welcome', 'Template', 'Name'];

export default function OnboardingWizard({ mode, onFinish, onSkip }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [projectName, setProjectName] = useState('');

  const templates = TEMPLATES[mode];
  const modeLabel = mode === 'maker' ? 'Maker' : mode === 'engineer' ? 'Engineer' : 'Studio';
  const modeColor = mode === 'maker' ? 'amber' : mode === 'engineer' ? 'indigo' : 'purple';

  const handleFinish = () => {
    const name = projectName.trim() || 'Untitled Design';
    onFinish(name, selectedTemplate);
  };

  const modeIntro = {
    maker: {
      headline: 'Welcome to Maker Mode',
      sub: 'NovaCircuit will guide you every step of the way. Tooltips, templates, and an AI assistant that actually explains what it\'s doing.',
      tips: ['Start with a template to learn faster', 'Hover any component for instant help', 'Ask the AI to explain anything'],
    },
    engineer: {
      headline: 'Welcome to Engineer Mode',
      sub: 'Full control. No hand-holding. NovaCircuit gets out of your way and gives you the tools to build production-ready boards fast.',
      tips: ['AI actions show a clear credit cost before running', 'All DRC rules are configurable per net class', 'Multi-layer up to 8 layers supported'],
    },
    studio: {
      headline: 'Welcome to Studio Mode',
      sub: 'Collaboration-first design. Invite your team, track BOM costs in real time, and ship boards 40% faster with shared review workflows.',
      tips: ['Share your workspace with a single link', 'Credit usage is visible to the whole team', 'Comment threads attach directly to traces'],
    },
  }[mode];

  return (
    <div className="fixed inset-0 bg-[#050507] flex items-center justify-center z-50 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.04)_0%,transparent_70%)]" />

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -30 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-xl bg-[#0e0e12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative z-10"
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

        {/* Progress */}
        <div className="flex items-center gap-1.5 px-6 pt-5 pb-0">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={cn(
                'flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest',
                i === step ? 'text-white' : i < step ? 'text-indigo-400' : 'text-gray-700'
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black border',
                  i === step ? 'bg-indigo-600 border-indigo-500 text-white' :
                  i < step ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' :
                  'bg-white/5 border-white/10 text-gray-600'
                )}>
                  {i < step ? <Check size={10} /> : i + 1}
                </div>
                {s}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('flex-1 h-[1px]', i < step ? 'bg-indigo-500/40' : 'bg-white/5')} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="p-6">
          {/* STEP 0: Welcome */}
          {step === 0 && (
            <div>
              <div className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center mb-4',
                `bg-${modeColor}-500/10 border border-${modeColor}-500/20`
              )}>
                {mode === 'maker' && <Sparkles size={24} className="text-amber-400" />}
                {mode === 'engineer' && <Cpu size={24} className="text-indigo-400" />}
                {mode === 'studio' && <Users size={24} className="text-purple-400" />}
              </div>
              <h2 className="text-2xl font-black text-white mb-2 tracking-tight">{modeIntro.headline}</h2>
              <p className="text-gray-400 text-sm leading-relaxed mb-5">{modeIntro.sub}</p>
              <div className="space-y-2 mb-2">
                {modeIntro.tips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', `bg-${modeColor}-400`)} />
                    <p className="text-[12px] text-gray-400">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 1: Template */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-black text-white mb-1 tracking-tight">Pick a starting point</h2>
              <p className="text-gray-500 text-xs mb-4">You can always change this later or start fresh.</p>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={cn(
                      'text-left p-3 rounded-xl border transition-all cursor-pointer',
                      selectedTemplate === t.id
                        ? 'bg-indigo-500/10 border-indigo-500/60 shadow-[0_0_20px_rgba(99,102,241,0.1)]'
                        : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
                    )}
                  >
                    <div className="text-2xl mb-1.5">{t.icon}</div>
                    <div className="text-[12px] font-black text-white mb-0.5">{t.label}</div>
                    <div className="text-[10px] text-gray-500 leading-tight">{t.description}</div>
                    {selectedTemplate === t.id && (
                      <div className="mt-1.5 flex items-center gap-1 text-[9px] text-indigo-400 font-bold">
                        <Check size={9} /> Selected
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Name */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-black text-white mb-1 tracking-tight">Name your project</h2>
              <p className="text-gray-500 text-xs mb-4">Give your design a name. You can rename it any time.</p>
              <input
                type="text"
                autoFocus
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFinish()}
                placeholder="e.g. IoT Sensor Board v1"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium focus:outline-none focus:border-indigo-500 transition-all placeholder:text-gray-600 mb-4"
                maxLength={60}
              />
              <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Template</div>
                  <div className="text-[12px] text-white font-bold">
                    {templates.find(t => t.id === selectedTemplate)?.label}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Mode</div>
                  <div className={cn('text-[12px] font-bold', `text-${modeColor}-400`)}>{modeLabel}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <button
            onClick={onSkip}
            className="text-[10px] text-gray-600 hover:text-gray-400 font-bold uppercase tracking-widest transition-colors cursor-pointer"
          >
            Skip setup
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1.5 px-4 py-2 border border-white/10 text-gray-400 hover:text-white rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                <ChevronLeft size={12} /> Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
              >
                Next <ChevronRight size={12} />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
              >
                Launch Studio <Zap size={12} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
