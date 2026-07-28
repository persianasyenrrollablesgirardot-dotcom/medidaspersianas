import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowPathIcon, ExclamationTriangleIcon, TrashIcon, PencilIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon, PlusIcon, ArrowDownTrayIcon, MagnifyingGlassIcon, ArrowUturnLeftIcon, FolderOpenIcon, CloudArrowDownIcon } from '@heroicons/react/24/outline';
import { DEFAULT_CATALOG, db, resetLocalAppData } from '../db';
import { saveFallbackCatalog } from '../lib/localFallbackStore';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TechnicalCatalog } from '../types';
import { Field, SelectInput } from '../components/Field';
import { MeasureInput } from '../components/MeasureInput';
import { scanEverything, scanArchivos, scanNube, mergeProjects, downloadJson, restoreIntoFallback, collectDiagnostics, dumpRawStorage, type ScanResult, type StoreReport, type Diagnostics } from '../lib/rescue';
import { buildBackup } from '../lib/exporters';
import { BackupPanel } from '../components/BackupPanel';
import { descargarRespaldoCompleto } from '../lib/autoBackup';

type SectionId = 'backups' | 'rescue' | 'catalog' | 'customFields' | 'maintenance' | 'ai' | 'updates' | 'danger';

const SECTIONS: Array<{ id: SectionId; emoji: string; title: string; desc: string; danger?: boolean }> = [
  { id: 'backups', emoji: '🛡️', title: 'Respaldos y nube', desc: 'Estado del respaldo, copias automáticas y recuperación' },
  { id: 'rescue', emoji: '🛟', title: 'Rescatar / respaldar datos', desc: 'Recupera proyectos que no aparecen y descarga un respaldo' },
  { id: 'catalog', emoji: '📋', title: 'Listas del catálogo', desc: 'Tipos de persiana, instalación, tela, colores y más' },
  { id: 'customFields', emoji: '🧩', title: 'Campos personalizados', desc: 'Listas extra que aparecen en la ventana del proyecto' },
  { id: 'maintenance', emoji: '🛠️', title: 'Mantenimientos y servicios', desc: 'Sistemas, servicios y precios sugeridos' },
  { id: 'ai', emoji: '🤖', title: 'Inteligencia Artificial', desc: 'Clave API de Claude para PDFs y cotizaciones' },
  { id: 'updates', emoji: '🔄', title: 'Actualización de la app', desc: 'Buscar versión nueva o limpiar caché' },
  { id: 'danger', emoji: '⚠️', title: 'Opciones avanzadas', desc: 'Reiniciar datos locales (peligro)', danger: true },
];

// Listas simples del catálogo (todas comparten estructura → un solo editor).
const CATALOG_LISTS: Array<{ key: keyof TechnicalCatalog; title: string; desc: string; addLabel: string }> = [
  { key: 'systems', title: 'Tipos de persiana (sistemas)', desc: 'Opciones del campo "Tipo de persiana".', addLabel: 'Nuevo tipo de persiana:' },
  { key: 'mounts', title: 'Tipos de instalación', desc: 'Opciones del campo "Instalación de esta persiana".', addLabel: 'Nuevo tipo de instalación:' },
  { key: 'fabrics', title: 'Tipos de tela', desc: 'Opciones del campo "Tipo de tela".', addLabel: 'Nuevo tipo de tela:' },
  { key: 'colors', title: 'Colores', desc: 'Opciones del campo "Color".', addLabel: 'Nuevo color:' },
  { key: 'openingTypes', title: 'Tipos de apertura', desc: 'Opciones del campo "Apertura de la ventana".', addLabel: 'Nuevo tipo de apertura:' },
  { key: 'shapes', title: 'Formas / geometría', desc: 'Opciones del campo "Forma de la ventana".', addLabel: 'Nueva forma:' },
  { key: 'surfaces', title: 'Superficies de instalación', desc: 'Opciones del campo "Superficie".', addLabel: 'Nueva superficie:' },
];

export function Settings() {
  const catalog = useLiveQuery<TechnicalCatalog | undefined>(() => db.catalog.toCollection().first().then(value => value || DEFAULT_CATALOG), []);
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const [openCatalog, setOpenCatalog] = useState<keyof TechnicalCatalog | null>(null);
  const [openField, setOpenField] = useState<string | null>(null);
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

  // Helpers de lista del catálogo (add/rename/delete) para no repetir en el JSX.
  const addCatalogItem = (key: keyof TechnicalCatalog, addLabel: string) => {
    const items = (catalog?.[key] as string[]) || [];
    const v = prompt(addLabel)?.trim();
    if (v && !items.includes(v)) updateCatalogList(key, [...items, v]);
  };
  const renameCatalogItem = (key: keyof TechnicalCatalog, item: string) => {
    const items = (catalog?.[key] as string[]) || [];
    const v = prompt('Nuevo nombre:', item)?.trim();
    if (v && v !== item && !items.includes(v)) updateCatalogList(key, items.map(i => i === item ? v : i));
  };
  const deleteCatalogItem = (key: keyof TechnicalCatalog, item: string) => {
    const items = (catalog?.[key] as string[]) || [];
    if (confirm(`¿Eliminar "${item}"?`)) updateCatalogList(key, items.filter(i => i !== item));
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

  const saveCatalogCustomFields = async (customWindowFields: TechnicalCatalog['customWindowFields']) => {
    try {
      if (catalog?.id) {
        await db.catalog.update(catalog.id, { customWindowFields, lastUpdatedAt: Date.now() });
      } else {
        await db.catalog.add({ ...DEFAULT_CATALOG, customWindowFields, lastUpdatedAt: Date.now() });
      }
      saveFallbackCatalog({ customWindowFields });
    } catch (e) {
      toast.error('Error al actualizar campos personalizados');
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

  const activeMeta = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="page">
      <header className="hero">
        <p>Configuración</p>
        <h1>Ajustes del Sistema</h1>
      </header>

      {!activeSection && (
        <section className="settings-menu">
          {SECTIONS.map(s => (
            <button key={s.id} type="button" className={`settings-menu-item ${s.danger ? 'danger' : ''}`} onClick={() => setActiveSection(s.id)}>
              <span className="sm-emoji">{s.emoji}</span>
              <span className="sm-text">
                <strong>{s.title}</strong>
                <span>{s.desc}</span>
              </span>
              <ChevronRightIcon className="icon sm-arrow" />
            </button>
          ))}
        </section>
      )}

      {activeSection && (
        <section className="list">
          <button type="button" className="settings-back" onClick={() => setActiveSection(null)}>
            <ChevronLeftIcon className="icon" /> Volver a ajustes
          </button>
          <div className="settings-section-title">
            <span className="sm-emoji">{activeMeta?.emoji}</span>
            <h2>{activeMeta?.title}</h2>
          </div>

          {/* ===== RESPALDOS Y NUBE ===== */}
          {activeSection === 'backups' && <BackupPanel />}

          {/* ===== RESCATE / RESPALDO DE DATOS ===== */}
          {activeSection === 'rescue' && <RescuePanel />}

          {/* ===== LISTAS DEL CATÁLOGO (acordeón) ===== */}
          {activeSection === 'catalog' && (
            <div className="acc-list">
              <p className="muted settings-help">Toca una lista para ver y gestionar sus opciones.</p>
              {CATALOG_LISTS.map(list => {
                const items = (catalog?.[list.key] as string[]) || [];
                const open = openCatalog === list.key;
                return (
                  <div className={`acc ${open ? 'open' : ''}`} key={list.key as string}>
                    <button type="button" className="acc-head" onClick={() => setOpenCatalog(open ? null : list.key)}>
                      <span className="acc-title">{list.title}</span>
                      <span className="acc-count">{items.length}</span>
                      <ChevronDownIcon className={`icon acc-chev ${open ? 'open' : ''}`} />
                    </button>
                    {open && (
                      <div className="acc-body">
                        <p className="muted settings-help">{list.desc}</p>
                        <div className="opt-list">
                          {items.map(item => (
                            <div className="opt-row" key={item}>
                              <span className="opt-label">{item}</span>
                              <div className="opt-actions">
                                <button type="button" className="icon-btn" onClick={() => renameCatalogItem(list.key, item)} title="Renombrar"><PencilIcon className="icon" /></button>
                                <button type="button" className="icon-btn danger" onClick={() => deleteCatalogItem(list.key, item)} title="Eliminar"><TrashIcon className="icon" /></button>
                              </div>
                            </div>
                          ))}
                          {items.length === 0 && <span className="muted">Esta lista no tiene opciones todavía.</span>}
                        </div>
                        <button type="button" className="secondary small acc-add" onClick={() => addCatalogItem(list.key, list.addLabel)}>
                          <PlusIcon className="icon" /> Añadir opción
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ===== CAMPOS PERSONALIZADOS (acordeón) ===== */}
          {activeSection === 'customFields' && (
            <div className="acc-list">
              <button type="button" className="primary acc-newlist" onClick={() => {
                const val = prompt('Nombre de la nueva lista desplegable (ej: Color Perfilería):');
                if (val && val.trim()) {
                  const id = 'custom_' + Date.now();
                  const newFields = [...(catalog?.customWindowFields || []), { id, label: val.trim(), options: [] }];
                  saveCatalogCustomFields(newFields);
                  setOpenField(id);
                }
              }}>
                <PlusIcon className="icon" /> Nueva lista personalizada
              </button>
              <p className="muted settings-help">Estas listas aparecen como campos desplegables en la ventana de tus proyectos.</p>

              {(catalog?.customWindowFields || []).map(field => {
                const open = openField === field.id;
                return (
                  <div className={`acc ${open ? 'open' : ''}`} key={field.id}>
                    <button type="button" className="acc-head" onClick={() => setOpenField(open ? null : field.id)}>
                      <span className="acc-title">{field.label}</span>
                      <span className="acc-count">{field.options.length}</span>
                      <ChevronDownIcon className={`icon acc-chev ${open ? 'open' : ''}`} />
                    </button>
                    {open && (
                      <div className="acc-body">
                        <div className="opt-list">
                          {field.options.map(opt => (
                            <div className="opt-row" key={opt}>
                              <span className="opt-label">{opt}</span>
                              <div className="opt-actions">
                                <button type="button" className="icon-btn" title="Renombrar opción" onClick={() => {
                                  const newVal = prompt('Nuevo nombre de opción:', opt)?.trim();
                                  if (newVal && newVal !== opt) {
                                    const newFields = catalog!.customWindowFields.map(f => f.id === field.id ? { ...f, options: f.options.map(o => o === opt ? newVal : o) } : f);
                                    saveCatalogCustomFields(newFields);
                                  }
                                }}><PencilIcon className="icon" /></button>
                                <button type="button" className="icon-btn danger" title="Eliminar opción" onClick={() => {
                                  if(confirm(`¿Eliminar opción "${opt}"?`)) {
                                    const newFields = catalog!.customWindowFields.map(f => f.id === field.id ? { ...f, options: f.options.filter(o => o !== opt) } : f);
                                    saveCatalogCustomFields(newFields);
                                  }
                                }}><TrashIcon className="icon" /></button>
                              </div>
                            </div>
                          ))}
                          {field.options.length === 0 && <span className="muted">Esta lista no tiene opciones todavía.</span>}
                        </div>
                        <div className="acc-footer">
                          <button type="button" className="secondary small" onClick={() => {
                            const val = prompt(`Nueva opción para ${field.label}:`)?.trim();
                            if (val && !field.options.includes(val)) {
                              const newFields = catalog!.customWindowFields.map(f => f.id === field.id ? { ...f, options: [...f.options, val] } : f);
                              saveCatalogCustomFields(newFields);
                            }
                          }}><PlusIcon className="icon" /> Añadir opción</button>
                          <button type="button" className="secondary small" onClick={() => {
                            const val = prompt('Nuevo nombre para esta lista:', field.label)?.trim();
                            if (val) {
                              const newFields = catalog!.customWindowFields.map(f => f.id === field.id ? { ...f, label: val } : f);
                              saveCatalogCustomFields(newFields);
                            }
                          }}><PencilIcon className="icon" /> Renombrar lista</button>
                          <button type="button" className="secondary small danger-outline" onClick={() => {
                            if (confirm(`¿Eliminar la lista "${field.label}" por completo?`)) {
                              const newFields = catalog!.customWindowFields.filter(f => f.id !== field.id);
                              saveCatalogCustomFields(newFields);
                              if (openField === field.id) setOpenField(null);
                            }
                          }}><TrashIcon className="icon" /> Eliminar lista</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {(catalog?.customWindowFields || []).length === 0 && <span className="muted">No hay listas personalizadas todavía. Crea la primera arriba.</span>}
            </div>
          )}

          {/* ===== MANTENIMIENTOS Y SERVICIOS ===== */}
          {activeSection === 'maintenance' && (
            <div className="panel settings-panel">
              <div className="settings-block-head">
                <h4>Sistemas</h4>
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
                  <PlusIcon className="icon" /> Nuevo sistema
                </button>
              </div>
              <p className="muted settings-help">Elige un sistema para configurar sus servicios y precios sugeridos.</p>

              <div className="h-scroll" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {(catalog?.maintenanceCatalog || []).map(sys => (
                  <button key={sys.systemName} className={`pill ${activeSystem === sys.systemName ? 'active' : ''}`} onClick={() => setActiveSystem(sys.systemName)}>
                    {sys.systemName}
                  </button>
                ))}
                {(catalog?.maintenanceCatalog || []).length === 0 && <span className="muted">Crea tu primer sistema.</span>}
              </div>

              {activeSystem && (() => {
                const activeSysData = (catalog?.maintenanceCatalog || []).find(s => s.systemName === activeSystem);
                if (!activeSysData) return null;
                return (
                  <div className="settings-card">
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                      <div style={{ flex: 1, minWidth: '160px' }}>
                        <Field label="Clasificación en PDF">
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
                        </Field>
                      </div>
                      <button
                        className="secondary small danger-outline"
                        style={{ alignSelf: 'flex-end' }}
                        onClick={() => {
                          if (confirm(`¿Eliminar el sistema ${activeSystem} completamente?`)) {
                            const newCat = (catalog?.maintenanceCatalog || []).filter(s => s.systemName !== activeSystem);
                            saveCatalogTasks(newCat);
                            setActiveSystem(newCat.length > 0 ? newCat[0].systemName : '');
                          }
                        }}
                      >
                        <TrashIcon className="icon" /> Eliminar sistema
                      </button>
                    </div>

                    <div className="settings-block-head">
                      <strong>Servicios y precios</strong>
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
                        <PlusIcon className="icon" /> Añadir servicio
                      </button>
                    </div>

                    <div className="opt-list">
                      {(activeSysData?.services || []).map((task: any) => (
                        <div key={task.id} className="service-row">
                          <span className="opt-label">{task.label}</span>
                          <div style={{ width: '130px', flex: '0 0 auto' }}>
                            <Field label="Precio base">
                              <MeasureInput unit="COP" value={task.defaultPrice} onChange={(v: number | undefined) => {
                                const newCat = catalog!.maintenanceCatalog.map(sys => sys.systemName === activeSystem ? { ...sys, services: sys.services.map(t => t.id === task.id ? { ...t, defaultPrice: v || 0 } : t) } : sys);
                                saveCatalogTasks(newCat);
                              }} />
                            </Field>
                          </div>
                          <button
                            className="icon-btn danger"
                            style={{ alignSelf: 'flex-end', marginBottom: '2px' }}
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
                            <TrashIcon className="icon" />
                          </button>
                        </div>
                      ))}
                      {(activeSysData?.services || []).length === 0 && <span className="muted">Este sistema no tiene servicios todavía.</span>}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ===== IA ===== */}
          {activeSection === 'ai' && (
            <div className="panel settings-panel">
              <p className="muted settings-help">
                Configura tu clave de la API de Anthropic Claude para procesar los PDFs y cotizaciones con IA.
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
          )}

          {/* ===== ACTUALIZACIÓN ===== */}
          {activeSection === 'updates' && (
            <div className="panel settings-panel">
              <p className="muted settings-help">
                Busca e instala la última versión de la aplicación. Usa esto si sabes que hay cambios recientes y no los ves reflejados.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="primary" onClick={checkUpdate}>
                  <ArrowPathIcon className="icon" /> Refrescar / Actualizar app
                </button>
                <button className="secondary outline" onClick={() => {
                  if(confirm('¿Forzar actualización limpiando el caché del navegador? No perderás tus proyectos ni facturas guardadas.')) {
                    import('../db').then(m => m.clearPwaCacheOnly());
                  }
                }}>
                  <ArrowPathIcon className="icon" /> Limpiar caché y forzar actualización
                </button>
              </div>
            </div>
          )}

          {/* ===== AVANZADO ===== */}
          {activeSection === 'danger' && (
            <div className="panel settings-panel">
              <p className="muted settings-help">
                Esto borra todos los datos locales de esta app en este dispositivo y reinicia la app a su estado de fábrica. Usa esto <strong>solo</strong> si la app se queda bloqueada o si deseas vaciar por completo la base de datos local de manera destructiva.
              </p>
              <p className="muted settings-help">
                <strong>Antes de borrar, la app te descarga un respaldo completo automáticamente.</strong> No
                se puede saltar: es la última red antes de perder algo.
              </p>
              <button
                className="secondary danger-outline"
                onClick={async () => {
                  if (!confirm('PELIGRO: Esto borra los datos locales de esta app en este dispositivo y reinicia la app. Primero se descargará un respaldo. ¿Continuar?')) return;
                  // Respaldo OBLIGATORIO antes de destruir. Si falla, se aborta:
                  // borrar sin red de seguridad es exactamente lo que costó los
                  // datos en julio.
                  try {
                    const r = await descargarRespaldoCompleto();
                    toast.success(`Respaldo de ${r.proyectos} proyectos descargado.`, { duration: 6000 });
                  } catch (e) {
                    console.error(e);
                    toast.error('No se pudo generar el respaldo. Se cancela el borrado por seguridad.', { duration: 9000 });
                    return;
                  }
                  if (!confirm('El respaldo ya está en tus Descargas. ¿Borrar ahora todos los datos locales?')) return;
                  resetLocalAppData();
                }}
              >
                <ExclamationTriangleIcon className="icon" /> Reiniciar app local (borrar todo)
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ===== Panel de rescate de datos =====
// Escanea TODOS los cajones de almacenamiento del dispositivo (localStorage crudo,
// sessionStorage y todas las bases IndexedDB conocidas), recupera proyectos que la
// app no está mostrando (incluso si el archivo quedó dañado por falta de espacio),
// deja descargar un respaldo, y permite restaurarlos en la app.
function RescuePanel() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [restored, setRestored] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [deepRunning, setDeepRunning] = useState(false);
  const archivosRef = useRef<HTMLInputElement>(null);

  const runDiag = async () => {
    setDiagRunning(true);
    try {
      const d = await collectDiagnostics();
      setDiag(d);
    } catch (e: any) {
      toast.error('Error en diagnóstico: ' + (e?.message || e));
    } finally {
      setDiagRunning(false);
    }
  };

  const downloadDiag = () => {
    if (!diag) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadJson(`diagnostico-juno-${stamp}.json`, diag);
    toast.success('Diagnóstico descargado. Envíamelo para analizarlo.');
  };

  const downloadRaw = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadJson(`memoria-cruda-juno-${stamp}.json`, dumpRawStorage());
    toast.success('Memoria cruda descargada. Envíamela por WhatsApp para analizarla.');
  };

  // Acumula lo hallado por CUALQUIER vía (dispositivo, archivos, nube) en un solo
  // resultado: cada búsqueda SUMA a la anterior en vez de reemplazarla, y el merge
  // deduplica por código de proyecto y conserva las mejores fotos de cada versión.
  const acumular = (nuevos: StoreReport[]) => {
    setRestored(false);
    setResult(prev => {
      const reports = [...(prev?.reports || []), ...nuevos];
      return { reports, merged: mergeProjects(reports.flatMap(r => r.projects)) };
    });
  };

  const runScan = async () => {
    setScanning(true);
    setRestored(false);
    try {
      const res = await scanEverything();
      setResult(res);
      if (res.merged.length > 0) toast.success(`Se encontraron ${res.merged.length} proyectos`);
      else toast('No se encontraron proyectos en ningún cajón', { icon: '🔎' });
    } catch (e: any) {
      console.error(e);
      toast.error('Error al escanear: ' + (e?.message || e));
    } finally {
      setScanning(false);
    }
  };

  const runArchivos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setDeepRunning(true);
    try {
      const antes = result?.merged.length || 0;
      const reps = await scanArchivos(Array.from(files));
      const hallados = reps.reduce((a, r) => a + r.count, 0);
      acumular(reps);
      if (hallados === 0) toast(`Revisé ${files.length} archivo(s): ninguno tenía proyectos adentro`, { icon: '🔎' });
      else toast.success(`${hallados} proyectos leídos de ${files.length} archivo(s)` + (antes ? ' — se suman a lo anterior' : ''));
    } catch (e: any) {
      toast.error('Error leyendo los archivos: ' + (e?.message || e));
    } finally {
      setDeepRunning(false);
    }
  };

  const runNube = async () => {
    setDeepRunning(true);
    try {
      const reps = await scanNube();
      acumular(reps);
      const hallados = reps.reduce((a, r) => a + r.count, 0);
      if (reps[0] && !reps[0].ok) toast.error('No se pudo leer la nube: ' + (reps[0].note || ''), { duration: 8000 });
      else if (hallados === 0) toast('La nube no tiene proyectos guardados', { icon: '☁️' });
      else toast.success(`${hallados} proyectos traídos de la nube`);
    } catch (e: any) {
      toast.error('Error con la nube: ' + (e?.message || e));
    } finally {
      setDeepRunning(false);
    }
  };

  const backup = () => {
    if (!result || result.merged.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    // Mismo formato que "Importar JSON" del Centro de Exportación → se puede importar
    // en la PC (o en otro dispositivo) sin el error "Backup no compatible".
    downloadJson(`respaldo-juno-${stamp}.json`, buildBackup(result.merged));
    toast.success('Respaldo descargado. Este archivo SÍ se puede importar en la PC.');
  };

  const restore = async () => {
    if (!result || result.merged.length === 0) return;
    if (!confirm(`¿Restaurar ${result.merged.length} proyectos en la app? Se combinan por código con los que ya ves (no borra nada). Se recomienda descargar el respaldo primero.`)) return;
    const r = await restoreIntoFallback(result.merged);
    if (r.ok) {
      toast.success(`${r.written} proyectos restaurados. Vuelve al inicio para verlos.`);
      setRestored(true);
    } else {
      toast.error(`No se pudo restaurar: ${r.error || 'error desconocido'}. Tus datos siguen a salvo en el archivo de respaldo.`, { duration: 8000 });
    }
  };

  return (
    <div className="panel settings-panel">
      <p className="muted settings-help">
        Si tus proyectos <strong>no aparecen en el inicio pero sabes que estaban</strong>, aquí los recuperamos.
        Esta herramienta <strong>lee toda la memoria del dispositivo</strong> (incluso archivos dañados por falta de espacio) y
        <strong> no borra nada</strong>. Recomendado: 1) Escanear → 2) Descargar respaldo → 3) Restaurar.
      </p>

      <button className="primary" onClick={runScan} disabled={scanning} style={{ width: '100%' }}>
        <MagnifyingGlassIcon className="icon" /> {scanning ? 'Escaneando la memoria...' : '1. Escanear y buscar mis datos'}
      </button>

      {/* ===== Búsqueda profunda: fuera de los cajones de la app ===== */}
      <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
        <strong style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>🔦 Búsqueda profunda</strong>
        <p className="muted settings-help" style={{ marginTop: 0 }}>
          El escaneo de arriba solo ve la memoria de la app. Esto va <strong>más lejos</strong>: busca en tus
          archivos del teléfono y en la nube. Cada búsqueda <strong>suma</strong> a la anterior.
        </p>

        <input
          ref={archivosRef}
          type="file"
          multiple
          accept=".json,.txt,application/json,text/plain"
          style={{ display: 'none' }}
          onChange={e => { runArchivos(e.target.files); e.target.value = ''; }}
        />
        <button
          className="secondary"
          onClick={() => archivosRef.current?.click()}
          disabled={deepRunning}
          style={{ width: '100%', marginBottom: 8 }}
        >
          <FolderOpenIcon className="icon" /> Buscar en mis archivos del teléfono
        </button>
        <p className="muted settings-help" style={{ marginTop: 0, marginBottom: 12, fontSize: 12 }}>
          Elegí <strong>varios archivos a la vez</strong> de Descargas o de documentos de WhatsApp
          (los <code>backup_app_tecnica_*.json</code> y <code>respaldo-juno-*.json</code>).
          Lee hasta los archivos cortados o dañados.
        </p>

        <button className="secondary" onClick={runNube} disabled={deepRunning} style={{ width: '100%' }}>
          <CloudArrowDownIcon className="icon" /> Traer todo lo que haya en la nube
        </button>
        <p className="muted settings-help" style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}>
          Los proyectos que enviaste al proveedor viven fuera del celular y sobreviven aunque acá se
          llene la memoria. Vienen <strong>sin las fotos</strong> (la nube no las guarda), pero si otra
          copia las tiene, se conservan igual.
        </p>
      </div>

      {result && (
        <>
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <strong style={{ display: 'block', marginBottom: 8, fontSize: 15 }}>
              {result.merged.length > 0 ? `✅ ${result.merged.length} proyectos recuperables` : '🔎 No se hallaron proyectos'}
            </strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.reports.map((rep, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--muted)' }}>
                    {rep.source}
                    {rep.approxKb ? ` · ${rep.approxKb} KB` : ''}
                    {rep.repaired ? ' · ⚠ reparado' : ''}
                    {rep.note && rep.count === 0 ? ` · ${rep.note}` : ''}
                  </span>
                  <strong style={{ color: rep.count > 0 ? 'var(--blue)' : 'var(--muted)', flex: '0 0 auto' }}>
                    {rep.count > 0 ? `${rep.count} proyectos` : (rep.ok ? '—' : 'error')}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          {result.merged.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              <button className="primary" onClick={backup} style={{ width: '100%', background: '#16a34a', borderColor: '#16a34a' }}>
                <ArrowDownTrayIcon className="icon" /> 2. Descargar respaldo (.json)
              </button>
              <button className="secondary" onClick={restore} style={{ width: '100%' }}>
                <ArrowUturnLeftIcon className="icon" /> 3. Restaurar proyectos en la app
              </button>
              {restored && (
                <p className="muted settings-help" style={{ textAlign: 'center', color: '#16a34a' }}>
                  Listo. Ve al inicio para ver tus proyectos.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== Diagnóstico completo de almacenamiento ===== */}
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <p className="muted settings-help">
          ¿No aparecen tus datos? Este diagnóstico muestra <strong>exactamente qué ocupa el espacio</strong> del dispositivo
          (data vs. caché de la app) para saber dónde quedaron. Solo lee, no toca nada.
        </p>
        <button className="secondary outline" onClick={runDiag} disabled={diagRunning} style={{ width: '100%' }}>
          <MagnifyingGlassIcon className="icon" /> {diagRunning ? 'Analizando...' : 'Diagnóstico completo de memoria'}
        </button>

        {diag && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)', fontSize: 12.5 }}>
            {diag.storageEstimate && (
              <div style={{ marginBottom: 10 }}>
                <strong>Uso total del sitio:</strong> {diag.storageEstimate.usageMB} MB de {diag.storageEstimate.quotaMB} MB
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <strong>localStorage ({diag.localStorage.totalKb} KB · límite ~5 MB):</strong>
              {diag.localStorage.keys.map((k, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--muted)' }}>
                  <span>{k.key}{k.hasProjects ? ' 📦' : ''}</span>
                  <span>{k.kb} KB</span>
                </div>
              ))}
              {diag.localStorage.keys.length === 0 && <div style={{ color: 'var(--muted)' }}>vacío</div>}
            </div>
            {diag.indexedDbs.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <strong>Bases IndexedDB:</strong>
                {diag.indexedDbs.map((db, i) => (
                  <div key={i} style={{ marginTop: 4 }}>
                    <span style={{ color: 'var(--blue)' }}>{db.name}</span>
                    {db.tables.map((t, j) => (
                      <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--muted)', paddingLeft: 10 }}>
                        <span>{t.name}{t.projects > 0 ? ` · ${t.projects} proyectos 📦` : ''}</span>
                        <span>{t.rows} filas</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {diag.caches.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <strong>Caché de la app (NO son tus datos):</strong>
                {diag.caches.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--muted)' }}>
                    <span>{c.name}</span>
                    <span>{c.entries} archivos</span>
                  </div>
                ))}
              </div>
            )}
            <button className="secondary small" onClick={downloadDiag} style={{ width: '100%', marginTop: 8 }}>
              <ArrowDownTrayIcon className="icon" /> Descargar diagnóstico y enviármelo
            </button>
          </div>
        )}

        <button className="secondary outline" onClick={downloadRaw} style={{ width: '100%', marginTop: 12 }}>
          <ArrowDownTrayIcon className="icon" /> Descargar memoria EN CRUDO (para análisis forense)
        </button>
        <p className="muted settings-help" style={{ marginTop: 6 }}>
          Baja el contenido exacto de la memoria del dispositivo. Envíalo por WhatsApp para analizarlo con la herramienta forense.
        </p>
      </div>
    </div>
  );
}
