import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db';
import { Field, TextInput } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { saveProject } from '../lib/projectStore';
import { isFallbackId, useFallbackProject } from '../lib/localFallbackStore';
import type { TechnicalProject } from '../types';
import { ChatBubbleOvalLeftIcon } from '@heroicons/react/24/outline';

export function ProjectSetup() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fallbackProject = useFallbackProject(id);
  const dbProject = useLiveQuery<TechnicalProject | undefined>(() => isFallbackId(Number(id)) ? Promise.resolve(undefined) : db.projects.get(Number(id)), [id]);
  const project = fallbackProject || dbProject;

  if (!project) return <div className="page"><div className="empty">Cargando proyecto...</div></div>;

  const update = (patch: Partial<typeof project>) => saveProject({ ...project, ...patch });

  return (
    <div className="page narrow">
      <PageHeader title="Datos basicos" subtitle={project.code} backTo="/" />
      <section className="panel focus-panel">
        <h2>Identificacion del levantamiento</h2>
        <Field label="Cliente / obra">
          <TextInput value={project.clientName} onChange={e => update({ clientName: e.target.value })} placeholder="Ej: Casa Maria Lopez" autoFocus />
        </Field>
        <div className="grid-2">
          <Field label="Cedula / NIT">
            <TextInput value={project.clientDocument || ''} onChange={e => update({ clientDocument: e.target.value })} placeholder="Documento del cliente" inputMode="numeric" />
          </Field>
            <Field label="Telefono">
              <div style={{ display: 'flex', gap: '8px' }}>
                <TextInput value={project.contactPhone || ''} onChange={e => update({ contactPhone: e.target.value })} placeholder="WhatsApp o telefono" inputMode="tel" />
                {project.contactPhone && (
                  <button 
                    className="secondary" 
                    onClick={() => {
                      const cleaned = project.contactPhone!.replace(/\D/g, '');
                      if (cleaned) {
                        const phoneStr = cleaned.length === 10 ? `57${cleaned}` : cleaned;
                        window.open(`https://wa.me/${phoneStr}`, '_blank');
                      }
                    }}
                    title="Enviar mensaje por WhatsApp"
                    style={{ padding: '0 12px', borderColor: '#25D366', color: '#25D366' }}
                  >
                    <ChatBubbleOvalLeftIcon className="icon" />
                  </button>
                )}
              </div>
            </Field>
        </div>
        <Field label="Lugar / conjunto">
          <TextInput value={project.siteName || ''} onChange={e => update({ siteName: e.target.value })} placeholder="Ej: Condominio, apartamento, local" />
        </Field>
        <Field label="Ciudad">
          <TextInput value={project.city || ''} onChange={e => update({ city: e.target.value })} placeholder="Girardot, Ricaurte..." />
        </Field>
        <Field label="Direccion / referencia">
          <TextInput value={project.address || ''} onChange={e => update({ address: e.target.value })} placeholder="Direccion o punto de referencia" />
        </Field>
        <button className="primary wide" onClick={() => navigate(`/project/${project.id}/spaces`)}>
          Continuar a espacios
        </button>
      </section>
    </div>
  );
}
