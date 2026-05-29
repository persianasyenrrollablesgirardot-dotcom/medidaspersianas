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

export default function App() {
  useEffect(() => {
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
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ style: { background: '#111', color: '#fff', border: '1px solid #2b2b2b' } }} />
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/project/:id" element={<ProjectSetup />} />
          <Route path="/project/:id/quote" element={<QuickQuoteModule />} />
          <Route path="/project/:id/detail" element={<ProjectDetail />} />
          <Route path="/project/:id/spaces" element={<SpaceList />} />
          <Route path="/project/:id/space/:spaceId" element={<WindowList />} />
          <Route path="/project/:id/space/:spaceId/window/:windowId" element={<WindowWorkspace />} />
          <Route path="/exports" element={<ExportCenter />} />
          <Route path="/facturacion" element={<Facturacion />} />
          <Route path="/papelera" element={<ProjectTrash />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
