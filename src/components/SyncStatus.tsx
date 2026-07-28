import { useState } from 'react';
import toast from 'react-hot-toast';
import { reintentarFallidos, useSyncStatus } from '../lib/syncQueue';

/**
 * Semáforo de respaldo en la nube. Está siempre a la vista a propósito:
 * el problema de fondo nunca fue técnico solamente, fue no saber que algo
 * estaba sin respaldar hasta que ya era tarde.
 */
export function SyncStatus() {
  const { pendientes, fallidos, enLinea, conSesion } = useSyncStatus();
  const [reintentando, setReintentando] = useState(false);

  const reintentar = async () => {
    setReintentando(true);
    try {
      await reintentarFallidos();
      toast.success('Reintentando la subida…');
    } finally {
      setReintentando(false);
    }
  };

  let color = '#16a34a';
  let texto = 'Todo respaldado';
  let clickable = false;

  if (!conSesion) {
    color = '#9ca3af';
    texto = 'Sin sesión — no se respalda';
  } else if (!enLinea) {
    color = '#f59e0b';
    texto = pendientes > 0 ? `Sin señal · ${pendientes} por subir` : 'Sin señal';
  } else if (fallidos > 0) {
    color = '#dc2626';
    texto = `${fallidos} sin subir — tocá para reintentar`;
    clickable = true;
  } else if (pendientes > 0) {
    color = '#2563eb';
    texto = `Subiendo… ${pendientes}`;
  }

  return (
    <button
      type="button"
      onClick={clickable ? reintentar : undefined}
      disabled={!clickable || reintentando}
      title={texto}
      style={{
        position: 'fixed',
        top: 4,
        left: 6,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 7px',
        borderRadius: 999,
        border: 'none',
        background: 'transparent',
        color,
        fontSize: 10,
        cursor: clickable ? 'pointer' : 'default',
        opacity: 0.85,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {texto}
    </button>
  );
}
