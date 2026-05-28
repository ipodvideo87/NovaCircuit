import { useEffect, useState } from 'react';
import SchematicEditor from './components/SchematicEditor';
import PricingModal from './components/PricingModal';
import ModeSelector, { UserMode } from './components/ModeSelector';
import OnboardingWizard from './components/OnboardingWizard';
import { useProjectStore } from './lib/core/store';

type AppScreen = 'mode-select' | 'onboarding' | 'workspace';

export default function App() {
  const initAuthListener = useProjectStore(state => state.initAuthListener);
  const [screen, setScreen] = useState<AppScreen>('mode-select');
  const [userMode, setUserMode] = useState<UserMode>('engineer');

  useEffect(() => {
    initAuthListener();
  }, [initAuthListener]);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // Persist mode to localStorage
  useEffect(() => {
    const saved = localStorage.getItem('nova_user_mode') as UserMode | null;
    const onboarded = localStorage.getItem('nova_onboarded');
    if (saved && onboarded) {
      setUserMode(saved);
      setScreen('workspace');
    }
  }, []);

  const handleModeSelect = (mode: UserMode) => {
    setUserMode(mode);
    localStorage.setItem('nova_user_mode', mode);
    setScreen('onboarding');
  };

  const handleOnboardingFinish = (projectName: string, _template: string) => {
    localStorage.setItem('nova_onboarded', '1');
    if (projectName && projectName !== 'Untitled Design') {
      useProjectStore.getState().saveProject?.(projectName);
    }
    setScreen('workspace');
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem('nova_onboarded', '1');
    setScreen('workspace');
  };

  if (screen === 'mode-select') {
    return <ModeSelector onSelect={handleModeSelect} />;
  }

  if (screen === 'onboarding') {
    return (
      <OnboardingWizard
        mode={userMode}
        onFinish={handleOnboardingFinish}
        onSkip={handleOnboardingSkip}
      />
    );
  }

  return (
    <div className="w-full h-[100dvh] overflow-hidden bg-[#0a0a0a]">
      <SchematicEditor userMode={userMode} onChangeMode={(m) => {
        setUserMode(m);
        localStorage.setItem('nova_user_mode', m);
      }} />
      <PricingModal />
    </div>
  );
}
