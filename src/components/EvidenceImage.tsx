import type { CSSProperties } from 'react';
import { useEvidenceUrl } from '../lib/photoStore';
import type { EvidenceItem } from '../types';

/**
 * Muestra una foto de evidencia sin que la pantalla tenga que saber dónde
 * vive: puede ser un Blob local (lo normal), una URL de Supabase (proyecto
 * bajado de la nube) o base64 heredado de un respaldo viejo.
 */
export function EvidenceImage({
  ev,
  style,
  className,
}: {
  ev: EvidenceItem;
  style?: CSSProperties;
  className?: string;
}) {
  const url = useEvidenceUrl(ev);

  if (!url) {
    return (
      <div
        className={className}
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: 64,
          background: 'var(--surface-2)',
          color: 'var(--muted)',
          fontSize: 11,
          ...style,
        }}
      >
        …
      </div>
    );
  }

  return <img src={url} alt={ev.label} className={className} style={style} />;
}
