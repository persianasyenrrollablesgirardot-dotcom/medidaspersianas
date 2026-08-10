import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const formatCurrency = (amount: number | string) => {
  return new Intl.NumberFormat('es-CO').format(Number(amount));
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica', color: '#1f2937' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottom: '2px solid #0d9488', paddingBottom: 15 },
  headerLeft: { flex: 1, flexDirection: 'column', paddingRight: 10 },
  headerRight: { flex: 1, textAlign: 'right', fontSize: 9, color: '#4b5563', lineHeight: 1.4 },
  logo: { width: 250, height: 100, objectFit: 'contain', marginBottom: 10 },
  companyTitle: { fontSize: 14, fontWeight: 'bold', color: '#0d9488', flexWrap: 'wrap' },
  companySubtitle: { fontSize: 12, color: '#4b5563', marginTop: 2 },
  companyInfo: { textAlign: 'right', fontSize: 9, color: '#4b5563', lineHeight: 1.4 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', backgroundColor: '#f0fdfa', padding: 10, color: '#0f766e' },
  clientSection: { marginBottom: 20, padding: 10, backgroundColor: '#f9fafb', borderRadius: 4 },
  clientText: { marginBottom: 4 },
  table: { display: 'flex', width: 'auto', borderStyle: 'solid', borderWidth: 1, borderColor: '#e5e7eb', borderRightWidth: 0, borderBottomWidth: 0 },
  tableRow: { margin: 'auto', flexDirection: 'row' },
  tableColHeader: { borderStyle: 'solid', borderWidth: 1, borderColor: '#e5e7eb', borderLeftWidth: 0, borderTopWidth: 0, backgroundColor: '#f3f4f6' },
  tableCol: { borderStyle: 'solid', borderWidth: 1, borderColor: '#e5e7eb', borderLeftWidth: 0, borderTopWidth: 0 },
  tableCellHeader: { margin: 8, fontSize: 10, fontWeight: 'bold' },
  tableCell: { margin: 8, fontSize: 10 },
  // Fila de encabezado de ESPACIO (Sala, Habitacion...). Agrupa los items de abajo.
  spaceRow: { flexDirection: 'row', backgroundColor: '#f0fdfa' },
  spaceCol: { borderStyle: 'solid', borderWidth: 1, borderColor: '#e5e7eb', borderLeftWidth: 0, borderTopWidth: 0, width: '100%', borderLeft: '3px solid #0d9488' },
  spaceCell: { margin: 8, marginTop: 6, marginBottom: 6, fontSize: 10, fontWeight: 'bold', color: '#0f766e', textTransform: 'uppercase' },
  windowLabel: { fontSize: 8, color: '#6b7280', marginBottom: 2 },
  totalsContainer: { marginTop: 20, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', width: '40%', marginBottom: 5 },
  totalText: { fontWeight: 'bold', fontSize: 12 },
  signatureSection: { marginTop: 60 },
  signatureLine: { width: 150, borderBottom: '1px solid black', marginBottom: 5 },
  signatureText: { fontSize: 10, color: '#4b5563' },
  
  // Estilos de Condiciones
  conditionsPage: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#374151' },
  conditionsHeader: { backgroundColor: '#0d9488', color: 'white', padding: 15, textAlign: 'center', fontSize: 16, fontWeight: 'bold', marginBottom: 20 },
  conditionsSectionTitle: { backgroundColor: '#0d9488', color: 'white', padding: 8, fontSize: 12, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
  conditionsText: { marginBottom: 10, lineHeight: 1.5 },
  bulletPoint: { flexDirection: 'row', marginBottom: 5, paddingLeft: 10 },
  bullet: { width: 10 },
});

/**
 * Agrupa los items por ESPACIO conservando el orden de aparicion (Map mantiene el
 * orden de insercion), asi los items del mismo ambiente quedan juntos aunque la IA
 * los haya devuelto intercalados.
 *
 * Documentos viejos de la bitacora (guardados antes de que la IA extrajera la
 * ubicacion) no traen `space`: en ese caso todos caen en el grupo "" y la tabla se
 * dibuja plana, exactamente como antes.
 */
const groupItemsBySpace = (items: any[]): Array<[string, any[]]> => {
  const groups = new Map<string, any[]>();
  for (const item of items || []) {
    const space = String(item?.space ?? '').trim();
    const bucket = groups.get(space);
    if (bucket) bucket.push(item);
    else groups.set(space, [item]);
  }
  return Array.from(groups.entries());
};

export const RigidDocument = ({ data }: { data: any }) => (
  <Document>
    {/* PÁGINA 1: FACTURA / COTIZACIÓN */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
         <View style={styles.headerLeft}>
            <Image src={window.location.origin + "/extracted_p0_i1.png"} style={styles.logo} />
            <Text style={styles.companyTitle}>FÁBRICA DE CORTINAS GIRARDOT</Text>
         </View>
         <View style={styles.headerRight}>
            <Text style={{fontWeight: 'bold'}}>NIT: 1014208880-1</Text>
            <Text>Girardot: KR 5 N° 35-186 (Frente a Homecenter)</Text>
            <Text>Melgar: KR 51 N° 3-165</Text>
            <Text>Tel: 3202381865 / 3223663825</Text>
         </View>
      </View>
      <Text style={styles.title}>{data.type === 'FACTURA' ? `FACTURA DE VENTA N° ${data.documentNumber}` : `COTIZACIÓN COMERCIAL N° ${data.documentNumber}`}</Text>
      
      <View style={styles.clientSection}>
        <Text style={{...styles.clientText, fontWeight: 'bold'}}>CLIENTE: {data.clientName}</Text>
        <Text style={styles.clientText}>CC/NIT: {data.clientNit}</Text>
        <Text style={styles.clientText}>Dirección: {data.clientAddress}</Text>
        <Text style={styles.clientText}>Fecha: {data.date}</Text>
      </View>

      <View style={styles.table}>
        <View style={styles.tableRow}>
          <View style={{...styles.tableColHeader, width: '60%'}}><Text style={styles.tableCellHeader}>Descripción</Text></View>
          <View style={{...styles.tableColHeader, width: '20%'}}><Text style={styles.tableCellHeader}>Cant. (m²)</Text></View>
          <View style={{...styles.tableColHeader, width: '20%'}}><Text style={styles.tableCellHeader}>Total</Text></View>
        </View>
        {groupItemsBySpace(data.items).map(([space, items], g: number) => (
          <View key={g}>
            {space ? (
              <View style={styles.spaceRow}>
                <View style={styles.spaceCol}><Text style={styles.spaceCell}>{space}</Text></View>
              </View>
            ) : null}
            {items.map((item: any, i: number) => (
              <View style={styles.tableRow} key={i} wrap={false}>
                <View style={{...styles.tableCol, width: '60%'}}>
                  <View style={styles.tableCell}>
                    {item.window ? <Text style={styles.windowLabel}>{item.window}</Text> : null}
                    <Text style={{ fontSize: 10 }}>{item.description}</Text>
                  </View>
                </View>
                <View style={{...styles.tableCol, width: '20%'}}><Text style={styles.tableCell}>{item.quantity}</Text></View>
                <View style={{...styles.tableCol, width: '20%'}}><Text style={styles.tableCell}>${formatCurrency(item.total)}</Text></View>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.totalsContainer}>
        <View style={styles.totalRow}>
           <Text>Subtotal:</Text>
           <Text>${formatCurrency(data.subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
           <Text>Impuestos (IVA 0%):</Text>
           <Text>$0</Text>
        </View>
        {data.discount && data.discount > 0 ? (
          <View style={{...styles.totalRow, color: '#ef4444'}}>
             <Text>Descuento:</Text>
             <Text>-${formatCurrency(data.discount)}</Text>
          </View>
        ) : null}
        <View style={{...styles.totalRow, marginTop: 10}}>
           <Text style={styles.totalText}>TOTAL:</Text>
           <Text style={styles.totalText}>${formatCurrency(data.total)}</Text>
        </View>
      </View>

      <View style={styles.signatureSection}>
         <Image src={window.location.origin + "/extracted_p0_i2.png"} style={{ width: 200, height: 80, objectFit: 'contain', marginBottom: 5 }} />
         <View style={styles.signatureLine}></View>
         <Text style={{...styles.signatureText, fontWeight: 'bold', marginTop: 5}}>Jhon Cubides</Text>
         <Text style={styles.signatureText}>Firma Autorizada</Text>
         <Text style={styles.signatureText}>admin@persianasgirardot.com</Text>
      </View>
    </Page>

  </Document>
);
