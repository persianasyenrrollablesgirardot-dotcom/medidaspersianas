/**
 * Casos de posventa y garantia de un proyecto.
 *
 * Lo que hace distinto a este panel: **calcula la cobertura antes de que se responda**, y
 * cuando no hay plazo fijado lo dice en vez de estimar uno. Esa es toda la gracia — el
 * riesgo real no es olvidarse de un reclamo, es contestarle al cliente un plazo que la
 * empresa no puede sostener.
 *
 * Muestra siempre los DOS plazos de la persiana: tela y perfileria. Una sola cifra miente
 * para alguno de los dos lados.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import { db } from '../db';
import { useAuth } from './AuthContext';
import {
  CAUSAS,
  EXCLUSIONES,
  RESOLUCIONES,
  PIEZAS,
  piezaDef,
  familiaDeTela,
  coberturaDeSolucion,
  evaluarCobertura,
  abrirCaso,
  cerrarCaso,
  abiertos,
  cerrados,
  causaDef,
  CasoInvalido,
  type CasoGarantia,
  type CausaGarantia,
  type PiezaGarantia,
  type ResolucionCaso,
} from '../lib/casosGarantia';

function fecha(at: number) {
  return new Date(at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const COLOR_VEREDICTO: Record<string, string> = {
  dentro: 'var(--green, #16a34a)',
  vencida: '#dc2626',
  sin_definir: '#b45309',
};

export function GarantiaPanel({
  projectId,
  projectCode,
  telasDelProyecto,
}: {
  projectId: number;
  projectCode: string;
  telasDelProyecto: string[];
}) {
  const { user } = useAuth();
  const [abriendo, setAbriendo] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [pieza, setPieza] = useState<PiezaGarantia>('tela');
  const [tela, setTela] = useState(telasDelProyecto[0] ?? '');
  const [instalacion, setInstalacion] = useState('');
  const [cerrando, setCerrando] = useState<number | null>(null);
  const [causa, setCausa] = useState<CausaGarantia | ''>('');
  const [resolucion, setResolucion] = useState<ResolucionCaso | ''>('');
  const [notaCierre, setNotaCierre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const casos: CasoGarantia[] = useLiveQuery(
    () => db.warrantyCases.where('projectId').equals(projectId).toArray(),
    [projectId],
  ) ?? [];

  const fechaInstalacion = instalacion ? new Date(`${instalacion}T12:00:00`).getTime() : undefined;
  const vistaPrevia = pieza === 'tela'
    ? coberturaDeSolucion({ nombreTela: tela, fechaInstalacion })
    : { tela: null, perfileria: evaluarCobertura({ pieza, fechaInstalacion }) };

  const limpiar = () => {
    setAbriendo(false); setDescripcion(''); setPieza('tela');
    setTela(telasDelProyecto[0] ?? ''); setInstalacion('');
  };

  const abrir = async () => {
    const actor = user?.email;
    if (!actor) { toast.error('No hay sesion.'); return; }
    setGuardando(true);
    try {
      await abrirCaso({
        projectId, projectCode, actor,
        descripcion,
        pieza,
        ...(pieza === 'tela' && tela ? { nombreTela: tela, familiaTela: familiaDeTela(tela) } : {}),
        ...(fechaInstalacion !== undefined ? { fechaInstalacion } : {}),
      });
      toast.success('Caso abierto.');
      limpiar();
    } catch (e) {
      if (e instanceof CasoInvalido) toast.error(e.message);
      else { console.error('No se pudo abrir el caso:', e); toast.error('No se pudo abrir el caso.'); }
    } finally {
      setGuardando(false);
    }
  };

  const cerrar = async (id: number) => {
    if (!causa || !resolucion) { toast.error('Falta la causa o como se resolvio.'); return; }
    setGuardando(true);
    try {
      await cerrarCaso(id, { causa, resolucion, ...(notaCierre.trim() ? { notaCierre: notaCierre.trim() } : {}) });
      toast.success('Caso cerrado.');
      setCerrando(null); setCausa(''); setResolucion(''); setNotaCierre('');
    } catch (e) {
      console.error('No se pudo cerrar el caso:', e);
      toast.error('No se pudo cerrar el caso.');
    } finally {
      setGuardando(false);
    }
  };

  const tarjetaCobertura = (c: { veredicto: string; explicacion: string; respaldoVigente?: string }) => (
    <>
      <p style={{ margin: '4px 0 0', fontSize: '0.88em', color: COLOR_VEREDICTO[c.veredicto] }}>
        {c.veredicto === 'sin_definir' ? '⚠ ' : c.veredicto === 'dentro' ? '✓ ' : '✕ '}{c.explicacion}
      </p>
      {/* Aviso interno: la garantia propia vencio pero el proveedor todavia responde.
          No se le dice al cliente; sirve para no negar algo que la fabrica repone. */}
      {c.respaldoVigente && (
        <p style={{ margin: '4px 0 0', fontSize: '0.82em', color: '#2563eb', background: 'rgba(37,99,235,0.08)', borderRadius: '4px', padding: '6px 8px' }}>
          {c.respaldoVigente}
        </p>
      )}
    </>
  );

  const listaAbiertos = abiertos(casos);
  const listaCerrados = cerrados(casos);

  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2>Posventa y garantia</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            La cobertura se calcula antes de responder. Donde no hay plazo fijado, lo dice: no se estima.
          </p>
        </div>
        {listaAbiertos.length > 0 && (
          <strong style={{ color: '#b45309' }}>{listaAbiertos.length} abierto{listaAbiertos.length > 1 ? 's' : ''}</strong>
        )}
      </div>

      {/* ── Abrir un caso ── */}
      {abriendo ? (
        <div style={{ marginTop: '14px', display: 'grid', gap: '8px', border: '1px solid #eee', borderRadius: '8px', padding: '12px' }}>
          <label style={{ fontSize: '0.85em' }}>
            Que reclama el cliente
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={2}
              placeholder="En sus palabras. Es lo que hay que poder releer dentro de seis meses."
              style={{ width: '100%' }}
            />
          </label>

          <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <label style={{ fontSize: '0.85em' }}>
              Pieza
              <select value={pieza} onChange={e => setPieza(e.target.value as PiezaGarantia)} style={{ width: '100%' }}>
                {PIEZAS.map(p => (
                  <option key={p} value={p}>{piezaDef(p, 'otra').etiqueta}</option>
                ))}
              </select>
            </label>

            {pieza === 'tela' && (
              <label style={{ fontSize: '0.85em' }}>
                Tela
                {telasDelProyecto.length > 0 ? (
                  <select value={tela} onChange={e => setTela(e.target.value)} style={{ width: '100%' }}>
                    <option value="">Sin especificar</option>
                    {telasDelProyecto.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input value={tela} onChange={e => setTela(e.target.value)} placeholder="Nombre de la tela" style={{ width: '100%' }} />
                )}
              </label>
            )}

            <label style={{ fontSize: '0.85em' }}>
              Fecha de instalacion
              <input type="date" value={instalacion} onChange={e => setInstalacion(e.target.value)} style={{ width: '100%' }} />
            </label>
          </div>

          <div style={{ background: 'var(--surface-2, #fafafa)', borderRadius: '6px', padding: '10px' }}>
            <strong style={{ fontSize: '0.85em' }}>Lo que se le puede decir hoy</strong>
            {vistaPrevia.tela && tarjetaCobertura(vistaPrevia.tela)}
            {tarjetaCobertura(vistaPrevia.perfileria)}
            {pieza === 'tela' && (
              <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.8em' }}>
                Son dos plazos distintos sobre la misma persiana. Decir uno solo promete de mas o de menos.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="primary" disabled={guardando} onClick={abrir}>Abrir caso</button>
            <button disabled={guardando} onClick={limpiar}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button style={{ marginTop: '14px' }} onClick={() => setAbriendo(true)}>Abrir un caso</button>
      )}

      {/* ── Casos abiertos ── */}
      {listaAbiertos.length > 0 && (
        <div style={{ marginTop: '16px', display: 'grid', gap: '10px' }}>
          {listaAbiertos.map(caso => (
            <article key={caso.id} style={{ border: '1px solid #eee', borderLeft: `4px solid ${COLOR_VEREDICTO[caso.veredictoAlAbrir]}`, borderRadius: '8px', padding: '12px' }}>
              <span className="muted" style={{ fontSize: '0.8em' }}>
                Abierto el {fecha(caso.abiertoEl)} · {caso.actor}
              </span>
              <p style={{ margin: '4px 0' }}>{caso.descripcion}</p>
              <p style={{ margin: 0, fontSize: '0.85em', color: COLOR_VEREDICTO[caso.veredictoAlAbrir] }}>
                {caso.explicacionAlAbrir}
              </p>

              {cerrando === caso.id ? (
                <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '0.85em' }}>
                    Causa
                    <select value={causa} onChange={e => setCausa(e.target.value as CausaGarantia)} style={{ width: '100%' }}>
                      <option value="">Elija la causa…</option>
                      {CAUSAS.map(c => <option key={c.id} value={c.id}>{c.etiqueta} — {c.descripcion}</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: '0.85em' }}>
                    Como se resolvio
                    <select value={resolucion} onChange={e => setResolucion(e.target.value as ResolucionCaso)} style={{ width: '100%' }}>
                      <option value="">Elija…</option>
                      {RESOLUCIONES.map(r => <option key={r.id} value={r.id}>{r.etiqueta} — {r.descripcion}</option>)}
                    </select>
                  </label>
                  <textarea
                    value={notaCierre}
                    onChange={e => setNotaCierre(e.target.value)}
                    rows={2}
                    placeholder="Que se hizo y que se le dijo al cliente."
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="primary" disabled={guardando} onClick={() => cerrar(caso.id!)}>Cerrar caso</button>
                    <button disabled={guardando} onClick={() => { setCerrando(null); setCausa(''); setResolucion(''); setNotaCierre(''); }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button style={{ marginTop: '10px' }} onClick={() => setCerrando(caso.id!)}>Cerrar caso</button>
              )}
            </article>
          ))}
        </div>
      )}

      {listaCerrados.length > 0 && (
        <details style={{ marginTop: '14px' }}>
          <summary className="muted" style={{ fontSize: '0.85em', cursor: 'pointer' }}>
            Casos cerrados ({listaCerrados.length})
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '0.85em' }}>
            {listaCerrados.map(caso => (
              <li key={caso.id} style={{ marginBottom: '6px' }}>
                <strong>{RESOLUCIONES.find(r => r.id === caso.resolucion)?.etiqueta ?? 'Cerrado'}</strong>
                {caso.causa && <> · causa: {causaDef(caso.causa)?.etiqueta}</>}
                <div className="muted">{fecha(caso.abiertoEl)} → {fecha(caso.cerradoEl!)}</div>
                <div>{caso.descripcion}</div>
                {caso.notaCierre && <div className="muted">{caso.notaCierre}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details style={{ marginTop: '14px' }}>
        <summary className="muted" style={{ fontSize: '0.85em', cursor: 'pointer' }}>Que NO cubre la garantia</summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '0.85em' }}>
          {EXCLUSIONES.map(e => <li key={e}>{e}</li>)}
        </ul>
      </details>
    </section>
  );
}
