import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useEffect } from 'react';
import { db, DEFAULT_CATALOG } from './db';
import { DEFAULT_MAINTENANCE_CATALOG } from './lib/defaultTasks';
import { Shell } from './components/Shell';
import { Dashboard } from './pages/Dashboard';
import { ProjectSetup } from './pages/ProjectSetup';
import { SpaceList } from './pages/SpaceList';
import { WindowList } from './pages/WindowList';
import { WindowWorkspace } from './pages/WindowWorkspace';
import { ExportCenter } from './pages/ExportCenter';
import { ProjectTrash } from './pages/ProjectTrash';
import { ProjectDetail } from './pages/ProjectDetail';
import { QuickQuoteModule } from './pages/QuickQuoteModule';
import { Facturacion } from './pages/Facturacion';
import { Settings } from './pages/Settings';
import { Contabilidad } from './pages/Contabilidad';
import { AdminPanel } from './pages/AdminPanel';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './components/AuthContext';
import { SupplierWindowView } from './pages/SupplierWindowView';
import { autoCompressOldEvidence } from './lib/localFallbackStore';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: ('admin' | 'proveedor')[] }) {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    autoCompressOldEvidence();
    
    db.catalog.toCollection().first().then(cat => {
      if (cat && cat.id) {
        if (!cat.maintenanceCatalog || cat.maintenanceCatalog.length === 0) {
          db.catalog.update(cat.id, { maintenanceCatalog: DEFAULT_MAINTENANCE_CATALOG });
        }
      } else {
        db.catalog.add({ ...DEFAULT_CATALOG, maintenanceCatalog: DEFAULT_MAINTENANCE_CATALOG, lastUpdatedAt: Date.now() });
      }
    });
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-center" toastOptions={{ style: { background: '#111', color: '#fff', border: '1px solid #2b2b2b' } }} />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <Shell>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/project/:id" element={<ProjectSetup />} />
                  <Route path="/project/:id/quote" element={<QuickQuoteModule />} />
                  <Route path="/project/:id/detail" element={<ProjectDetail />} />
                  <Route path="/project/:id/spaces" element={<SpaceList />} />
                  <Route path="/project/:id/space/:spaceId" element={<WindowList />} />
                  <Route path="/project/:id/space/:spaceId/supplier-window/:windowId" element={<SupplierWindowView />} />
                  <Route path="/project/:id/space/:spaceId/window/:windowId" element={<WindowWorkspace />} />
                  <Route path="/exports" element={<ExportCenter />} />
                  <Route path="/facturacion" element={<ProtectedRoute allowedRoles={['admin']}><Facturacion /></ProtectedRoute>} />
                  <Route path="/contabilidad" element={<ProtectedRoute allowedRoles={['admin']}><Contabilidad /></ProtectedRoute>} />
                  <Route path="/papelera" element={<ProtectedRoute allowedRoles={['admin']}><ProjectTrash /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><Settings /></ProtectedRoute>} />
                  <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminPanel /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Shell>
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
