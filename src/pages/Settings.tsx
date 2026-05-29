import toast from 'react-hot-toast';
import { ArrowPathIcon, ExclamationTriangleIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { DEFAULT_CATALOG, db, resetLocalAppData } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TechnicalCatalog } from '../types';
import { Field, SelectInput, TextInput } from '../components/Field';
import { MeasureInput } from '../components/MeasureInput';
import { DEFAULT_MAINTENANCE_TASKS } from '../lib/defaultTasks';

export function Settings() {
  const catalog = useLiveQuery<TechnicalCatalog | undefined>(() => db.catalog.toCollection().first().then(value => value || DEFAULT_CATALOG), []);

  const saveCatalogTasks = async (tasks: typeof DEFAULT_CATALOG.maintenanceTasks) => {
    if (!catalog?.id) return;
    try {
      await db.catalog.update(catalog.id, { maintenanceTasks: tasks, lastUpdatedAt: Date.now() });
      toast.success('Catalogo guardado');
    } catch(e) {
      toast.error('Error al guardar catalogo');
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
            <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 14 }}>
              Configura los servicios de mantenimiento que ofreces y su precio sugerido.
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              {catalog?.maintenanceTasks?.map((task: any) => (
                <div key={task.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Sistema"><SelectInput value={task.system} onChange={e => {
                      const newTasks = catalog.maintenanceTasks.map((t: any) => t.id === task.id ? { ...t, system: e.target.value } : t);
                      saveCatalogTasks(newTasks);
                    }}>
                      {catalog.systems.map(s => <option key={s} value={s}>{s}</option>)}
                    </SelectInput></Field>
                  </div>
                  <div style={{ flex: 2 }}>
                    <Field label="Servicio"><TextInput value={task.label} onChange={e => {
                      const newTasks = catalog.maintenanceTasks.map((t: any) => t.id === task.id ? { ...t, label: e.target.value } : t);
                      saveCatalogTasks(newTasks);
                    }} /></Field>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Precio Base"><MeasureInput unit="COP" value={task.defaultPrice} onChange={(v: number | undefined) => {
                      const newTasks = catalog.maintenanceTasks.map((t: any) => t.id === task.id ? { ...t, defaultPrice: v || 0 } : t);
                      saveCatalogTasks(newTasks);
                    }} /></Field>
                  </div>
                  <button className="secondary danger-outline" style={{ height: '40px', padding: '0 12px' }} onClick={() => {
                    if(confirm('¿Borrar este servicio?')) {
                      saveCatalogTasks(catalog.maintenanceTasks.filter((t: any) => t.id !== task.id));
                    }
                  }}>
                    <TrashIcon className="icon" />
                  </button>
                </div>
              ))}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="secondary" onClick={() => {
                    const newId = 'maint_' + Date.now();
                    const newTasks = [...(catalog?.maintenanceTasks || []), { id: newId, system: catalog?.systems[0] || 'Enrollables', label: 'Nuevo servicio', defaultPrice: 0 }];
                    saveCatalogTasks(newTasks);
                  }}>
                    <PlusIcon className="icon" /> Añadir servicio
                  </button>
                  <button className="secondary outline" onClick={() => {
                    if(confirm('¿Sobrescribir tu lista actual con la Lista Maestra de más de 200 servicios (por defecto)? Perderás tus precios personalizados actuales.')) {
                      saveCatalogTasks(DEFAULT_MAINTENANCE_TASKS);
                    }
                  }}>
                    <ArrowPathIcon className="icon" /> Cargar Lista Maestra
                  </button>
                </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 24 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Actualización de la App</h3>
            <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 14 }}>
              Busca e instala la última versión de la aplicación. Usa esta opción si sabes que hay cambios recientes y no los ves reflejados.
            </p>
            <button className="primary" onClick={checkUpdate}>
              <ArrowPathIcon className="icon" /> Refrescar / Actualizar App
            </button>
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
