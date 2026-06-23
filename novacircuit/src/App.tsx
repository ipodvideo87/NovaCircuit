import React from 'react';
import PCBEditor from './components/PCBEditor';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <PCBEditor />
    </ErrorBoundary>
  );
};

export default App;
