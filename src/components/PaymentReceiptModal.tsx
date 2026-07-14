import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { generateReceiptUrl } from '../lib/facturador/pdf-generator';
import type { TechnicalProject } from '../types';
import { db } from '../db';

interface PaymentReceiptModalProps {
  project: TechnicalProject;
  total: number;
  subtotal?: number;
  discountPercent?: number;
  onClose: () => void;
}

export function PaymentReceiptModal({ project, total, subtotal, discountPercent, onClose }: PaymentReceiptModalProps) {
  const [abono, setAbono] = useState<string>('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const saldo = total - (Number(abono) || 0);
  const abonoNum = Number(abono) || 0;

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleGenerate = async () => {
    if (abonoNum <= 0) {
      toast.error('Por favor ingresa un valor de abono mayor a 0');
      return;
    }
    
    setIsGenerating(true);
    toast.loading('Generando recibo de pago...', { id: 'receipt-gen' });
    try {
      const data = {
        projectCode: project.code,
        clientName: project.clientName || 'Cliente sin nombre',
        clientNit: project.clientDocument || 'Sin NIT',
        clientAddress: project.address || 'Sin dirección',
        date: new Date().toLocaleDateString('es-CO'),
        total: subtotal || total,
        discountPercent,
        totalNeto: total,
        abono: abonoNum,
        saldo
      };
      
      const url = await generateReceiptUrl(data);
      setPdfUrl(url);
      
      try {
        await db.receipts.add({
          projectId: project.id!,
          projectCode: project.code,
          clientName: project.clientName || 'Cliente sin nombre',
          total: subtotal || total,
          discountPercent,
          abono: abonoNum,
          saldo: saldo,
          date: Date.now(),
          status: saldo <= 0 ? 'closed' : 'open'
        });
      } catch (dbErr) {
        console.error('Error guardando en BD local:', dbErr);
        // Silently fail if db save fails but PDF works
      }

      toast.dismiss('receipt-gen');
    } catch (e) {
      console.error(e);
      toast.error('Error al generar el recibo.', { id: 'receipt-gen' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!pdfUrl) return;
    try {
      toast.loading('Preparando para compartir...', { id: 'share' });
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const file = new File([blob], `Recibo_${project.code}.pdf`, { type: 'application/pdf' });
      toast.dismiss('share');
      
      if (navigator.share) {
        await navigator.share({
          title: `Recibo de Pago ${project.code}`,
          text: `Adjunto recibo de pago para el proyecto ${project.code}.`,
          files: [file]
        });
      } else {
        toast.error('Tu navegador no soporta compartir directamente. Usa el botón de descargar.');
      }
    } catch (e) {
      console.error(e);
      toast.dismiss('share');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          background: 'var(--surface)', 
          padding: 0, 
          overflow: 'hidden', 
          display: 'flex', 
          flexDirection: 'column',
          width: '100%',
          height: pdfUrl ? '100%' : 'auto',
          maxWidth: '800px',
          margin: pdfUrl ? '0 auto' : 'auto'
        }}
      >
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', borderBottom: '1px solid var(--glass-border)' }}>
          <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Generar Recibo de Pago</h3>
          <button className="ghost" onClick={onClose} style={{ fontSize: '1.5rem', padding: '0 0.5rem' }}>✕</button>
        </div>
        
        {!pdfUrl ? (
          <div style={{ padding: '2rem' }}>
            <div style={{ marginBottom: '1.5rem', background: 'var(--bg-deep)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <p style={{ margin: '0 0 10px 0', color: 'var(--text-muted)' }}><strong>Proyecto:</strong> {project.code}</p>
              <p style={{ margin: '0 0 10px 0', color: 'var(--text-muted)' }}><strong>Cliente:</strong> {project.clientName || 'Sin definir'}</p>
              {discountPercent ? (
                <>
                  <p style={{ margin: '0 0 5px 0', color: 'var(--text-muted)' }}>Subtotal: ${(subtotal || total).toLocaleString('es-CO')}</p>
                  <p style={{ margin: '0 0 10px 0', color: 'var(--text-muted)' }}>Descuento: {discountPercent}%</p>
                </>
              ) : null}
              <h2 style={{ margin: '0', color: 'var(--primary)', fontSize: '1.5rem' }}>Total a Pagar: ${total.toLocaleString('es-CO')}</h2>
            </div>
            
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>¿Cuánto es el valor del abono?</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-deep)', borderRadius: '8px', padding: '0.5rem 1rem', border: '1px solid var(--blue)' }}>
                <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginRight: '10px' }}>$</span>
                <input 
                  type="number" 
                  value={abono}
                  onChange={e => setAbono(e.target.value)}
                  placeholder="Ej: 200000"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1.5rem', width: '100%', outline: 'none' }}
                  autoFocus
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1rem', background: saldo < 0 ? '#ef444433' : '#10b98133', borderRadius: '8px', border: `1px solid ${saldo < 0 ? '#ef4444' : '#10b981'}` }}>
              <span style={{ fontWeight: 'bold' }}>Saldo Pendiente:</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: saldo < 0 ? '#ef4444' : '#10b981' }}>
                ${saldo.toLocaleString('es-CO')}
              </span>
            </div>

            <button 
              className="primary wide" 
              onClick={handleGenerate}
              disabled={isGenerating || abonoNum <= 0}
              style={{ padding: '1rem', fontSize: '1.1rem' }}
            >
              {isGenerating ? 'Generando...' : '📄 Generar Recibo PDF'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, backgroundColor: '#555' }}>
              <iframe 
                src={pdfUrl} 
                style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
                title="Vista Preliminar"
              />
            </div>

            <div style={{ padding: '1rem', display: 'flex', gap: '1rem', background: 'var(--surface-2)', borderTop: '1px solid var(--glass-border)' }}>
              <a 
                href={pdfUrl}
                download={`Recibo_${project.code}.pdf`}
                className="primary" 
                style={{ flex: 1, background: '#3b82f6', borderColor: '#3b82f6', textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
          </>
        )}
      </div>
    </div>
  );
}
