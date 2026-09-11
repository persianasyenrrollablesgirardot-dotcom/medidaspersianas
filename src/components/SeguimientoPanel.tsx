/**
 * Seguimiento del pedido: donde va la produccion y como salieron las visitas.
 *
 * Dos columnas porque son dos cosas distintas: el pedido avanza una sola vez de principio
 * a fin, y las visitas son varias y cada una tiene su propio resultado.
 *
 * Append-only: cambiar de estado AGREGA un evento, no pisa el anterior. Por eso no hay
 * boton de editar — el historial es justamente lo que faltaba.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import { db } from '../db';
import { useAuth } from './AuthContext';
import {
  ESTADOS_PRODUCCION,
  ESTADOS_VISITA,
  estadoActual,
  estadoDef,
  historialDe,
  esRetroceso,
  avanceProduccion,
  registrarSeguimiento,
  SeguimientoInvalido,
  type TrackingEvent,
  type TrackingKind,
} from '../lib/bitacoraSeguimiento';

function fecha(at: number) {
  return new Date(at).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function soloFecha(at: number) {
  return new Date(at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const COLOR: Record<string, string> = {
  retenido: '#dc2626',
  fallida: '#dc2626',
  parcial: '#b45309',
  reagendada: '#b45309',
  instalado: 'var(--green, #16a34a)',
  completa: 'var(--green, #16a34a)',
};

export function SeguimientoPanel({ projectId, projectCode }: { projectId: number; projectCode: string }) {
  const { user } = useAuth();
  const [editando, setEditando] = useState<TrackingKind | null>(null);
  const [elegido, setElegido] = useState('');
  const [nota, setNota] = useState('');
  const [fechaVisita, setFechaVisita] = useState('');
  const [guardando, setGuardando] = useState(false);

  const eventos: TrackingEvent[] = useLiveQuery(
    () => db.trackingEvents.where('projectId').equals(projectId).toArray(),
    [projectId],
  ) ?? [];

  const produccion = estadoActual(eventos, 'produccion');
  const visita = estadoActual(eventos, 'visita');
  const avance = avanceProduccion(eventos);

  const cerrar = () => { setEditando(null); setElegido(''); setNota(''); setFechaVisita(''); };

  const registrar = async (tipo: TrackingKind) => {
    const actor = user?.email;
    if (!actor) {
      toast.error('No hay sesion: sin autor no se puede reconstruir que paso.');
      return;
    }
    if (!elegido) {
      toast.error('Elija un estado.');
      return;
    }
    const actualDelTipo = tipo === 'produccion' ? produccion : visita;
    if (esRetroceso(tipo, actualDelTipo?.estado, elegido)) {
      const def = estadoDef(tipo, elegido);
      const previo = estadoDef(tipo, actualDelTipo!.estado);
      const seguir = confirm(
        `Esto va para atras: de "${previo?.etiqueta}" a "${def?.etiqueta}".\n\n` +
        'Casi siempre es un error de dedo. Si de verdad volvio para atras, conviene explicarlo en la nota.\n\n' +
        'Registrar de todas formas?',
      );
      if (!seguir) return;
    }

    setGuardando(true);
    try {
      const cuando = fechaVisita ? new Date(`${fechaVisita}T12:00:00`).getTime() : undefined;
      await registrarSeguimiento({
        projectId,
        projectCode,
        tipo,
        estado: elegido,
        actor,
        ...(nota.trim() ? { nota: nota.trim() } : {}),
        ...(tipo === 'visita' && cuando !== undefined && Number.isFinite(cuando) ? { fechaVisita: cuando } : {}),
      });
      toast.success(`Registrado: ${estadoDef(tipo, elegido)?.etiqueta}`);
      cerrar();
    } catch (e) {
      if (e instanceof SeguimientoInvalido) toast.error(e.message);
      else {
        console.error('No se pudo registrar el seguimiento:', e);
        toast.error('No se pudo guardar.');
      }
    } finally {
      setGuardando(false);
    }
  };

  const formulario = (tipo: TrackingKind) => {
    const opciones = tipo === 'produccion' ? ESTADOS_PRODUCCION : ESTADOS_VISITA;
    const elegidoDef = estadoDef(tipo, elegido);
    return (
      <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
        <select value={elegido} onChange={e => setElegido(e.target.value)}>
          <option value="">Elija un estado…</option>
          {opciones.map(o => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
        </select>
        {elegidoDef && <span className="muted" style={{ fontSize: '0.85em' }}>{elegidoDef.descripcion}</span>}
        {tipo === 'visita' && (
          <label style={{ fontSize: '0.85em' }}>
            Fecha de la visita (opcional)
            <input type="date" value={fechaVisita} onChange={e => setFechaVisita(e.target.value)} style={{ width: '100%' }} />
          </label>
        )}
        <textarea
          value={nota}
          onChange={e => setNota(e.target.value)}
          rows={2}
          placeholder={tipo === 'produccion'
            ? 'Por que cambio, y si algo lo freno. Opcional.'
            : 'Que se hizo, y que quedo pendiente. Opcional.'}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="primary" disabled={guardando} onClick={() => registrar(tipo)}>Registrar</button>
          <button disabled={guardando} onClick={cerrar}>Cancelar</button>
        </div>
      </div>
    );
  };

  const historial = (tipo: TrackingKind) => {
    const lista = historialDe(eventos, tipo);
    if (lista.length === 0) return null;
    return (
      <details style={{ marginTop: '10px' }}>
        <summary className="muted" style={{ fontSize: '0.85em', cursor: 'pointer' }}>
          Historial ({lista.length})
        </summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '0.85em' }}>
          {lista.map(ev => (
            <li key={ev.id} style={{ marginBottom: '4px' }}>
              <strong>{estadoDef(tipo, ev.estado)?.etiqueta ?? ev.estado}</strong>
              {ev.fechaVisita !== undefined && <> · para el {soloFecha(ev.fechaVisita)}</>}
              <div className="muted">{fecha(ev.at)} · {ev.actor}</div>
              {ev.nota && <div>{ev.nota}</div>}
            </li>
          ))}
        </ul>
      </details>
    );
  };

  return (
    <section className="panel">
      <h2>Seguimiento del pedido</h2>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        Donde va la produccion y como salieron las visitas. Cambiar de estado agrega un registro: no pisa el anterior.
      </p>

      <div style={{ marginTop: '16px', display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>

        {/* ── Produccion ── */}
        <article style={{ border: '1px solid #eee', borderRadius: '8px', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
            <h3 style={{ margin: 0 }}>Produccion</h3>
            <span className="muted" style={{ fontSize: '0.85em' }}>paso {avance.paso} de {avance.total}</span>
          </div>

          <div style={{ display: 'flex', gap: '3px', margin: '10px 0' }}>
            {Array.from({ length: avance.total }, (_, i) => (
              <span
                key={i}
                style={{
                  flex: 1, height: '6px', borderRadius: '3px',
                  background: i < avance.paso ? (avance.retenido ? '#dc2626' : 'var(--green, #16a34a)') : '#e5e5e5',
                }}
              />
            ))}
          </div>

          {produccion ? (
            <>
              <strong style={{ color: COLOR[produccion.estado] ?? 'inherit' }}>
                {estadoDef('produccion', produccion.estado)?.etiqueta}
              </strong>
              <div className="muted" style={{ fontSize: '0.85em' }}>
                {fecha(produccion.at)} · {produccion.actor}
              </div>
              {produccion.nota && <p style={{ margin: '6px 0 0', fontSize: '0.9em' }}>{produccion.nota}</p>}
              {avance.retenido && (
                <p style={{ margin: '6px 0 0', fontSize: '0.85em', color: '#dc2626' }}>
                  Frenado. El avance que se ve es el ultimo real: retener no devuelve el pedido a cero.
                </p>
              )}
            </>
          ) : (
            <em className="muted">Sin estado registrado</em>
          )}

          {editando === 'produccion'
            ? formulario('produccion')
            : <button style={{ marginTop: '10px' }} onClick={() => { cerrar(); setEditando('produccion'); }}>Cambiar estado</button>}
          {historial('produccion')}
        </article>

        {/* ── Visitas ── */}
        <article style={{ border: '1px solid #eee', borderRadius: '8px', padding: '12px' }}>
          <h3 style={{ margin: 0 }}>Visitas</h3>
          <div style={{ marginTop: '10px' }}>
            {visita ? (
              <>
                <strong style={{ color: COLOR[visita.estado] ?? 'inherit' }}>
                  {estadoDef('visita', visita.estado)?.etiqueta}
                </strong>
                {visita.fechaVisita !== undefined && (
                  <div style={{ fontSize: '0.9em' }}>Para el {soloFecha(visita.fechaVisita)}</div>
                )}
                <div className="muted" style={{ fontSize: '0.85em' }}>
                  Registrado {fecha(visita.at)} · {visita.actor}
                </div>
                {visita.nota && <p style={{ margin: '6px 0 0', fontSize: '0.9em' }}>{visita.nota}</p>}
              </>
            ) : (
              <em className="muted">Sin visitas registradas</em>
            )}
          </div>

          {editando === 'visita'
            ? formulario('visita')
            : <button style={{ marginTop: '10px' }} onClick={() => { cerrar(); setEditando('visita'); }}>Registrar visita</button>}
          {historial('visita')}
        </article>
      </div>
    </section>
  );
}
