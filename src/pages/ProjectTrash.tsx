import { useState } from 'react';
import toast from 'react-hot-toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/Segmented';
import { db } from '../db';
import { deleteFallbackProject, restoreFallbackProject, useFallbackTrashSummaries } from '../lib/localFallbackStore';
import {
  emptyItemTrash,
  purgeTrashOfProject,
  purgeTrashedItem,
  restoreTrashedItem,
  trashKindLabel,
} from '../lib/trashStore';
import type { TrashedItem } from '../types';

type Tab = 'projects' | 'items';

/** Cuánto hace que se borró, en palabras. */
function hace(timestamp: number) {
  const dias = Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
  if (dias <= 0) return 'Eliminado hoy';
  if (dias === 1) return 'Eliminado ayer';
  return `Eliminado hace ${dias} dias`;
}

export function ProjectTrash() {
  const [tab, setTab] = useState<Tab>('projects');
  const projects = useFallbackTrashSummaries();
  const items: TrashedItem[] = useLiveQuery(
    () => db.trash.toArray().then(list => list.sort((a, b) => b.deletedAt - a.deletedAt)),
    [],
  ) || [];

  // ── Proyectos ──────────────────────────────────────────────────────────
  const restore = (id: number) => {
    restoreFallbackProject(id);
    toast.success('Proyecto restaurado');
  };

  const removeForever = async (id: number) => {
    if (!confirm('¿Eliminar definitivamente este proyecto? Esta accion no se puede deshacer.')) return;
    deleteFallbackProject(id);
    // Lo que se hubiera borrado DENTRO de ese proyecto ya no tiene a dónde volver.
    await purgeTrashOfProject(id);
    toast.success('Proyecto eliminado definitivamente');
  };

  const emptyProjectTrash = async () => {
    if (!confirm('¿Vaciar la papelera de proyectos? Esta accion no se puede deshacer.')) return;
    for (const project of projects) {
      deleteFallbackProject(project.projectId);
      await purgeTrashOfProject(project.projectId);
    }
    toast.success('Papelera de proyectos vaciada');
  };

  // ── Elementos (espacios / ventanas / persianas / fotos) ─────────────────
  const restoreItem = async (item: TrashedItem) => {
    const result = await restoreTrashedItem(item);
    if (result.ok) toast.success(`${trashKindLabel(item.kind)} restaurado en su lugar`);
    else toast.error(result.reason, { duration: 6000 });
  };

  const removeItemForever = async (item: TrashedItem) => {
    if (!confirm(`¿Eliminar definitivamente "${item.label}"? Esta accion no se puede deshacer.`)) return;
    await purgeTrashedItem(item);
    toast.success('Elemento eliminado definitivamente');
  };

  const emptyItems = async () => {
    if (!confirm('¿Vaciar la papelera de elementos? Esta accion no se puede deshacer.')) return;
    await emptyItemTrash();
    toast.success('Papelera de elementos vaciada');
  };

  return (
    <div className="page">
      <PageHeader title="Papelera" subtitle="Proyectos y elementos eliminados" backTo="/" />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'projects', label: `Proyectos (${projects.length})` },
          { value: 'items', label: `Elementos (${items.length})` },
        ]}
      />

      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Nada se borra solo</h2>
            <p className="muted">
              {tab === 'projects'
                ? 'Los proyectos eliminados se quedan acá hasta que los borres a mano.'
                : 'Espacios, ventanas, persianas y fotos eliminados. Restaurar los devuelve al mismo lugar del proyecto.'}
            </p>
          </div>
          {tab === 'projects' && projects.length > 0 && (
            <button className="secondary danger-outline" onClick={emptyProjectTrash}>Vaciar</button>
          )}
          {tab === 'items' && items.length > 0 && (
            <button className="secondary danger-outline" onClick={emptyItems}>Vaciar</button>
          )}
        </div>
      </section>

      {tab === 'projects' && (
        <section className="flow-list">
          {projects.map(project => (
            <article key={project.id} className="trash-card">
              <div>
                <strong>{project.clientName || 'Proyecto sin cliente'}</strong>
                <span>{project.siteName || project.address || project.code}</span>
                <em>{hace(project.deletedAt || Date.now())}</em>
              </div>
              <div className="trash-actions">
                <button className="secondary" onClick={() => restore(project.projectId)}>
                  <ArrowPathIcon className="icon" /> Restaurar
                </button>
                <button className="secondary danger-outline" onClick={() => removeForever(project.projectId)}>
                  <TrashIcon className="icon" /> Eliminar
                </button>
              </div>
            </article>
          ))}

          {projects.length === 0 && <div className="empty">No hay proyectos en la papelera.</div>}
        </section>
      )}

      {tab === 'items' && (
        <section className="flow-list">
          {items.map(item => (
            <article key={item.id} className="trash-card">
              <div>
                <span className={`trash-kind trash-kind-${item.kind}`}>{trashKindLabel(item.kind)}</span>
                <strong>{item.label}</strong>
                <span>{item.context}</span>
                {item.detail && <span>{item.detail}</span>}
                <em>{hace(item.deletedAt)}</em>
              </div>
              <div className="trash-actions">
                <button className="secondary" onClick={() => restoreItem(item)}>
                  <ArrowPathIcon className="icon" /> Restaurar
                </button>
                <button className="secondary danger-outline" onClick={() => removeItemForever(item)}>
                  <TrashIcon className="icon" /> Eliminar
                </button>
              </div>
            </article>
          ))}

          {items.length === 0 && <div className="empty">No hay espacios, ventanas ni fotos en la papelera.</div>}
        </section>
      )}
    </div>
  );
}
