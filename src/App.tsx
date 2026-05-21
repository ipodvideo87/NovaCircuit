/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import SchematicEditor from './components/SchematicEditor';

export default function App() {
  // Prevent default context menu for a more native feel
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  return (
    <div className="w-full h-[100dvh] overflow-hidden bg-[#0a0a0a]">
      <SchematicEditor />
    </div>
  );
}

