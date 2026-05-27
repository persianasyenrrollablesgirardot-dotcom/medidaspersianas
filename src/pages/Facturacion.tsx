import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { extractInvoiceData, extractInvoiceDataFromText } from '../lib/facturador/gemini'
import { UploadCloud, FileText, Loader2, Wand2, History, Type } from 'lucide-react'
import { generateFinalInvoiceUrl } from '../lib/facturador/pdf-generator'
import { db, generateDocumentSequence } from '../db'

export function Facturacion() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [documentMode, setDocumentMode] = useState<'COTIZACION' | 'FACTURA' | null>(null)
  const [inputMethod, setInputMethod] = useState<'PDF' | 'TEXT'>('PDF')
  const [rawText, setRawText] = useState('')
  const [formData, setFormData] = useState<any>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const location = useLocation()

  useEffect(() => {
    if (location.state?.autoGenerateText) {
      setDocumentMode('COTIZACION'); // Default
      setInputMethod('TEXT');
      setRawText(location.state.autoGenerateText);
    }
  }, [location.state])

  const loadRegistry = async () => {
    try {
      const allInvoices = await db.invoices.reverse().sortBy('date');
      setRecords(allInvoices);
    } catch (e) {
      console.error("Error cargando la bitácora desde Dexie:", e);
    }
  }

  useEffect(() => {
    loadRegistry();
  }, [])

  useEffect(() => {
    if (formData) {
      generateFinalInvoiceUrl(formData).then(url => {
        setPdfUrl(url)
      }).catch(console.error)
    } else {
      setPdfUrl(null)
    }
  }, [formData])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && documentMode) {
      setIsProcessing(true)
      try {
        const extractedData = await extractInvoiceData(file)
        // Obtener consecutivo de Dexie
        const seq = await generateDocumentSequence(documentMode);
        
        await db.invoices.add({
          type: documentMode,
          documentNumber: seq,
          clientName: extractedData.clientName,
          total: extractedData.total,
          date: Date.now()
        });
        
        extractedData.type = documentMode;
        extractedData.documentNumber = seq;
        
        setFormData(extractedData)
        loadRegistry()
      } catch (error) {
        alert("Hubo un error al analizar el PDF. Asegúrate de que es válido.")
        console.error(error)
      } finally {
        setIsProcessing(false)
      }
    }
  }

  const handleTextSubmit = async () => {
    if (rawText.trim().length > 10 && documentMode) {
      setIsProcessing(true)
      try {
        const extractedData = await extractInvoiceDataFromText(rawText)
        // Obtener consecutivo de Dexie
        const seq = await generateDocumentSequence(documentMode);
        
        await db.invoices.add({
          type: documentMode,
          documentNumber: seq,
          clientName: extractedData.clientName,
          total: extractedData.total,
          date: Date.now()
        });
        
        extractedData.type = documentMode;
        extractedData.documentNumber = seq;
        
        setFormData(extractedData)
        loadRegistry()
      } catch (error) {
        alert("Hubo un error al analizar el texto. Asegúrate de que es entendible.")
        console.error(error)
      } finally {
        setIsProcessing(false)
      }
    }
  }

  const resetForm = () => {
    setFormData(null)
    setDocumentMode(null)
    setRawText('')
  }

  return (
    <div className="page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel" style={{ flex: 1, display: 'flex', gap: '2rem', flexWrap: 'wrap', overflowY: 'auto' }}>
      
      {/* Columna Izquierda: Inteligencia Artificial */}
      <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: formData || !documentMode ? 'flex-start' : 'center' }}>
        
        {!documentMode ? (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <h2 style={{fontSize: '1.5rem', marginBottom: '2rem'}}>¿Qué deseas generar hoy?</h2>
            <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
              <button onClick={() => setDocumentMode('COTIZACION')} className="primary wide" style={{ height: '60px', fontSize: '16px' }}>
                Crear COTIZACIÓN
              </button>
              <button onClick={() => setDocumentMode('FACTURA')} className="primary wide" style={{ height: '60px', fontSize: '16px', background: 'var(--secondary)' }}>
                Crear FACTURA
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', marginTop: '2rem' }}>El sistema generará el número consecutivo automático en la base de datos local y guardará el registro.</p>
            
            {/* BITACORA DE REGISTROS */}
            <div style={{ marginTop: '3rem', textAlign: 'left', background: 'var(--bg-deep)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', overflowY: 'auto', maxHeight: '300px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
                <History size={20} />
                Bitácora de Documentos Generados
              </h3>
              {records.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Aún no hay documentos generados. El historial aparecerá aquí.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 4px' }}>Consecutivo</th>
                      <th style={{ padding: '8px 4px' }}>Cliente</th>
                      <th style={{ padding: '8px 4px' }}>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 4px', fontWeight: 'bold', color: r.type === 'FACTURA' ? '#10b981' : 'var(--primary)' }}>{r.documentNumber}</td>
                        <td style={{ padding: '10px 4px' }}>{r.clientName}</td>
                        <td style={{ padding: '10px 4px', color: 'var(--text-muted)' }}>{new Date(r.date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : !formData ? (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <button onClick={() => setInputMethod('PDF')} className={inputMethod === 'PDF' ? 'primary' : 'secondary'} style={{ flex: 1 }}>
                <UploadCloud size={18} /> Subir PDF
              </button>
              <button onClick={() => setInputMethod('TEXT')} className={inputMethod === 'TEXT' ? 'primary' : 'secondary'} style={{ flex: 1 }}>
                <Type size={18} /> Pegar Texto Libre
              </button>
            </div>

            {inputMethod === 'PDF' ? (
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                 <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="application/pdf" style={{display: 'none'}} />
                 
                 {isProcessing ? (
                   <div style={{textAlign: 'center'}}>
                     <Loader2 className="spinner" size={64} color="var(--primary)" style={{margin: '0 auto', marginBottom: '1rem', animation: 'spin 1s linear infinite'}} />
                     <h2>Analizando PDF para {documentMode}...</h2>
                     <p style={{color: 'var(--text-muted)', marginTop: '0.5rem'}}>Generando consecutivo oficial y extrayendo datos...</p>
                   </div>
                 ) : (
                   <div style={{textAlign: 'center', cursor: 'pointer', padding: '3rem', border: '2px dashed var(--glass-border)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-deep)', transition: 'all 0.3s'}} className="hover-upload">
                     <UploadCloud size={64} color="var(--primary)" style={{margin: '0 auto', marginBottom: '1rem'}} />
                     <h2>Sube el PDF de la {documentMode}</h2>
                     <p style={{color: 'var(--text-muted)', marginTop: '0.5rem'}}>La IA extraerá la info y se le asignará un número consecutivo de la base de datos.</p>
                   </div>
                 )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {isProcessing ? (
                   <div style={{textAlign: 'center', padding: '3rem', background: 'var(--bg-deep)', borderRadius: 'var(--radius-md)'}}>
                     <Loader2 className="spinner" size={64} color="var(--primary)" style={{margin: '0 auto', marginBottom: '1rem', animation: 'spin 1s linear infinite'}} />
                     <h2>Analizando texto con Inteligencia Artificial...</h2>
                     <p style={{color: 'var(--text-muted)', marginTop: '0.5rem'}}>Organizando datos e ítems desordenados...</p>
                   </div>
                ) : (
                  <>
                    <textarea 
                      placeholder="Pega aquí los datos del cliente, los servicios, precios, etc. (Ej: 'Cotízame para Juan Perez, Nit 123, 2 ventanas de 1m2 a $50.000 cada una...')"
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      className="input"
                      style={{ width: '100%', height: '200px', resize: 'none' }}
                    />
                    <button onClick={handleTextSubmit} disabled={rawText.length < 10} className="primary" style={{ opacity: rawText.length >= 10 ? 1 : 0.5 }}>
                      Generar {documentMode} Mágicamente
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="extraction-success" style={{ animation: 'fadeIn 0.5s ease' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--primary)' }}>
                <Wand2 size={24} />
                <h2 style={{margin: 0}}>¡Extracción Exitosa!</h2>
             </div>
             
             <div style={{ background: 'var(--bg-deep)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                <p><strong>Tipo:</strong> {formData.type}</p>
                <p><strong>Consecutivo Asignado:</strong> {formData.documentNumber}</p>
                <p><strong>Cliente:</strong> {formData.clientName}</p>
                <p><strong>NIT:</strong> {formData.clientNit}</p>
                {formData.discount > 0 && <p style={{color: '#ef4444'}}><strong>Descuento Detectado:</strong> -${formData.discount}</p>}
                <p><strong>Total Extraído:</strong> ${formData.total}</p>
                <p><strong>Ítems:</strong> {formData.items.length}</p>
                
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button onClick={resetForm} className="secondary" style={{ flex: 1 }}>
                    Subir otro
                  </button>
                  <a href={pdfUrl || '#'} download={`Factura_${formData.documentNumber}.pdf`} className="primary" style={{ flex: 2, textDecoration: 'none' }}>
                    Descargar PDF Oficial
                  </a>
                </div>
             </div>
          </div>
        )}

      </div>

      {/* Columna Derecha: Vista Previa PDF Rígido (Factura + Condiciones Originales) */}
      <div style={{ flex: '1 1 400px', minHeight: '500px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--glass-border)', background: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {pdfUrl ? (
          <iframe src={pdfUrl} width="100%" height="100%" style={{ border: 'none' }} title="PDF Final" />
        ) : (
          <div style={{ textAlign: 'center', color: '#9ca3af' }}>
             <FileText size={48} style={{margin: '0 auto', marginBottom: '1rem', opacity: 0.5}} />
             <p>El documento rígido completo se generará aquí<br/>(Incluyendo el diseño original de tus condiciones).</p>
          </div>
        )}
      </div>

      </div>
    </div>
  )
}
