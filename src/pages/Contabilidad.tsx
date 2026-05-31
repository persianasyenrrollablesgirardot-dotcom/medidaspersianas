import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import { TrashIcon, CheckCircleIcon, DocumentArrowDownIcon, CalculatorIcon, ArrowDownTrayIcon, ShareIcon } from '@heroicons/react/24/outline';
import { db } from '../db';
import type { ReceiptRecord } from '../types';
import { generateReceiptUrl } from '../lib/facturador/pdf-generator';

export function Contabilidad() {
  const receipts = useLiveQuery(() => db.receipts.reverse().sortBy('date')) || [];
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Calculate KPIs
  const totalPorCobrar = receipts
    .filter(r => r.status === 'open')
    .reduce((sum, r) => sum + r.saldo, 0);
    
  const totalRecaudado = receipts
    .reduce((sum, r) => sum + r.abono, 0);

  const handleClose = async (receipt: ReceiptRecord) => {
    if (confirm(`¿Marcar el saldo pendiente de $${receipt.saldo.toLocaleString('es-CO')} como pagado y cerrar este recibo?`)) {
      try {
        await db.receipts.update(receipt.id!, { status: 'closed' });
        toast.success('Recibo cerrado con éxito');
      } catch (e) {
        console.error(e);
        toast.error('Error al cerrar el recibo');
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Estás seguro de eliminar este recibo? Esto afectará los totales calculados.')) {
      try {
        await db.receipts.delete(id);
        toast.success('Recibo eliminado');
      } catch (e) {
        console.error(e);
        toast.error('Error al eliminar');
      }
    }
  };

  const handleViewPdf = async (receipt: ReceiptRecord) => {
    try {
      toast.loading('Regenerando PDF...', { id: 'pdf' });
      // Construct the ReceiptData
      const data = {
        projectCode: receipt.projectCode,
        clientName: receipt.clientName,
        clientNit: 'N/A', // Not stored in DB but fine for preview
        clientAddress: 'N/A',
        date: new Date(receipt.date).toLocaleDateString('es-CO'),
        total: receipt.total,
        abono: receipt.abono,
        saldo: receipt.saldo
      };
      
      const url = await generateReceiptUrl(data);
      setPreviewUrl(url);
      toast.dismiss('pdf');
    } catch (e) {
      console.error(e);
      toast.error('Error al generar PDF', { id: 'pdf' });
    }
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `Recibo.pdf`;
    link.click();
  };

  const handleShare = async () => {
    if (!previewUrl) return;
    try {
      const response = await fetch(previewUrl);
      const blob = await response.blob();
      const file = new File([blob], `Recibo.pdf`, { type: 'application/pdf' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Recibo de Pago',
          text: 'Adjunto recibo de pago',
        });
      } else {
        toast.error('Compartir archivos no soportado en este navegador');
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al compartir');
    }
  };

  return (
    <div className="page">
      <header className="hero" style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}>
        <p>Control de Cartera</p>
        <h1>Módulo de Contabilidad</h1>
      </header>

      <section className="stats-row" style={{ marginTop: '-20px', zIndex: 10, position: 'relative' }}>
        <div className="stat" style={{ flex: 1, borderColor: '#ef4444' }}>
          <strong style={{ color: '#ef4444' }}>$ {totalPorCobrar.toLocaleString('es-CO')}</strong>
          <span>Total por Cobrar</span>
        </div>
        <div className="stat" style={{ flex: 1, borderColor: '#10b981' }}>
          <strong style={{ color: '#10b981' }}>$ {totalRecaudado.toLocaleString('es-CO')}</strong>
          <span>Total Recaudado</span>
        </div>
      </section>

      <div className="section-title list-title">
        <div>
          <h2>Historial de Recibos</h2>
          <p className="muted">{receipts.length} recibos generados</p>
        </div>
      </div>

      <section className="list">
        {receipts.map(receipt => {
          const isClosed = receipt.status === 'closed';
          
          return (
            <article 
              key={receipt.id} 
              className="project-card" 
              style={{ 
                opacity: isClosed ? 0.7 : 1, 
                borderLeft: `4px solid ${isClosed ? '#6b7280' : '#f59e0b'}`,
                textDecoration: isClosed ? 'line-through' : 'none',
                textDecorationColor: '#6b7280'
              }}
            >
              <div className="project-open" style={{ cursor: 'default' }}>
                <div>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {receipt.clientName}
                    {isClosed && <span style={{ fontSize: '0.7rem', background: '#374151', color: '#d1d5db', padding: '2px 6px', borderRadius: '4px', textDecoration: 'none' }}>PAGADO</span>}
                  </strong>
                  <span>Proyecto: {receipt.projectCode} • {new Date(receipt.date).toLocaleDateString('es-CO')}</span>
                </div>
                <div className="card-meta" style={{ marginTop: '10px', display: 'flex', gap: '15px' }}>
                  <span style={{ textDecoration: 'none' }}>Total: ${receipt.total.toLocaleString('es-CO')}</span>
                  <span style={{ textDecoration: 'none', color: '#10b981' }}>Abono: ${receipt.abono.toLocaleString('es-CO')}</span>
                  <span style={{ textDecoration: 'none', color: isClosed ? '#6b7280' : '#f59e0b', fontWeight: 'bold' }}>
                    Saldo: ${receipt.saldo.toLocaleString('es-CO')}
                  </span>
                </div>
              </div>
              <div className="project-card-actions" style={{ padding: '0.5rem 1rem' }}>
                <button
                  className="ghost"
                  onClick={() => handleViewPdf(receipt)}
                  title="Ver PDF del Recibo"
                  style={{ color: '#3b82f6' }}
                >
                  <DocumentArrowDownIcon className="icon" />
                </button>
                {!isClosed && (
                  <button
                    className="ghost"
                    onClick={() => handleClose(receipt)}
                    title="Marcar saldo como pagado (Cerrar Recibo)"
                    style={{ color: '#10b981' }}
                  >
                    <CheckCircleIcon className="icon" />
                  </button>
                )}
                <button
                  className="ghost"
                  onClick={() => handleDelete(receipt.id!)}
                  title="Eliminar Recibo"
                  style={{ color: '#ef4444' }}
                >
                  <TrashIcon className="icon" />
                </button>
              </div>
            </article>
          );
        })}
        {receipts.length === 0 && (
          <div className="empty">
            <CalculatorIcon className="icon" style={{ width: 48, height: 48, color: '#374151', marginBottom: 16 }} />
            No se han generado recibos de pago aún. Genera uno desde un proyecto.
          </div>
        )}
      </section>

      {/* Reutilizamos el modal pero con iframe nativo porque generamos un Blob de PDF */}
      {previewUrl && (
        <div className="modal-backdrop" onClick={() => setPreviewUrl(null)} style={{ zIndex: 9999 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#111', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222' }}>
              <h3 style={{ margin: 0, color: 'white' }}>Vista Preliminar Recibo</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="primary small" onClick={handleDownload} title="Descargar PDF" style={{ padding: '0 12px', minHeight: '36px' }}>
                  <ArrowDownTrayIcon className="icon" style={{ width: 18, height: 18 }} />
                </button>
                <button className="primary small" onClick={handleShare} title="Compartir PDF" style={{ padding: '0 12px', minHeight: '36px' }}>
                  <ShareIcon className="icon" style={{ width: 18, height: 18 }} />
                </button>
                <button className="ghost" onClick={() => setPreviewUrl(null)} style={{ color: 'white', fontSize: '1.5rem', padding: '0 0.5rem', minHeight: '36px' }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, backgroundColor: '#555' }}>
              <iframe src={previewUrl} style={{ width: '100%', height: '100%', border: 'none', background: 'white' }} title="Recibo" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
