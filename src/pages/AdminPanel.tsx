import { useState, useEffect } from 'react';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { dbFirestore, secondaryAuth } from '../lib/firebase';
import toast from 'react-hot-toast';

export function AdminPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const snapshot = await getDocs(collection(dbFirestore, 'users'));
      const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(usersList);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar usuarios');
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) return toast.error('Correo inválido o contraseña muy corta (min 6)');
    
    setLoading(true);
    try {
      // Usamos secondaryAuth para crear el usuario sin cerrar la sesión actual del administrador
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      
      // Guardamos el rol en firestore
      await setDoc(doc(dbFirestore, 'users', userCredential.user.uid), {
        email,
        role: 'proveedor',
        createdAt: Date.now()
      });
      
      toast.success('Proveedor creado con éxito');
      setEmail('');
      setPassword('');
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al crear proveedor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <p>Panel de Control</p>
        <h1>Administración de Usuarios</h1>
      </header>

      <section className="form-section" style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', marginTop: '20px' }}>
        <h2>Crear Nuevo Proveedor</h2>
        <form onSubmit={handleCreateSupplier} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginTop: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px' }}>Correo Electrónico</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="proveedor@empresa.com"
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px' }}>Contraseña</label>
            <input 
              type="text" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="mínimo 6 caracteres"
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
            />
          </div>
          <button type="submit" className="primary" disabled={loading} style={{ padding: '10px 20px', height: '42px' }}>
            {loading ? 'Creando...' : 'Crear Proveedor'}
          </button>
        </form>
      </section>

      <section className="list" style={{ marginTop: '20px' }}>
        <h2>Usuarios Registrados ({users.length})</h2>
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {users.map(u => (
            <article key={u.id} className="project-card" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px' }}>
              <div>
                <strong>{u.email}</strong>
                <span style={{ color: 'var(--muted)', display: 'block', fontSize: '12px' }}>ID: {u.id}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ 
                  background: u.role === 'admin' ? 'var(--blue)' : 'var(--success)', 
                  color: 'white', 
                  padding: '4px 12px', 
                  borderRadius: '20px', 
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {u.role?.toUpperCase()}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
