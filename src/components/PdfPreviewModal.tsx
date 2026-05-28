import React from 'react';
import toast from 'react-hot-toast';

interface PdfPreviewModalProps {
  pdfUrl: string | null;
  onClose: () => void;
  filename?: string;
}

export function PdfPreviewModal({ pdfUrl, onClose, filename = 'reporte.pdf' }: PdfPreviewModalProps) {
  if (!pdfUrl) return null;

  const handleShare = async () => {
    try {
      const res = await fetch(pdfUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.share) {
        await navigator.share({
          title: 'Reporte Técnico',
          files: [file],
        });
      } else {
        toast.error('Tu dispositivo no soporta compartir directamente.');
      }
    } catch (e) {
      console.error(e);
      toast.error('No se pudo compartir.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          background: '#111', 
          padding: 0, 
          overflow: 'hidden', 
          display: 'flex', 
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          maxWidth: '800px',
          margin: '0 auto'
        }}
      >
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222' }}>
          <h3 style={{ margin: 0, color: 'white' }}>Vista Preliminar</h3>
          <button className="ghost" onClick={onClose} style={{ color: 'white', fontSize: '1.5rem', padding: '0 0.5rem' }}>✕</button>
        </div>
        
        <div style={{ flex: 1, backgroundColor: '#555' }}>
          <iframe 
            src={pdfUrl + '#toolbar=0'} 
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="PDF Preview"
          />
        </div>

        <div style={{ padding: '1rem', display: 'flex', gap: '1rem', background: '#222' }}>
          <a 
            href={pdfUrl} 
            download={filename} 
            className="primary" 
            style={{ flex: 1, textAlign: 'center', textDecoration: 'none', background: '#3b82f6', borderColor: '#3b82f6' }}
          >
            ⬇️ Descargar
          </a>
          <button 
            className="primary" 
            onClick={handleShare} 
            style={{ flex: 1, background: '#10b981', borderColor: '#10b981' }}
          >
            📲 Compartir
          </button>
        </div>
      </div>
    </div>
  );
}
