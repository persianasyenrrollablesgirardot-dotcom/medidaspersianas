import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface PdfPreviewModalProps {
  htmlContent: string | null;
  onClose: () => void;
  filename?: string;
}

export function PdfPreviewModal({ htmlContent, onClose, filename = 'reporte.pdf' }: PdfPreviewModalProps) {
  const [generating, setGenerating] = useState(false);
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);

  useEffect(() => {
    if (htmlContent) {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setHtmlUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setHtmlUrl(null);
    }
  }, [htmlContent]);

  if (!htmlContent) return null;

  const getPdfBlob = async (): Promise<Blob> => {
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    const opt = {
      margin: 10,
      filename: filename,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };
    return await html2pdf().set(opt).from(container).output('blob');
  };

  const handleDownload = async () => {
    try {
      setGenerating(true);
      toast.loading('Generando PDF...', { id: 'pdf-gen' });
      const blob = await getPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss('pdf-gen');
    } catch (e) {
      console.error(e);
      toast.error('Error al descargar.', { id: 'pdf-gen' });
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    try {
      setGenerating(true);
      toast.loading('Generando PDF para compartir...', { id: 'pdf-gen' });
      const blob = await getPdfBlob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      toast.dismiss('pdf-gen');
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
      toast.error('No se pudo compartir.', { id: 'pdf-gen' });
    } finally {
      setGenerating(false);
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
          {htmlUrl && (
            <iframe 
              src={htmlUrl} 
              style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
              title="Vista Preliminar"
            />
          )}
        </div>

        <div style={{ padding: '1rem', display: 'flex', gap: '1rem', background: '#222' }}>
          <button 
            className="primary" 
            onClick={handleDownload}
            disabled={generating}
            style={{ flex: 1, background: '#3b82f6', borderColor: '#3b82f6' }}
          >
            ⬇️ Descargar
          </button>
          <button 
            className="primary" 
            onClick={handleShare} 
            disabled={generating}
            style={{ flex: 1, background: '#10b981', borderColor: '#10b981' }}
          >
            📲 Compartir
          </button>
        </div>
      </div>
    </div>
  );
}
