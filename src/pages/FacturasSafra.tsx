import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon, ArrowUpTrayIcon, ChevronDownIcon, DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { PageHeader } from '../components/PageHeader';
import reporteDeHoy from '../lib/safra/reporte-2026-09-07.json';
import type { PedidoSafra, ProductoSafra, ReporteSafra } from '../lib/safra/tipos';
import {
  areaPedido, areaPieza, calcularResumen, camposPropios, etiqueta, fechaCorta,
  formasDePago, metros, normalizar, pesos, piezasPedido, porFormaDePago,
  porTipoDePersiana, tiposDePersiana,
} from '../lib/safra/campos';
import {
  cambiosPendientes, hayNube, leerPedidos, leerProductos, marcarCambioRevisado,
  ultimoReporte, type CambioFila,
} from '../lib/safra/nube';
import { armarReporte } from '../lib/safra/armar';
import { importarTexto, procesarPendientes } from '../lib/safra/sincronizar';

/**
 * De donde salen los datos, en orden de preferencia:
 *
 *   1. Supabase — el acumulado de todos los dias, que es lo que deja el script
 *      de Google Apps Script cada manana.
 *   2. El archivo del 07-sep incrustado — si la nube todavia no tiene nada, si
 *      faltan las tablas o si no hay internet. La pantalla NUNCA queda en
 *      blanco: siempre hay algo para mirar y siempre se dice de donde salio.
 *
 * Al entrar tambien se procesa lo que el script haya dejado crudo sin volcar.
 * El script hace lo minimo (leer el archivo de Drive y guardarlo tal cual);
 * toda la parte delicada — deduplicar, no pisar un dato bueno con uno vacio,
 * anotar los cambios de plata — pasa aca, en TypeScript, que es donde se puede
 * probar. Ver `lib/safra/ingesta.ts`.
 */
const SEMILLA = reporteDeHoy as unknown as ReporteSafra;

export function FacturasSafra() {
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('all');
  const [formaFiltro, setFormaFiltro] = useState('all');
  const [abierto, setAbierto] = useState<string | null>(null);

  const [reporte, setReporte] = useState<ReporteSafra>(SEMILLA);
  const [origen, setOrigen] = useState<'nube' | 'semilla'>('semilla');
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [descuadreArchivo, setDescuadreArchivo] = useState<ReturnType<typeof calcularResumen> | null>(null);
  const [cambios, setCambios] = useState<CambioFila[]>([]);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async (procesarPrimero: boolean) => {
    if (!hayNube()) {
      setAviso('Esta instalacion no tiene Supabase configurado. Se muestra el archivo del 7 de septiembre.');
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      if (procesarPrimero) {
        const hechos = await procesarPendientes();
        const nuevos = hechos.reduce((s, r) => s + r.nuevos, 0);
        if (nuevos) toast.success(`${nuevos} pedido(s) nuevo(s) de Safra`);
      }

      const [pedidos, productos] = await Promise.all([leerPedidos(), leerProductos()]);
      if (pedidos && pedidos.length) {
        setReporte(armarReporte(pedidos, productos || []));
        setOrigen('nube');
        setAviso(null);
        // El descuadre es una propiedad del ARCHIVO, no de la base: en la base
        // los totales siempre salen de sumar las facturas. Se calcula contra el
        // ultimo crudo que llego.
        const ultimo = await ultimoReporte().catch(() => null);
        setDescuadreArchivo(ultimo?.[0]?.json_crudo ? calcularResumen(ultimo[0].json_crudo) : null);
      } else {
        setReporte(SEMILLA);
        setOrigen('semilla');
        setDescuadreArchivo(null);
        setAviso('Todavia no llego ningun reporte a la nube. Se muestra el archivo del 7 de septiembre.');
      }
      setCambios((await cambiosPendientes().catch(() => [])) || []);
    } catch (e) {
      const msg = String(e);
      setReporte(SEMILLA);
      setOrigen('semilla');
      setDescuadreArchivo(null);
      setAviso(msg.includes('TABLAS_FALTAN')
        ? 'Faltan crear las tablas safra_* en Supabase (el SQL esta en supabase/migrations). Se muestra el archivo del 7 de septiembre.'
        : `No se pudo leer la nube (${msg.slice(0, 110)}). Se muestra el archivo del 7 de septiembre.`);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(true); }, [cargar]);

  /** Red de seguridad: si un dia el automatico no corre, se mete a mano. */
  const importar = async (archivo: File) => {
    const id = toast.loading('Importando reporte...');
    try {
      const r = await importarTexto(archivo.name, await archivo.text());
      toast.success(
        `${r.nuevos} nuevos · ${r.actualizados} actualizados · ${r.sinCambios} sin cambios` +
        (r.duplicado ? ' (este archivo ya estaba subido)' : ''),
        { id, duration: 6000 },
      );
      if (r.cambiosDetectados) toast(`${r.cambiosDetectados} cambio(s) para revisar`, { icon: '⚠️', duration: 7000 });
      await cargar(false);
    } catch (e) {
      toast.error(String(e).replace('Error: ', ''), { id, duration: 8000 });
    }
  };

  const revisar = async (cambio: CambioFila) => {
    try {
      await marcarCambioRevisado(cambio.id);
      setCambios(prev => prev.filter(c => c.id !== cambio.id));
    } catch { toast.error('No se pudo marcar como revisado.'); }
  };

  const { real } = useMemo(() => calcularResumen(reporte), [reporte]);
  const descuadres = useMemo(
    () => (origen === 'nube' ? (descuadreArchivo?.descuadres || []) : calcularResumen(reporte).descuadres),
    [origen, descuadreArchivo, reporte],
  );
  const tipos = useMemo(() => tiposDePersiana(reporte.pedidos), [reporte]);
  const formas = useMemo(() => formasDePago(reporte.pedidos), [reporte]);

  const pedidos = useMemo(() => {
    let lista = reporte.pedidos;

    if (formaFiltro !== 'all') lista = lista.filter(p => p.facturacion.forma_pago === formaFiltro);
    if (tipoFiltro !== 'all') lista = lista.filter(p => p.productos.some(pr => pr.tipo === tipoFiltro));

    const tokens = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (tokens.length) {
      lista = lista.filter(p => {
        const campos = [
          p.pedido_id, p.referencia_personalizada, p.facturacion.factura_numero, p.facturacion.forma_pago,
          ...p.productos.flatMap(pr => [pr.tipo, pr.tela, pr.ubicacion, pr.coordinado]),
        ];
        const texto = normalizar(campos.filter(Boolean).join(' '));
        return tokens.every(t => texto.includes(t));
      });
    }

    // Lo mas reciente primero; a igual fecha, la factura mas grande arriba.
    return [...lista].sort((a, b) =>
      (b.facturacion.fecha || '').localeCompare(a.facturacion.fecha || '') ||
      (b.facturacion.total ?? 0) - (a.facturacion.total ?? 0));
  }, [busqueda, tipoFiltro, formaFiltro, reporte]);

  const visible = useMemo(() => ({
    piezas: pedidos.reduce((s, p) => s + piezasPedido(p), 0),
    total: pedidos.reduce((s, p) => s + (p.facturacion.total ?? 0), 0),
  }), [pedidos]);

  const hayFiltro = busqueda.trim() !== '' || tipoFiltro !== 'all' || formaFiltro !== 'all';

  return (
    <div className="page">
      <PageHeader
        title="Facturas Safra"
        subtitle={origen === 'nube'
          ? `Acumulado en la nube · ultimo movimiento ${fechaCorta(reporte.fecha_reporte)}`
          : `Archivo del ${fechaCorta(reporte.fecha_reporte)} · ${reporte.empresa_proveedor}`}
        backTo="/"
      />

      <div className="safra-acciones">
        <button className="secondary" onClick={() => cargar(true)} disabled={cargando}>
          <ArrowPathIcon className="icon" /> {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
        <button className="secondary" onClick={() => inputArchivo.current?.click()}>
          <ArrowUpTrayIcon className="icon" /> Importar archivo
        </button>
        <input
          ref={inputArchivo} type="file" accept="application/json,.json" hidden
          onChange={e => {
            const archivo = e.target.files?.[0];
            e.target.value = ''; // permite volver a elegir el MISMO archivo
            if (archivo) importar(archivo);
          }}
        />
      </div>

      {aviso && <div className="safra-nota">{aviso}</div>}

      {/*
        Cambios de plata detectados: un pedido que ya estaba guardado volvio con
        otro precio o con otro numero de factura. Se guardo el nuevo, pero no en
        silencio — el archivo lo genera Gemini y puede leer distinto de un dia
        para el otro.
      */}
      {cambios.length > 0 && (
        <section className="safra-alerta safra-alerta-ambar">
          <div className="safra-alerta-cabeza">
            <ExclamationTriangleIcon className="icon" />
            <strong>{cambios.length} dato(s) cambiaron respecto de lo que ya estaba guardado</strong>
          </div>
          <p>Se guardo el valor nuevo. Revisa que sea el correcto y marcalo como visto.</p>
          <div className="safra-cambios">
            {cambios.map(c => (
              <div className="safra-cambio" key={c.id}>
                <div>
                  <strong>{c.pedido_id}</strong>
                  <span>{etiqueta(c.campo)}: {c.valor_anterior} → <b>{c.valor_nuevo}</b></span>
                </div>
                <button className="secondary" onClick={() => revisar(c)}>Visto</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {descuadres.length > 0 && (
        <section className="safra-alerta">
          <div className="safra-alerta-cabeza">
            <ExclamationTriangleIcon className="icon" />
            <strong>El resumen del archivo no cuadra con sus propias facturas</strong>
          </div>
          <p>
            Factura por factura los productos SI suman su subtotal, asi que el detalle esta bien
            y el resumen del archivo no. Lo que se guarda y se muestra es lo recalculado.
          </p>
          <div className="safra-desc-tabla">
            <div className="safra-desc-fila safra-desc-cabecera">
              <span>Concepto</span><span>Dice el archivo</span><span>Suma real</span>
            </div>
            {descuadres.map(d => {
              const esConteo = d.campo === 'Piezas' || d.campo === 'Pedidos';
              const fmt = (n: number) => (esConteo ? String(n) : pesos(n));
              return (
                <div className="safra-desc-fila" key={d.campo}>
                  <span>{d.campo}</span>
                  <span>{fmt(d.archivo)}</span>
                  <span>
                    <strong>{fmt(d.real)}</strong>
                    <em className="safra-dif">+{fmt(d.real - d.archivo)}</em>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="stats-row">
        <Kpi label="Facturas" valor={String(real.facturas)} tono="blue" />
        <Kpi label="Piezas" valor={String(real.piezas)} tono="amber" />
        <Kpi label="Metros²" valor={real.areaM2.toFixed(2)} tono="green" />
      </section>

      <section className="panel safra-totales">
        <div><span>Subtotal</span><strong>{pesos(real.subtotal)}</strong></div>
        <div><span>IVA</span><strong>{pesos(real.iva)}</strong></div>
        <div className="safra-total-grande">
          <span>Total facturado</span>
          <strong>{pesos(real.total)}</strong>
        </div>
      </section>

      <section className="panel">
        <h2 className="safra-h2">Por forma de pago</h2>
        <div className="safra-barras">
          {porFormaDePago(reporte.pedidos).map(f => (
            <div className="safra-barra" key={f.forma}>
              <div className="safra-barra-texto">
                <strong>{f.forma}</strong>
                <span>{f.cuantas} {f.cuantas === 1 ? 'factura' : 'facturas'} · {pesos(f.total)}</span>
              </div>
              <div className="safra-barra-riel">
                <div className="safra-barra-relleno" style={{ width: `${real.total ? (f.total / real.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="safra-h2">Por tipo de persiana</h2>
        <div className="safra-tipos">
          {porTipoDePersiana(reporte.pedidos).map(t => (
            <div className="safra-tipo" key={t.tipo}>
              <strong>{t.tipo}</strong>
              <span>{t.piezas} {t.piezas === 1 ? 'pieza' : 'piezas'} · {t.areaM2.toFixed(2)} m²</span>
              <em>{pesos(t.subtotal)}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="filters-panel">
        <div className="filters-search-row">
          <div className="search-wrap">
            <DocumentMagnifyingGlassIcon className="icon search-ic" />
            <input
              className="search-input" type="search"
              placeholder="Buscar factura, pedido, cliente, tela, ubicacion..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button type="button" className="search-clear" onClick={() => setBusqueda('')} aria-label="Limpiar">✕</button>
            )}
          </div>
        </div>
        <div className="filters-select-row">
          <div className="filter-group">
            <span className="filter-label">Tipo de persiana</span>
            <select className="filter-select wide" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
              <option value="all">Todos los tipos</option>
              {tipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Forma de pago</span>
            <select className="filter-select wide" value={formaFiltro} onChange={e => setFormaFiltro(e.target.value)}>
              <option value="all">Todas</option>
              {formas.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div className="section-title list-title">
        <div>
          <h2>Facturas</h2>
          <p className="muted">
            Mostrando {pedidos.length} de {reporte.pedidos.length}
            {hayFiltro && ` · ${visible.piezas} piezas · ${pesos(visible.total)}`}
          </p>
        </div>
      </div>

      <section className="list">
        {pedidos.map(pedido => (
          <TarjetaFactura
            key={pedido.pedido_id}
            pedido={pedido}
            abierta={abierto === pedido.pedido_id}
            alAbrir={() => setAbierto(abierto === pedido.pedido_id ? null : pedido.pedido_id)}
          />
        ))}
        {pedidos.length === 0 && (
          <div className="empty">Ninguna factura coincide con lo que buscaste.</div>
        )}
      </section>
    </div>
  );
}

function TarjetaFactura({ pedido, abierta, alAbrir }: { pedido: PedidoSafra; abierta: boolean; alAbrir: () => void }) {
  const f = pedido.facturacion;
  const piezas = piezasPedido(pedido);
  return (
    <article className={`project-card safra-factura ${abierta ? 'abierta' : ''}`}>
      <button className="project-open safra-cabecera" onClick={alAbrir}>
        <div className="safra-cabecera-fila">
          <div>
            <strong>{f.factura_numero || pedido.pedido_id}</strong>
            <span className="safra-ref">{pedido.referencia_personalizada}</span>
          </div>
          <div className="safra-cabecera-derecha">
            <strong className="safra-monto">{pesos(f.total)}</strong>
            <ChevronDownIcon className={`icon safra-chevron ${abierta ? 'girado' : ''}`} />
          </div>
        </div>
        <div className="card-meta">
          <span>{fechaCorta(f.fecha)}</span>
          {f.forma_pago && <span className="safra-pago">{f.forma_pago}</span>}
          <span>{pedido.pedido_id}</span>
          <span>{piezas} {piezas === 1 ? 'pieza' : 'piezas'}</span>
          <span>{areaPedido(pedido).toFixed(2)} m²</span>
        </div>
      </button>

      {abierta && (
        <div className="safra-detalle">
          <div className="safra-desglose">
            <span>Subtotal <strong>{pesos(f.subtotal)}</strong></span>
            <span>IVA <strong>{pesos(f.iva)}</strong></span>
            <span className="safra-desglose-total">Total <strong>{pesos(f.total)}</strong></span>
          </div>
          {pedido.productos.map(prod => <Pieza key={prod.item} producto={prod} />)}
        </div>
      )}
    </article>
  );
}

function Pieza({ producto }: { producto: ProductoSafra }) {
  const propios = camposPropios(producto);
  return (
    <div className="safra-pieza">
      <div className="safra-pieza-cabeza">
        <div>
          <span className="safra-item">Item {producto.item}</span>
          <strong>{producto.tipo}</strong>
          <span className="safra-tela">{producto.tela}</span>
        </div>
        <strong className="safra-precio">{pesos(producto.precio_final)}</strong>
      </div>

      <div className="safra-medidas">
        <div><span>Ancho</span><strong>{metros(producto.ancho_m)}</strong></div>
        <div><span>Alto</span><strong>{metros(producto.alto_m)}</strong></div>
        <div><span>Cantidad</span><strong>{producto.cantidad}</strong></div>
        <div><span>Area</span><strong>{areaPieza(producto).toFixed(2)} m²</strong></div>
      </div>

      {/* Solo los campos que ESTE tipo de persiana trae. Una Vertical muestra
          cantidad de lamas y pesa lama; una Enrollable Premium, cover light. */}
      <div className="safra-campos">
        <Campo etiqueta="Ubicacion" valor={producto.ubicacion} destacado />
        <Campo etiqueta="Mando" valor={producto.mando} />
        <Campo etiqueta="Coordinado" valor={producto.coordinado} />
        <Campo etiqueta="Encajonada" valor={producto.encajonada ? 'Si' : 'No'} />
        {propios.map(c => <Campo key={c.clave} etiqueta={etiqueta(c.clave)} valor={c.valor} />)}
      </div>
    </div>
  );
}

function Campo({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className={`safra-campo ${destacado ? 'destacado' : ''}`}>
      <span>{etiqueta}</span>
      <strong>{valor}</strong>
    </div>
  );
}

function Kpi({ label, valor, tono }: { label: string; valor: string; tono: 'blue' | 'amber' | 'green' }) {
  return (
    <div className={`stat stat-${tono}`}>
      <strong>{valor}</strong>
      <span>{label}</span>
    </div>
  );
}
