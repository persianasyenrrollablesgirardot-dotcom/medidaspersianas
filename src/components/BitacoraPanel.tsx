/**
 * Bitacora de puertas de un proyecto.
 *
 * Las seis puertas que esta app debe cubrir salen arriba, con su estado. Las otras cuatro
 * quedan detras de un "ver todas": ya dejan rastro en otra parte y reclamarlas seria ruido.
 *
 * Append-only: no hay boton de editar ni de borrar. Si algo se registro mal, se registra
 * de nuevo y el anterior queda tachado en el historial, apuntado por la correccion. Ver
 * `src/lib/puertas.ts` para el porque.
 *
 * Admin-only por donde se monta (ProjectDetail es ruta de admin), pero igual se apoya en
 * el email del usuario autenticado para el campo `actor`: una constancia sin autor no
 * prueba nada, asi que sin sesion el panel no deja registrar.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import { db } from '../db';
import { useAuth } from './AuthContext';
import {
  estadoDePuertas,
  avanceDeConstancia,
  registrarPuerta,
  PuertaInvalida,
  type EstadoPuerta,
  type GateEvent,
  type GateOutcome,
} from '../lib/bitacora';

function fecha(at: number) {
  return new Date(at).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function BitacoraPanel({ projectId, projectCode }: { projectId: number; projectCode: string }) {
  const { user } = useAuth();
  const [verTodas, setVerTodas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const eventos: GateEvent[] = useLiveQuery(
    () => db.projectEvents.where('projectId').equals(projectId).toArray(),
    [projectId],
  ) ?? [];

  const estados = estadoDePuertas(eventos);
  const avance = avanceDeConstancia(eventos);
  const visibles = verTodas ? estados : estados.filter(e => e.puerta.constanciaEnApp);
  const corregidos = new Set(eventos.filter(e => e.corrigeA !== undefined).map(e => e.corrigeA));

  const registrar = async (estado: EstadoPuerta, resultado: GateOutcome) => {
    const actor = user?.email;
    if (!actor) {
      toast.error('No hay sesion: una constancia sin autor no prueba nada.');
      return;
    }
    setGuardando(true);
    try {
      // Si ya habia constancia vigente, esta la corrige. El anterior NO se borra.
      const previo = estado.vigente?.id;
      await registrarPuerta({
        projectId,
        projectCode,
        etapa: estado.puerta.id,
        resultado,
        actor,
        ...(nota.trim() ? { nota: nota.trim() } : {}),
        ...(previo !== undefined ? { corrigeA: previo } : {}),
      });
      toast.success(
        resultado === 'cumplida'
          ? `${estado.puerta.id} queda registrada como cumplida.`
          : `${estado.puerta.id} queda registrada como NO cumplida.`,
      );
      setAbierta(null);
      setNota('');
    } catch (e) {
      if (e instanceof PuertaInvalida) toast.error(e.message);
      else {
        console.error('No se pudo registrar la puerta:', e);
        toast.error('No se pudo guardar la constancia.');
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2>Bitacora de puertas</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Los puntos donde el proyecto se detiene. Queda escrito quien verifico, cuando y con que resultado.
          </p>
        </div>
        <strong style={{ color: avance.cumplidas === avance.total ? 'var(--green, #16a34a)' : 'var(--blue)' }}>
          {avance.cumplidas} de {avance.total}
        </strong>
      </div>

      <div style={{ marginTop: '16px', display: 'grid', gap: '10px' }}>
        {visibles.map(estado => {
          const { puerta, vigente, historial } = estado;
          const cumplida = vigente?.resultado === 'cumplida';
          const sinConstancia = !vigente;
          const color = sinConstancia ? '#d4d4d4' : cumplida ? 'var(--green, #16a34a)' : '#dc2626';

          return (
            <article
              key={puerta.id}
              style={{ border: '1px solid #eee', borderLeft: `4px solid ${color}`, borderRadius: '8px', padding: '12px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '220px', flex: 1 }}>
                  <span className="muted" style={{ fontSize: '0.8em' }}>{puerta.id} · {puerta.proceso}</span>
                  <h3 style={{ margin: '2px 0 6px' }}>{puerta.nombre}</h3>
                  <p style={{ margin: 0, fontSize: '0.9em' }}>{puerta.condicion}</p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.85em', minWidth: '170px' }}>
                  {sinConstancia
                    ? <em className="muted">Sin constancia</em>
                    : (
                      <>
                        <strong style={{ color }}>{cumplida ? 'Cumplida' : 'NO cumplida'}</strong>
                        <br />
                        <span className="muted">{fecha(vigente.at)}</span>
                        <br />
                        <span className="muted">{vigente.actor}</span>
                      </>
                    )}
                </div>
              </div>

              {!cumplida && (
                <p style={{ margin: '8px 0 0', fontSize: '0.85em', color: '#b45309' }}>
                  <strong>Si no se cumple:</strong> {puerta.siFalla}
                </p>
              )}

              {abierta === puerta.id ? (
                <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                  <textarea
                    value={nota}
                    onChange={e => setNota(e.target.value)}
                    placeholder="Que se verifico, y contra que. Opcional, pero es lo que sirve dentro de seis meses."
                    rows={2}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="primary" disabled={guardando} onClick={() => registrar(estado, 'cumplida')}>
                      Cumplida
                    </button>
                    <button disabled={guardando} onClick={() => registrar(estado, 'no_cumplida')}>
                      No cumplida
                    </button>
                    <button disabled={guardando} onClick={() => { setAbierta(null); setNota(''); }}>
                      Cancelar
                    </button>
                  </div>
                  {vigente && (
                    <span className="muted" style={{ fontSize: '0.8em' }}>
                      Ya hay constancia: lo que registre ahora la corrige, y la anterior queda en el historial.
                    </span>
                  )}
                </div>
              ) : (
                <button style={{ marginTop: '10px' }} onClick={() => { setAbierta(puerta.id); setNota(''); }}>
                  {sinConstancia ? 'Registrar' : 'Corregir'}
                </button>
              )}

              {historial.length > 0 && (
                <details style={{ marginTop: '10px' }}>
                  <summary className="muted" style={{ fontSize: '0.85em', cursor: 'pointer' }}>
                    Historial ({historial.length})
                  </summary>
                  <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '0.85em' }}>
                    {historial.map(ev => {
                      const enmendado = ev.id !== undefined && corregidos.has(ev.id);
                      return (
                        <li key={ev.id} style={{ opacity: enmendado ? 0.55 : 1, marginBottom: '4px' }}>
                          <span style={{ textDecoration: enmendado ? 'line-through' : 'none' }}>
                            {ev.resultado === 'cumplida' ? 'Cumplida' : 'NO cumplida'} · {fecha(ev.at)} · {ev.actor}
                          </span>
                          {enmendado && <em className="muted"> (corregida)</em>}
                          {ev.nota && <div className="muted">{ev.nota}</div>}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </div>

      <button style={{ marginTop: '14px' }} onClick={() => setVerTodas(v => !v)}>
        {verTodas ? 'Ver solo las de esta app' : 'Ver las 10 puertas de la cadena'}
      </button>
    </section>
  );
}
