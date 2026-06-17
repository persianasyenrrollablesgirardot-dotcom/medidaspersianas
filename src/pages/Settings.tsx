import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowPathIcon, ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { DEFAULT_CATALOG, db, resetLocalAppData } from '../db';
import { saveFallbackCatalog } from '../lib/localFallbackStore';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TechnicalCatalog } from '../types';
import { Field, SelectInput } from '../components/Field';
import { MeasureInput } from '../components/MeasureInput';

export function Settings() {
  const catalog = useLiveQuery<TechnicalCatalog | undefined>(() => db.catalog.toCollection().first().then(value => value || DEFAULT_CATALOG), []);
  const [activeSystem, setActiveSystem] = useState<string>('Enrollables Blackout');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('CUSTOM_CLAUDE_API_KEY') || '');

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('CUSTOM_CLAUDE_API_KEY', apiKey.trim());
      toast.success('Clave API de Claude guardada correctamente');
    } else {
      localStorage.removeItem('CUSTOM_CLAUDE_API_KEY');
      toast.success('Clave API restablecida al valor por defecto');
    }
  };

  const updateCatalogList = async (key: keyof TechnicalCatalog, newList: string[]) => {
    try {
      if (catalog?.id) {
        await db.catalog.update(catalog.id, { [key]: newList, lastUpdatedAt: Date.now() } as any);
      } else {
        await db.catalog.add({ ...DEFAULT_CATALOG, [key]: newList, lastUpdatedAt: Date.now() } as any);
      }
      saveFallbackCatalog({ [key]: newList });
    } catch (e) {
      toast.error('Error al actualizar catálogo');
    }
  };

  const saveCatalogTasks = async (tasks: typeof DEFAULT_CATALOG.maintenanceCatalog) => {
    try {
      if (catalog?.id) {
        await db.catalog.update(catalog.id, { maintenanceCatalog: tasks, lastUpdatedAt: Date.now() });
      } else {
        await db.catalog.add({ ...DEFAULT_CATALOG, maintenanceCatalog: tasks, lastUpdatedAt: Date.now() });
      }
      saveFallbackCatalog({ maintenanceCatalog: tasks });
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
              <h3 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Listas Desplegables</h3>
              
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: 16 }}>Tipos de Persiana (Sistemas)</h4>
                  <button className="secondary small" onClick={() => {
                    const val = prompt('Nuevo tipo de persiana:');
                    if (val && val.trim() && !catalog?.systems?.includes(val.trim())) updateCatalogList('systems', [...(catalog?.systems || []), val.trim()]);
                  }}>+ Añadir</button>
                </div>
                <p style={{ margin: '0 0 12px 0', color: 'var(--muted)', fontSize: 13 }}>Opciones para el campo "Tipo de persiana".</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(catalog?.systems || []).map(item => (
                    <span key={item} className="pill" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {item}
                      <button type="button" style={{ border: 'none', background: 'transparent', padding: '2px', cursor: 'pointer', color: 'var(--red)', borderRadius: '50%' }} onClick={() => confirm(`¿Eliminar ${item}?`) && updateCatalogList('systems', (catalog?.systems || []).filter(i => i !== item))}>
                         <TrashIcon className="icon" style={{ width: '12px', height: '12px' }} />
                      </button>
                    </span>
                  ))}
                  {catalog?.systems?.length === 0 && <span className="muted">No hay opciones configuradas.</span>}
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: 16 }}>Tipos de Instalación</h4>
                  <button className="secondary small" onClick={() => {
                    const val = prompt('Nuevo tipo de instalación:');
                    if (val && val.trim() && !catalog?.mounts?.includes(val.trim())) updateCatalogList('mounts', [...(catalog?.mounts || []), val.trim()]);
                  }}>+ Añadir</button>
                </div>
                <p style={{ margin: '0 0 12px 0', color: 'var(--muted)', fontSize: 13 }}>Opciones para el campo "Instalación de esta persiana".</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(catalog?.mounts || []).map(item => (
                    <span key={item} className="pill" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {item}
                      <button type="button" style={{ border: 'none', background: 'transparent', padding: '2px', cursor: 'pointer', color: 'var(--red)', borderRadius: '50%' }} onClick={() => confirm(`¿Eliminar ${item}?`) && updateCatalogList('mounts', (catalog?.mounts || []).filter(i => i !== item))}>
                         <TrashIcon className="icon" style={{ width: '12px', height: '12px' }} />
                      </button>
                    </span>
                  ))}
                  {catalog?.mounts?.length === 0 && <span className="muted">No hay opciones configuradas.</span>}
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: 16 }}>Tipos de Tela</h4>
                  <button className="secondary small" onClick={() => {
                    const val = prompt('Nuevo tipo de tela:');
                    if (val && val.trim() && !catalog?.fabrics?.includes(val.trim())) updateCatalogList('fabrics', [...(catalog?.fabrics || []), val.trim()]);
                  }}>+ Añadir</button>
                </div>
                <p style={{ margin: '0 0 12px 0', color: 'var(--muted)', fontSize: 13 }}>Opciones para el campo "Tipo de tela".</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(catalog?.fabrics || []).map(item => (
                    <span key={item} className="pill" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {item}
                      <button type="button" style={{ border: 'none', background: 'transparent', padding: '2px', cursor: 'pointer', color: 'var(--red)', borderRadius: '50%' }} onClick={() => confirm(`¿Eliminar ${item}?`) && updateCatalogList('fabrics', (catalog?.fabrics || []).filter(i => i !== item))}>
                         <TrashIcon className="icon" style={{ width: '12px', height: '12px' }} />
                      </button>
                    </span>
                  ))}
                  {catalog?.fabrics?.length === 0 && <span className="muted">No hay opciones configuradas.</span>}
                </div>
              </div>

              <hr style={{ borderColor: 'var(--line)', margin: '32px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>Catálogo de Mantenimientos</h3>
                <button 
                  className="secondary small" 
                  onClick={() => {
                    const name = prompt('Nombre del nuevo sistema (ej: Toldos):');
                    if (name && name.trim()) {
                      const newCat = [...(catalog?.maintenanceCatalog || []), { systemName: name.trim(), services: [] }];
                      saveCatalogTasks(newCat);
                      setActiveSystem(name.trim());
                    }
                  }}
                >
                  + Nuevo Sistema
                </button>
              </div>
              <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 14 }}>Configura los sistemas y precios sugeridos para los servicios de mantenimiento.</p>
              
              <div className="h-scroll" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {(catalog?.maintenanceCatalog || []).map(sys => (
                  <button key={sys.systemName} className={`pill ${activeSystem === sys.systemName ? 'active' : ''}`} onClick={() => setActiveSystem(sys.systemName)}>
                    {sys.systemName}
                  </button>
                ))}
                {activeSystem && (
                  <button 
                    className="danger text-sm" 
                    onClick={() => {
                      if (confirm(`¿Eliminar el sistema ${activeSystem} completamente?`)) {
                        const newCat = (catalog?.maintenanceCatalog || []).filter(s => s.systemName !== activeSystem);
                        saveCatalogTasks(newCat);
                        setActiveSystem(newCat.length > 0 ? newCat[0].systemName : '');
                      }
                    }}
                    style={{ marginLeft: 'auto', padding: '4px 8px' }}
                  >
                    Eliminar {activeSystem}
                  </button>
                )}
              </div>
                     {activeSystem && (() => {
                const activeSysData = (catalog?.maintenanceCatalog || []).find(s => s.systemName === activeSystem);
                return (
                  <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--line)', paddingBottom: '16px' }}>
                      <strong style={{ minWidth: '180px' }}>Clasificación en PDF:</strong>
                      <div style={{ flex: 1, maxWidth: '300px' }}>
                        <SelectInput 
                          value={activeSysData?.displayAs || 'maintenance'} 
                          onChange={e => {
                            const newCat = (catalog?.maintenanceCatalog || []).map(sys => 
                              sys.systemName === activeSystem 
                                ? { ...sys, displayAs: e.target.value as 'maintenance' | 'addon' } 
                                : sys
                            );
                            saveCatalogTasks(newCat);
                          }}
                        >
                          <option value="maintenance">Mantenimiento</option>
                          <option value="addon">Servicio Adicional</option>
                        </SelectInput>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ margin: 0 }}>Servicios de {activeSystem}</h4>
                      <button 
                        className="secondary small" 
                        onClick={() => {
                          const label = prompt('Nombre del nuevo servicio (ej: Limpieza general):');
                          if (label && label.trim()) {
                            const id = label.trim().toLowerCase().replace(/\s+/g, '-');
                            const newCat = (catalog?.maintenanceCatalog || []).map(sys => 
                              sys.systemName === activeSystem 
                                ? { ...sys, services: [...sys.services, { id, label: label.trim(), defaultPrice: 0 }] } 
                                : sys
                            );
                            saveCatalogTasks(newCat);
                          }
                        }}
                      >
                        + Añadir Servicio
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                      {(activeSysData?.services || []).map((task: any) => (
                        <div key={task.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg)', padding: '8px 12px', borderRadius: '6px' }}>
                          <div style={{ flex: 1 }}><strong>{task.label}</strong></div>
                          <div style={{ width: '120px' }}>
                              <Field label="Precio Base">
                                <MeasureInput unit="COP" value={task.defaultPrice} onChange={(v: number | undefined) => {
                                  const newCat = catalog!.maintenanceCatalog.map(sys => sys.systemName === activeSystem ? { ...sys, services: sys.services.map(t => t.id === task.id ? { ...t, defaultPrice: v || 0 } : t) } : sys);
                                  saveCatalogTasks(newCat);
                                }} />
                              </Field>
                            </div>
                            <button 
                              className="danger icon-btn" 
                              onClick={() => {
                                if (confirm(`¿Eliminar el servicio ${task.label}?`)) {
                                  const newCat = (catalog?.maintenanceCatalog || []).map(sys => 
                                    sys.systemName === activeSystem 
                                      ? { ...sys, services: sys.services.filter(t => t.id !== task.id) } 
                                      : sys
                                  );
                                  saveCatalogTasks(newCat);
                                }
                              }}
                              title="Eliminar servicio"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                          </div>
                      ))}
                    </div>
                  </div>
                );
              })()}          </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 24, paddingBottom: 24 }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Inteligencia Artificial (Claude)</h3>
              <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 14 }}>
                Configura tu clave de la API de Anthropic Claude para procesar los PDFs y cotizaciones mágicamente.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input 
                  type="password" 
                  value={apiKey} 
                  onChange={e => setApiKey(e.target.value)} 
                  placeholder="sk-ant-..." 
                  style={{ flex: 1, minWidth: '200px' }}
                />
                <button className="primary" onClick={saveApiKey}>
                  Guardar API Key
                </button>
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
