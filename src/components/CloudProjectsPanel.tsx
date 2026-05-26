import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  updateDoc 
} from 'firebase/firestore';
import { 
  Cloud, 
  CloudLightning, 
  CloudOff, 
  Database, 
  Save, 
  FolderOpen, 
  Trash2, 
  LogOut, 
  LogIn, 
  Loader2, 
  Globe, 
  Lock, 
  X, 
  AlertTriangle 
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useProjectStore } from '../lib/core/store';
import { ProjectGraph } from '../types';

interface CloudProjectsPanelProps {
  onClose: () => void;
  applyGraphToEditor?: (graph: ProjectGraph) => void;
}

export const CloudProjectsPanel: React.FC<CloudProjectsPanelProps> = ({ 
  onClose,
  applyGraphToEditor 
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [sysLog, setSysLog] = useState<string[]>([]);

  // Access the live layout state
  const currentGraph = useProjectStore(state => state.graph);
  const commitTransaction = useProjectStore(state => state.commitTransaction);

  // Sync auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoadingAuth(false);
      if (user) {
        logMessage(`AUTHENTICATED: Signed in as ${user.displayName || user.email}`);
        fetchUserProjects(user.uid);
      } else {
        logMessage('ANONYMOUS: No cloud portfolio loaded');
        setProjects([]);
      }
    });
    return unsubscribe;
  }, []);

  const logMessage = (msg: string) => {
    setSysLog(prev => `[${new Date().toLocaleTimeString()}] ${msg}`.split('\n').concat(prev).slice(0, 5));
  };

  const handleGoogleSignIn = async () => {
    setLoadingAuth(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      logMessage(`SUCCESS: Authenticated ${result.user.displayName}`);
    } catch (err: any) {
      logMessage(`ERROR: Sign in failed - ${err.message}`);
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      logMessage("INFO: Signed out of cloud session");
    } catch (err: any) {
      logMessage(`ERROR: Log out failed - ${err.message}`);
    }
  };

  const fetchUserProjects = async (uid: string) => {
    setLoadingProjects(true);
    const path = 'projects';
    try {
      const projectsRef = collection(db, path);
      const q = query(
        projectsRef,
        where('ownerId', '==', uid),
        orderBy('updatedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const list: any[] = [];
      querySnapshot.forEach((doc) => {
        list.push({ docId: doc.id, ...doc.data() });
      });
      setProjects(list);
      logMessage(`INFO: Retrieved ${list.length} designs from Cloud Portfolio`);
    } catch (err: any) {
      logMessage(`ERROR: Fetch failed - ${err.message}`);
      handleFirestoreError(err, OperationType.LIST, path);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleSaveActiveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!saveName.trim()) {
      logMessage("WARN: Please provide a descriptive project name");
      return;
    }

    setSaving(true);
    const docId = `proj_${currentUser.uid}_${Date.now()}`;
    const path = `projects/${docId}`;
    
    // Inject the name into the graph if not already populated
    const graphCopy = { ...currentGraph, name: saveName.trim() };

    const payload = {
      id: docId,
      name: saveName.trim(),
      ownerId: currentUser.uid,
      ownerEmail: currentUser.email || 'collaborator@firsteda.io',
      componentsCount: currentGraph.components?.length || 0,
      tracesCount: currentGraph.traces?.length || 0,
      isPublic: isPublic,
      graph: graphCopy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'projects', docId), payload);
      logMessage(`SUCCESS: Saved design "${saveName.trim()}" successfully.`);
      setSaveName('');
      fetchUserProjects(currentUser.uid);
    } catch (err: any) {
      logMessage(`ERROR: Transmit fail - ${err.message}`);
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadProject = (proj: any) => {
    try {
      commitTransaction(proj.graph);
      if (applyGraphToEditor) {
        applyGraphToEditor(proj.graph);
      }
      logMessage(`SUCCESS: Instantiated schematic block: "${proj.name}"`);
      onClose();
    } catch (err: any) {
      logMessage(`ERROR: Schematic mapping failure - ${err.message}`);
    }
  };

  const handleDeleteProject = async (docId: string, name: string) => {
    if (!currentUser) return;
    if (!window.confirm(`Are you sure you want to permanently delete "${name}" from your cloud database?`)) return;

    const path = `projects/${docId}`;
    try {
      await deleteDoc(doc(db, 'projects', docId));
      logMessage(`REMOVED: "${name}" has been wiped.`);
      fetchUserProjects(currentUser.uid);
    } catch (err: any) {
      logMessage(`ERROR: Eradication failed - ${err.message}`);
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleTogglePublic = async (docId: string, currentVal: boolean, name: string) => {
    const path = `projects/${docId}`;
    try {
      const docRef = doc(db, 'projects', docId);
      await updateDoc(docRef, { 
        isPublic: !currentVal,
        updatedAt: serverTimestamp() 
      });
      logMessage(`MUTATION: Checked visibility for "${name}" -> ${!currentVal ? 'PUBLIC' : 'PRIVATE'}`);
      if (currentUser) fetchUserProjects(currentUser.uid);
    } catch (err: any) {
      logMessage(`ERROR: Access override failed - ${err.message}`);
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in font-mono">
      <div className="w-full max-w-2xl bg-[#0a0a0d] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Header bar */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Cloud size={14} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase text-white tracking-widest leading-none">Cloud Design Vault</h2>
              <p className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mt-1">Firebase Secure Persistence Hub</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer min-h-[30px]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          
          {loadingAuth ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500 text-[10px]">
              <Loader2 className="animate-spin text-indigo-500" size={20} />
              <span className="uppercase font-black tracking-widest">Resolving Authentication Lock...</span>
            </div>
          ) : !currentUser ? (
            /* Login view */
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-16 h-16 rounded-3xl bg-[#111115] border border-white/5 flex items-center justify-center text-zinc-500 shadow-inner">
                <Database size={28} />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="text-sm font-black uppercase text-white tracking-widest">Connect to live Cloud database</h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide leading-relaxed">
                  Log in securely using your Google Credentials to enable real-time continuous design backup, custom blueprint version logs, and shareable project portfolios.
                </p>
              </div>
              <button
                onClick={handleGoogleSignIn}
                className="flex items-center gap-2 px-6 min-h-[44px] bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
              >
                <LogIn size={12} />
                <span>Sign In With Google</span>
              </button>
            </div>
          ) : (
            /* Logged in view */
            <div className="space-y-6">
              
              {/* User badge */}
              <div className="p-3 bg-[#111115] border border-white/5 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {currentUser.photoURL ? (
                    <img src={currentUser.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center font-bold text-indigo-400 text-xs">
                      {currentUser.displayName?.slice(0,2).toUpperCase() || 'U'}
                    </div>
                  )}
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-white leading-none mb-1">{currentUser.displayName || 'Authorized Designer'}</h4>
                    <p className="text-[8px] text-zinc-500 font-bold tracking-tight lowercase">{currentUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-950/60 text-rose-400 border border-rose-500/20 rounded-lg text-[8px] font-bold uppercase cursor-pointer tracking-wider transition-all"
                >
                  <LogOut size={10} />
                  <span>Logout</span>
                </button>
              </div>

              {/* Save Active Block section */}
              <div className="p-4 bg-white/[0.01] border border-white/5 rounded-xl space-y-3">
                <div className="flex items-center gap-1.5 border-b border-white/5 pb-2">
                  <Save size={12} className="text-indigo-400" />
                  <span className="text-[9px] font-black uppercase text-zinc-300 tracking-wider">Save active layout state to Cloud</span>
                </div>

                <form onSubmit={handleSaveActiveProject} className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g. ESP32 Wifi Coprocessor Block"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      className="flex-1 px-3 min-h-[44px] bg-[#0c0c10] border border-white/10 rounded-xl text-[10px] text-white font-bold tracking-wider placeholder-zinc-700 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setIsPublic(!isPublic)}
                      title={isPublic ? "Mark Private" : "Mark Public"}
                      className={`px-3 min-h-[44px] border rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                        isPublic 
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                          : 'bg-[#0c0c10] border-white/10 text-zinc-600 hover:text-zinc-400'
                      }`}
                    >
                      {isPublic ? <Globe size={13} /> : <Lock size={13} />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={saving || !saveName.trim()}
                    className="sm:px-5 min-h-[44px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md"
                  >
                    {saving ? (
                      <Loader2 className="animate-spin" size={12} />
                    ) : (
                      <CloudLightning size={12} />
                    )}
                    <span>Transmit Block</span>
                  </button>
                </form>
                <div className="flex items-center gap-1.5 text-[8px] text-zinc-600 font-bold uppercase">
                  <span>Workspace components: <strong className="text-zinc-500">{currentGraph.components?.length || 0}</strong></span>
                  <span>•</span>
                  <span>Wires & Nets: <strong className="text-zinc-500">{currentGraph.nets?.length || 0}</strong></span>
                </div>
              </div>

              {/* Cloud Listings Portfolio */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Database size={11} className="text-indigo-400" />
                    <span className="text-[9px] font-black uppercase text-zinc-300 tracking-wider">Saved Design Snapshots</span>
                  </div>
                  <span className="text-[8px] text-zinc-600 font-bold uppercase">{projects.length} files saved</span>
                </div>

                {loadingProjects ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2 text-zinc-600 text-[9px]">
                    <Loader2 className="animate-spin text-zinc-600" size={14} />
                    <span>Synchronizing ledger...</span>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="p-6 border border-dashed border-white/5 bg-white/[0.005] rounded-xl text-center">
                    <p className="text-[9px] text-zinc-600 uppercase font-bold tracking-widest">No layouts saved in your cloud vault yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 max-h-[180px] overflow-y-auto pr-1 border border-white/5 rounded-xl bg-black/20">
                    {projects.map((proj) => (
                      <div key={proj.docId} className="p-3 hover:bg-white/[0.02] transition-colors flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase text-white truncate max-w-[200px] sm:max-w-xs">{proj.name}</span>
                            <button
                              onClick={() => handleTogglePublic(proj.docId, proj.isPublic, proj.name)}
                              title={proj.isPublic ? "Publicly Accessible" : "Private Archive"}
                              className={`p-1 rounded-md transition-colors ${
                                proj.isPublic 
                                  ? 'text-emerald-400 hover:bg-emerald-500/10' 
                                  : 'text-zinc-600 hover:bg-white/5'
                              }`}
                            >
                              {proj.isPublic ? <Globe size={9} /> : <Lock size={9} />}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-[8px] text-zinc-500 font-bold uppercase tracking-wide">
                            <span className="font-mono text-zinc-400">c:{proj.componentsCount || 0}</span>
                            <span>•</span>
                            <span className="font-mono text-zinc-400">t:{proj.tracesCount || 0}</span>
                            <span>•</span>
                            <span>{proj.updatedAt ? new Date(proj.updatedAt.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleLoadProject(proj)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-600 hover:text-white border border-indigo-500/20 rounded-lg text-[8px] font-bold uppercase tracking-wider text-indigo-400 transition-all cursor-pointer"
                          >
                            <FolderOpen size={9} />
                            <span>Load</span>
                          </button>
                          <button
                            onClick={() => handleDeleteProject(proj.docId, proj.name)}
                            className="p-1.5 text-zinc-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer min-h-[26px] min-w-[26px] flex items-center justify-center"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Diagnostics logging block */}
          <div className="p-3 bg-black border border-white/5 rounded-xl font-mono text-[8px] text-zinc-600 space-y-1 select-none">
            <div className="flex items-center gap-1 border-b border-white/5 pb-1 mb-1 font-black uppercase text-zinc-500">
              <CloudOff size={9} />
              <span>Diagnostic System Logs</span>
            </div>
            {sysLog.length === 0 ? (
              <p className="italic">Telemetry logs stand ready...</p>
            ) : (
              sysLog.map((log, index) => (
                <p key={index} className="truncate">{log}</p>
              ))
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
