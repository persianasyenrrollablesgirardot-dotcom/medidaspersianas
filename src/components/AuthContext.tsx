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
    const OWNER_EMAIL = 'persianasyenrrollablesgirardot@gmail.com';
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // El DUEÑO siempre es admin — no depende de Firestore ni de la red.
        // (Antes: si el doc users/{uid} quedaba con role 'proveedor', o la lectura
        //  fallaba, el dueño caía a la vista de usuario y quedaba atrapado.)
        if (firebaseUser.email === OWNER_EMAIL) {
          setRole('admin');
          // Best-effort: dejar el doc correcto, sin bloquear el arranque.
          setDoc(doc(dbFirestore, 'users', firebaseUser.uid), { role: 'admin', email: firebaseUser.email }, { merge: true }).catch(() => {});
        } else {
          try {
            const userDoc = await getDoc(doc(dbFirestore, 'users', firebaseUser.uid));
            setRole(userDoc.exists() ? (userDoc.data().role ?? 'proveedor') : 'proveedor');
          } catch (e) {
            console.error('Error fetching role:', e);
            setRole('proveedor'); // por defecto restrictivo si falla la lectura
          }
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
