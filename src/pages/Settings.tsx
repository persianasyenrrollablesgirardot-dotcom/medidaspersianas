import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { DEFAULT_CATALOG, db, resetLocalAppData } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TechnicalCatalog } from '../types';
import { Field } from '../components/Field';
import { MeasureInput } from '../components/MeasureInput';

export function Settings() {
  const catalog = useLiveQuery<TechnicalCatalog | undefined>(() => db.catalog.toCollection().first().then(value => value || DEFAULT_CATALOG), []);
  const [activeSystem, setActiveSystem] = useState<string>('Enrollables Blackout');

  const saveCatalogTasks = async (tasks: typeof DEFAULT_CATALOG.maintenanceCatalog) => {
    try {
      if (catalog?.id) {
        await db.catalog.update(catalog.id, { maintenanceCatalog: tasks, lastUpdatedAt: Date.now() });
      } else {
        await db.catalog.add({ ...DEFAULT_CATALOG, maintenanceCatalog: tasks, lastUpdatedAt: Date.now() });
      }
      toast.success('Catálogo guardado');
    } catch(e) {
      toast.error('Error al guardar catálogo');
    }
  };

  const checkUpdate = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let reg of registrations) {
          await reg.update();
        }
      }
      toast.success('Descargando la nueva versión, la app se recargará...');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e) {
      console.error(e);
      toast.error('Error al actualizar la aplicación');
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <p>Configuración</p>
        <h1>Ajustes del Sistema</h1>
      </header>

      <section className="list">
        <div className="panel" style={{ padding: 24, display: 'grid', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Catálogo de Mantenimientos</h3>
            <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 14 }}>Configura los precios sugeridos para los servicios de mantenimiento. La lista de sistemas es estática.</p>
            <div className="h-scroll" style={{ marginBottom: '16px' }}>
              {(catalog?.maintenanceCatalog || []).map(sys => (
                <button key={sys.systemName} className={`pill ${activeSystem === sys.systemName ? 'active' : ''}`} onClick={() => setActiveSystem(sys.systemName)}>
                  {sys.systemName}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
              {(catalog?.maintenanceCatalog || []).find(s => s.systemName === activeSystem)?.services.map((task: any) => (
                <div key={task.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-subtle)', padding: '8px 12px', borderRadius: '6px' }}>
                  <div style={{ flex: 1 }}><strong>{task.label}</strong></div>
                  <div style={{ width: '120px' }}>
                    <Field label="Precio Base">
                      <MeasureInput unit="COP" value={task.defaultPrice} onChange={(v: number | undefined) => {
                        const newCat = catalog!.maintenanceCatalog.map(sys => sys.systemName === activeSystem ? { ...sys, services: sys.services.map(t => t.id === task.id ? { ...t, defaultPrice: v || 0 } : t) } : sys);
                        saveCatalogTasks(newCat);
                      }} />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>


            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 24 }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Actualización de la App</h3>
              <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 14 }}>
                Busca e instala la última versión de la aplicación. Usa esta opción si sabes que hay cambios recientes y no los ves reflejados.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="primary" onClick={checkUpdate}>
                  <ArrowPathIcon className="icon" /> Refrescar / Actualizar App
                </button>
                <button className="secondary outline" onClick={() => {
                  if(confirm('¿Forzar actualización limpiando el caché del navegador? No perderás tus proyectos ni facturas guardadas.')) {
                    import('../db').then(m => m.clearPwaCacheOnly());
                  }
                }}>
                  <ArrowPathIcon className="icon" /> Limpiar Caché y Forzar Actualización
                </button>
              </div>
            </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 24 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, color: 'var(--red)' }}>Opciones Avanzadas (Peligro)</h3>
            <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 14 }}>
              Esto borra todos los datos locales de esta app en este dispositivo y reinicia la app a su estado de fábrica. Usa esto <strong>solo</strong> si la app se queda bloqueada o si deseas vaciar completamente la base de datos local de manera destructiva.
            </p>
            <button
              className="secondary danger-outline"
              onClick={() => {
                if (confirm('PELIGRO: Esto borra los datos locales de esta app en este dispositivo y reinicia la app. Usalo solo si queda bloqueada o deseas borrar todo. ¿Estás absolutamente seguro?')) {
                  resetLocalAppData();
                }
              }}
            >
              <ExclamationTriangleIcon className="icon" /> Reiniciar app local (Borrar todo)
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
