import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, dbFirestore } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'proveedor' | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'proveedor' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const userDoc = await getDoc(doc(dbFirestore, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role);
          } else {
            // Auto-assign admin if it's the specific email
            if (firebaseUser.email === 'persianasyenrrollablesgirardot@gmail.com') {
              await setDoc(doc(dbFirestore, 'users', firebaseUser.uid), { role: 'admin', email: firebaseUser.email });
              setRole('admin');
            } else {
              setRole('proveedor');
            }
          }
        } catch (e) {
          console.error('Error fetching role:', e);
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, logout }}>
      {!loading ? children : <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}>Cargando sesión...</div>}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
