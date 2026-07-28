import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownTrayIcon, ArrowUturnLeftIcon, CloudArrowDownIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import {
  descargarRespaldoCompleto,
  diasDesdeUltimoExport,
  listarSnapshots,
  restaurarSnapshot,
  tomarSnapshot,
} from '../lib/autoBackup';
import { bajarTodo, haySesion, probarNube } from '../lib/cloudBackup';
import { restoreProjects, getFallbackProjects } from '../lib/localFallbackStore';
import { photoStats } from '../lib/photoStore';
import { probarSupabase } from '../lib/supabasePhotos';
import { useSyncStatus } from '../lib/syncQueue';
import type { BackupRecord } from '../types';

function fecha(ts: number) {
  return new Date(ts).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pesoLegible(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Panel de respaldos. Existe para responder de un vistazo la pregunta que
 * nadie se hizo a tiempo: "¿esto está respaldado en algún lado?".
 */
export function BackupPanel() {
  const { pendientes, fallidos, enLinea, conSesion, nubeLista } = useSyncStatus();
  const [snapshots, setSnapshots] = useState<Array<Omit<BackupRecord, 'payload'>>>([]);
  const [fotos, setFotos] = useState({ count: 0, bytes: 0, pendingUpload: 0 });
  const [ocupado, setOcupado] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; datos: string; fotos: string } | null>(null);
  const proyectos = getFallbackProjects().filter(p => !p.deletedAt).length;
  const diasSinExport = diasDesdeUltimoExport();

  const refrescar = async () => {
    setSnapshots(await listarSnapshots());
    setFotos(await photoStats());
  };

  useEffect(() => {
    void refrescar();
  }, []);

  /**
   * Prueba de verdad: escribe y lee en Firestore y en Supabase. No informa
   * "parece que sí" — informa lo que efectivamente pasó.
   */
  const probar = async () => {
    setOcupado(true);
    setPrueba(null);
    try {
      const [datos, fotos] = await Promise.all([probarNube(), probarSupabase()]);
      setPrueba({
        // Los datos técnicos son lo crítico; las fotos pueden ir en camino.
        ok: datos.ok,
        datos: datos.ok ? 'Se guardan correctamente en la nube.' : `${datos.paso}: ${datos.detalle}`,
        fotos: fotos.ok
          ? 'Se suben correctamente.'
          : `${fotos.detalle} Mientras tanto quedan guardadas en el celular y suben solas cuando se arregle.`,
      });
    } catch (e: any) {
      setPrueba({ ok: false, datos: `Error inesperado: ${e?.message || e}`, fotos: 'No se pudo probar.' });
    } finally {
      setOcupado(false);
    }
  };

  const descargar = async () => {
    setOcupado(true);
    try {
      const r = await descargarRespaldoCompleto();
      toast.success(`Respaldo descargado: ${r.proyectos} proyectos (${pesoLegible(r.bytes)}).`, { duration: 7000 });
    } catch (e) {
      console.error(e);
      toast.error('No se pudo generar el respaldo');
    } finally {
      setOcupado(false);
    }
  };

  const copiaAhora = async () => {
    setOcupado(true);
    try {
      const r = await tomarSnapshot('manual');
      toast.success(r ? `Copia guardada: ${r.projectCount} proyectos.` : 'No hay proyectos para copiar.');
      await refrescar();
    } finally {
      setOcupado(false);
    }
  };

  const restaurar = async (id: number, cuando: number) => {
    if (!confirm(`¿Restaurar la copia del ${fecha(cuando)}?\n\nSe combina por código con lo que ya tenés: no borra nada.`)) return;
    setOcupado(true);
    try {
      const r = await restaurarSnapshot(id);
      toast.success(`${r.added} recuperados, ${r.updated} actualizados.`, { duration: 7000 });
      await refrescar();
    } catch (e: any) {
      toast.error(`No se pudo restaurar: ${e?.message || e}`);
    } finally {
      setOcupado(false);
    }
  };

  const traerDeLaNube = async () => {
    if (!haySesion()) {
      toast.error('Iniciá sesión para leer la nube');
      return;
    }
    setOcupado(true);
    try {
      const remotos = await bajarTodo();
      if (remotos.length === 0) {
        toast('La nube todavía no tiene proyectos', { icon: '☁️' });
        return;
      }
      const r = await restoreProjects(remotos);
      toast.success(`${remotos.length} proyectos leídos: ${r.added} nuevos, ${r.updated} actualizados.`, { duration: 8000 });
      await refrescar();
    } catch (e: any) {
      toast.error(`Error con la nube: ${e?.message || e}`);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="panel settings-panel">
      <p className="muted settings-help">
        Tus proyectos se guardan <strong>en el celular</strong> (funcionan sin señal) y se
        suben solos a la nube apenas hay conexión. Acá ves si eso está pasando de verdad.
      </p>

      {/* Estado */}
      <div style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
        <Linea etiqueta="Proyectos en este dispositivo" valor={String(proyectos)} />
        <Linea etiqueta="Fotos guardadas" valor={`${fotos.count} · ${pesoLegible(fotos.bytes)}`} />
        <Linea
          etiqueta="Copia en la nube"
          valor={
            !conSesion ? 'Sin sesión' :
            !enLinea ? `Sin señal · ${pendientes} en espera` :
            fallidos > 0 ? `${fallidos} con error` :
            pendientes > 0 ? `Subiendo ${pendientes}…` : 'Al día'
          }
          color={
            !conSesion || !enLinea ? '#f59e0b' :
            fallidos > 0 ? '#dc2626' :
            pendientes > 0 ? '#2563eb' : '#16a34a'
          }
        />
        {!nubeLista && (
          <Linea etiqueta="Fotos en la nube" valor="Sin configurar" color="#f59e0b" />
        )}
      </div>

      {diasSinExport > 7 && (
        <p
          className="muted settings-help"
          style={{ background: 'rgba(245,158,11,0.12)', borderRadius: 8, padding: 10, color: '#b45309' }}
        >
          ⚠️ Hace {diasSinExport === Infinity ? 'mucho' : `${Math.floor(diasSinExport)} días`} que no
          descargás un respaldo a tus Descargas. Un archivo guardado ahí fue lo que salvó
          los datos la última vez: sobrevive aunque se rompa la app.
        </p>
      )}

      {/* Probador real: escribe y lee de verdad en la nube. */}
      <div style={{ marginTop: 12 }}>
        <button className="primary" onClick={probar} disabled={ocupado} style={{ width: '100%' }}>
          <ShieldCheckIcon className="icon" /> Probar el respaldo ahora
        </button>
        {prueba && (
          <div
            style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 8,
              fontSize: 12.5,
              lineHeight: 1.45,
              background: prueba.ok ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.10)',
              color: prueba.ok ? '#15803d' : '#b91c1c',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {prueba.ok ? '✅ Tus datos SÍ están llegando a la nube' : '❌ Los datos NO están llegando a la nube'}
            </div>
            <div><strong>Datos técnicos:</strong> {prueba.datos}</div>
            <div><strong>Fotos:</strong> {prueba.fotos}</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <button className="primary" onClick={descargar} disabled={ocupado} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
          <ArrowDownTrayIcon className="icon" /> Descargar respaldo a Descargas
        </button>
        <button className="secondary" onClick={copiaAhora} disabled={ocupado}>
          <ShieldCheckIcon className="icon" /> Guardar copia interna ahora
        </button>
        <button className="secondary" onClick={traerDeLaNube} disabled={ocupado}>
          <CloudArrowDownIcon className="icon" /> Traer todo desde la nube
        </button>
      </div>

      {/* Copias automáticas */}
      <h3 style={{ marginTop: 20, marginBottom: 6 }}>Copias automáticas</h3>
      <p className="muted settings-help" style={{ marginTop: 0 }}>
        La app guarda una copia sola cada día y conserva las 10 últimas. Restaurar
        <strong> nunca borra</strong>: combina por código de proyecto.
      </p>

      {snapshots.length === 0 && <div className="empty">Todavía no hay copias automáticas.</div>}

      <div style={{ display: 'grid', gap: 6 }}>
        {snapshots.map(s => (
          <div
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '8px 10px',
              border: '1px solid var(--line)',
              borderRadius: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fecha(s.createdAt)}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {s.projectCount} proyectos · {s.photoCount} fotos · {pesoLegible(s.bytes)} · {s.reason}
              </div>
            </div>
            <button className="secondary" disabled={ocupado} onClick={() => restaurar(s.id!, s.createdAt)}>
              <ArrowUturnLeftIcon className="icon" /> Restaurar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Linea({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
      <span className="muted">{etiqueta}</span>
      <strong style={{ color: color || 'var(--text)' }}>{valor}</strong>
    </div>
  );
}
