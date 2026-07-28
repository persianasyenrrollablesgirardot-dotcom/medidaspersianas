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
        saldo: receipt.saldo,
        discountPercent: receipt.discountPercent,
        totalNeto: receipt.discountPercent ? (receipt.total - (receipt.total * (receipt.discountPercent / 100))) : receipt.total
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

      <section className="cartera-kpis">
        <div className="kpi kpi-red">
          <span className="kpi-label">Total por cobrar</span>
          <strong className="kpi-value">$ {totalPorCobrar.toLocaleString('es-CO')}</strong>
        </div>
        <div className="kpi kpi-green">
          <span className="kpi-label">Total recaudado</span>
          <strong className="kpi-value">$ {totalRecaudado.toLocaleString('es-CO')}</strong>
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
            <article key={receipt.id} className={`receipt-card ${isClosed ? 'closed' : 'open'}`}>
              <div className="receipt-head">
                <div className="receipt-title">
                  <strong>{receipt.clientName}</strong>
                  {isClosed
                    ? <span className="badge-paid">✓ Pagado</span>
                    : <span className="badge-pending">Pendiente</span>}
                </div>
                <span className="receipt-sub">Proyecto {receipt.projectCode} • {new Date(receipt.date).toLocaleDateString('es-CO')}</span>
              </div>

              <div className="receipt-amounts">
                <div className="amount">
                  <span>Total</span>
                  <strong>$ {receipt.total.toLocaleString('es-CO')}</strong>
                </div>
                <div className="amount green">
                  <span>Abono</span>
                  <strong>$ {receipt.abono.toLocaleString('es-CO')}</strong>
                </div>
                <div className={`amount ${isClosed ? '' : 'amber'}`}>
                  <span>Saldo</span>
                  <strong>$ {receipt.saldo.toLocaleString('es-CO')}</strong>
                </div>
              </div>

              <div className="receipt-actions">
                <button type="button" className="receipt-act" onClick={() => handleViewPdf(receipt)}>
                  <DocumentArrowDownIcon className="icon" /> Ver recibo PDF
                </button>
                {!isClosed && (
                  <button type="button" className="receipt-act green" onClick={() => handleClose(receipt)}>
                    <CheckCircleIcon className="icon" /> Marcar pagado
                  </button>
                )}
                <button type="button" className="receipt-act danger" onClick={() => handleDelete(receipt.id!)} title="Eliminar recibo">
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
