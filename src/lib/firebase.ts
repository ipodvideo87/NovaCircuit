import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  increment,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

export interface UserProfile {
  uid: string;
  isPro: boolean;
  isAdmin?: boolean;
  aiActionsThisMonth: number;
  boardsThisMonth: number;
  stripeCustomerId?: string;
  updatedAt?: string;
}

export interface SavedProject {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  componentsCount: number;
  tracesCount: number;
  isPublic: boolean;
  graph: any;
  createdAt: string;
  updatedAt: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL CONSTRAINT: Validate Connection to Firestore on startup
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();

// Load active email profile from Firestore or instantiate a Free Tier baseline
export async function getOrCreateUserProfile(userId: string, email?: string | null): Promise<UserProfile> {
  const profileRef = doc(db, 'users', userId);
  const isOwner = !!(email && (email === 'spankie837@gmail.com' || email.endsWith('@novacircuit.io')));
  try {
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      // If owner but not marked as pro/admin in firestore, auto-upgrade them
      if (isOwner && (!data.isPro || !data.isAdmin)) {
        const enriched: UserProfile = {
          ...data,
          isPro: true,
          isAdmin: true,
          updatedAt: new Date().toISOString()
        };
        await setDoc(profileRef, enriched);
        return enriched;
      }
      return data;
    } else {
      const baseline: UserProfile = {
        uid: userId,
        isPro: isOwner,
        isAdmin: isOwner,
        aiActionsThisMonth: 0,
        boardsThisMonth: 0,
        updatedAt: new Date().toISOString()
      };
      await setDoc(profileRef, baseline);
      return baseline;
    }
  } catch (error) {
    return handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  }
}

// Increments user actions
export async function incrementAIActionCount(userId: string): Promise<void> {
  const profileRef = doc(db, 'users', userId);
  try {
    await updateDoc(profileRef, {
      aiActionsThisMonth: increment(1)
    });
  } catch (error) {
    try {
      await getOrCreateUserProfile(userId);
      await updateDoc(profileRef, {
        aiActionsThisMonth: increment(1)
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}`);
    }
  }
}

// Increments board counts
export async function incrementBoardCount(userId: string): Promise<void> {
  const profileRef = doc(db, 'users', userId);
  try {
    await updateDoc(profileRef, {
      boardsThisMonth: increment(1)
    });
  } catch (error) {
    try {
      await getOrCreateUserProfile(userId);
      await updateDoc(profileRef, {
        boardsThisMonth: increment(1)
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}`);
    }
  }
}

// Upgrades/Downgrades subscription
export async function updateProfileSubscription(userId: string, isPro: boolean): Promise<UserProfile> {
  const profileRef = doc(db, 'users', userId);
  try {
    const updatePayload = {
      isPro,
      updatedAt: new Date().toISOString()
    };
    await updateDoc(profileRef, updatePayload);
    const updated = await getDoc(profileRef);
    return updated.data() as UserProfile;
  } catch (error) {
    return handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
}

// Save Project to Firestore
export async function saveProjectToFirestore(project: Omit<SavedProject, 'createdAt' | 'updatedAt'>, isNew: boolean = false): Promise<void> {
  const projectRef = doc(db, 'projects', project.id);
  const currentTime = new Date().toISOString();
  try {
    if (isNew) {
      const newDoc: SavedProject = {
        ...project,
        createdAt: currentTime,
        updatedAt: currentTime
      };
      await setDoc(projectRef, newDoc);
    } else {
      const snap = await getDoc(projectRef);
      const originalCreatedAt = snap.exists() ? snap.data().createdAt : currentTime;
      
      const payload: SavedProject = {
        ...project,
        createdAt: originalCreatedAt,
        updatedAt: currentTime
      };
      await setDoc(projectRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, `projects/${project.id}`);
  }
}

// Load Project from Firestore
export async function loadProjectFromFirestore(projectId: string): Promise<SavedProject | null> {
  const projectRef = doc(db, 'projects', projectId);
  try {
    const snap = await getDoc(projectRef);
    if (snap.exists()) {
      return snap.data() as SavedProject;
    }
    return null;
  } catch (error) {
    return handleFirestoreError(error, OperationType.GET, `projects/${projectId}`);
  }
}

// Get user projects
export async function getUserProjects(userId: string): Promise<SavedProject[]> {
  try {
    const q = query(collection(db, 'projects'), where('ownerId', '==', userId));
    const snap = await getDocs(q);
    const projects: SavedProject[] = [];
    snap.forEach((docSnap) => {
      projects.push(docSnap.data() as SavedProject);
    });
    return projects;
  } catch (error) {
    return handleFirestoreError(error, OperationType.LIST, `projects`);
  }
}

// Sign-in popup wrapper
export async function signInWithGooglePopup() {
  const provider = new GoogleAuthProvider();
  try {
    const res = await signInWithPopup(auth, provider);
    return res.user;
  } catch (e) {
    console.error("Authentication popup failed:", e);
    throw e;
  }
}

// Signout popup wrapper
export async function signOutUser() {
  await signOut(auth);
}

