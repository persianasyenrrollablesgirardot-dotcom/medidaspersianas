import { useMemo, useState } from 'react';
import { ChevronDownIcon, DocumentMagnifyingGlassIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '../components/PageHeader';
import reporteDeHoy from '../lib/safra/reporte-2026-09-07.json';
import type { PedidoSafra, ProductoSafra, ReporteSafra } from '../lib/safra/tipos';
import {
  areaPedido, areaPieza, calcularResumen, camposPropios, etiqueta, fechaCorta,
  formasDePago, metros, normalizar, pesos, piezasPedido, porFormaDePago,
  porTipoDePersiana, tiposDePersiana,
} from '../lib/safra/campos';

/**
 * MAQUETA con los datos REALES del reporte del 2026-09-07.
 *
 * Todavia NO hay importador: el JSON esta incrustado para que Jhon pueda ver
 * y corregir la pantalla antes de que se construya el mecanismo que lo trae
 * de Google Drive. Cuando el importador exista, lo unico que cambia es de
 * donde sale `reporte` — el resto de la pantalla queda igual.
 */
const reporte = reporteDeHoy as unknown as ReporteSafra;

export function FacturasSafra() {
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('all');
  const [formaFiltro, setFormaFiltro] = useState('all');
  const [abierto, setAbierto] = useState<string | null>(null);

  const { real, declarado, descuadres } = useMemo(() => calcularResumen(reporte), []);
  const tipos = useMemo(() => tiposDePersiana(reporte.pedidos), []);
  const formas = useMemo(() => formasDePago(reporte.pedidos), []);

  const pedidos = useMemo(() => {
    let lista = reporte.pedidos;

    if (formaFiltro !== 'all') lista = lista.filter(p => p.facturacion.forma_pago === formaFiltro);
    if (tipoFiltro !== 'all') lista = lista.filter(p => p.productos.some(pr => pr.tipo === tipoFiltro));

    const tokens = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (tokens.length) {
      lista = lista.filter(p => {
        const campos = [
          p.pedido_id, p.referencia_personalizada, p.facturacion.factura_numero,
          p.facturacion.forma_pago,
          ...p.productos.flatMap(pr => [pr.tipo, pr.tela, pr.ubicacion, pr.coordinado]),
        ];
        const texto = normalizar(campos.filter(Boolean).join(' '));
        return tokens.every(t => texto.includes(t));
      });
    }

    // Lo mas reciente primero; a igual fecha, la factura mas grande arriba.
    return [...lista].sort((a, b) =>
      b.facturacion.fecha.localeCompare(a.facturacion.fecha) || b.facturacion.total - a.facturacion.total);
  }, [busqueda, tipoFiltro, formaFiltro]);

  const visible = useMemo(() => ({
    piezas: pedidos.reduce((s, p) => s + piezasPedido(p), 0),
    total: pedidos.reduce((s, p) => s + p.facturacion.total, 0),
    areaM2: pedidos.reduce((s, p) => s + areaPedido(p), 0),
  }), [pedidos]);

  const hayFiltro = busqueda.trim() !== '' || tipoFiltro !== 'all' || formaFiltro !== 'all';

  return (
    <div className="page">
      <PageHeader
        title="Facturas Safra"
        subtitle={`Reporte del ${fechaCorta(reporte.fecha_reporte)} · ${reporte.empresa_proveedor}`}
        backTo="/"
      />

      {/*
        El resumen del archivo puede venir mal (el del 07-sep declaraba $10.000
        menos de subtotal que la suma de sus propias facturas). Se avisa, no se
        tapa: es plata. Los numeros de arriba son SIEMPRE los recalculados.
      */}
      {descuadres.length > 0 && (
        <section className="safra-alerta">
          <div className="safra-alerta-cabeza">
            <ExclamationTriangleIcon className="icon" />
            <strong>El resumen del archivo no cuadra con sus propias facturas</strong>
          </div>
          <p>
            Sumando las {real.facturas} facturas una por una da otra cosa. Factura por factura
            los productos SI suman su subtotal, asi que el detalle esta bien y el resumen no.
            Abajo se muestra lo recalculado.
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
        <div>
          <span>Subtotal</span>
          <strong>{pesos(real.subtotal)}</strong>
        </div>
        <div>
          <span>IVA</span>
          <strong>{pesos(real.iva)}</strong>
        </div>
        <div className="safra-total-grande">
          <span>Total facturado</span>
          <strong>{pesos(real.total)}</strong>
        </div>
        {declarado && descuadres.length === 0 && (
          <p className="safra-ok">✓ Cuadra con el resumen del archivo.</p>
        )}
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
                <div className="safra-barra-relleno" style={{ width: `${(f.total / real.total) * 100}%` }} />
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
              className="search-input"
              type="search"
              placeholder="Buscar factura, pedido, cliente, tela, ubicacion..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
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
            key={pedido.facturacion.factura_numero + pedido.pedido_id}
            pedido={pedido}
            abierta={abierto === pedido.pedido_id}
            alAbrir={() => setAbierto(abierto === pedido.pedido_id ? null : pedido.pedido_id)}
          />
        ))}
        {pedidos.length === 0 && (
          <div className="empty">Ninguna factura coincide con lo que buscaste.</div>
        )}
      </section>

      <p className="muted safra-pie">
        Maqueta con los datos reales del archivo <code>reporte_safra_{reporte.fecha_reporte}.json</code>,
        generado el {new Date(reporte.generado_en).toLocaleString('es-CO')}. Todavia se carga incrustado:
        falta decidir como entra el archivo de Google Drive cada dia.
      </p>
    </div>
  );
}

function TarjetaFactura({ pedido, abierta, alAbrir }: { pedido: PedidoSafra; abierta: boolean; alAbrir: () => void }) {
  const f = pedido.facturacion;
  return (
    <article className={`project-card safra-factura ${abierta ? 'abierta' : ''}`}>
      <button className="project-open safra-cabecera" onClick={alAbrir}>
        <div className="safra-cabecera-fila">
          <div>
            <strong>{f.factura_numero}</strong>
            <span className="safra-ref">{pedido.referencia_personalizada}</span>
          </div>
          <div className="safra-cabecera-derecha">
            <strong className="safra-monto">{pesos(f.total)}</strong>
            <ChevronDownIcon className={`icon safra-chevron ${abierta ? 'girado' : ''}`} />
          </div>
        </div>
        <div className="card-meta">
          <span>{fechaCorta(f.fecha)}</span>
          <span className="safra-pago">{f.forma_pago}</span>
          <span>{pedido.pedido_id}</span>
          <span>{piezasPedido(pedido)} {piezasPedido(pedido) === 1 ? 'pieza' : 'piezas'}</span>
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
