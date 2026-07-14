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
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', backgroundColor: '#f0fdfa', padding: 10, color: '#0f766e' },
  clientSection: { marginBottom: 20, padding: 10, backgroundColor: '#f9fafb', borderRadius: 4 },
  clientText: { marginBottom: 4 },
  table: { display: 'flex', width: 'auto', borderStyle: 'solid', borderWidth: 1, borderColor: '#e5e7eb', borderRightWidth: 0, borderBottomWidth: 0 },
  tableRow: { margin: 'auto', flexDirection: 'row' },
  tableColHeader: { borderStyle: 'solid', borderWidth: 1, borderColor: '#e5e7eb', borderLeftWidth: 0, borderTopWidth: 0, backgroundColor: '#f3f4f6' },
  tableCol: { borderStyle: 'solid', borderWidth: 1, borderColor: '#e5e7eb', borderLeftWidth: 0, borderTopWidth: 0 },
  tableCellHeader: { margin: 8, fontSize: 10, fontWeight: 'bold' },
  tableCell: { margin: 8, fontSize: 10 },
  totalsContainer: { marginTop: 20, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', width: '50%', marginBottom: 5 },
  totalText: { fontWeight: 'bold', fontSize: 12 },
  totalHighlight: { fontWeight: 'bold', fontSize: 14, color: '#0d9488', marginTop: 15, borderTop: '1px solid #e5e7eb', paddingTop: 5 },
  signatureSection: { marginTop: 60 },
  signatureLine: { width: 150, borderBottom: '1px solid black', marginBottom: 5 },
  signatureText: { fontSize: 10, color: '#4b5563' },
});

export interface ReceiptData {
  projectCode: string;
  clientName: string;
  clientNit: string;
  clientAddress: string;
  date: string;
  total: number;
  abono: number;
  saldo: number;
  discountPercent?: number;
  totalNeto?: number;
}

export const PaymentReceiptDocument = ({ data }: { data: ReceiptData }) => (
  <Document>
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
      
      <Text style={styles.title}>RECIBO DE CAJA N° {data.projectCode}</Text>
      
      <View style={styles.clientSection}>
        <Text style={{...styles.clientText, fontWeight: 'bold'}}>CLIENTE: {data.clientName}</Text>
        <Text style={styles.clientText}>CC/NIT: {data.clientNit}</Text>
        <Text style={styles.clientText}>Dirección: {data.clientAddress}</Text>
        <Text style={styles.clientText}>Fecha: {data.date}</Text>
      </View>

      <View style={styles.table}>
        <View style={styles.tableRow}>
          <View style={{...styles.tableColHeader, width: '70%'}}><Text style={styles.tableCellHeader}>Concepto</Text></View>
          <View style={{...styles.tableColHeader, width: '30%'}}><Text style={styles.tableCellHeader}>Valor Base</Text></View>
        </View>
        <View style={styles.tableRow}>
          <View style={{...styles.tableCol, width: '70%'}}><Text style={styles.tableCell}>Abono por concepto de suministro e instalación de persianas y cortinas (Proyecto {data.projectCode})</Text></View>
          <View style={{...styles.tableCol, width: '30%'}}><Text style={styles.tableCell}>${formatCurrency(data.total)}</Text></View>
        </View>
      </View>

      <View style={styles.totalsContainer}>
        {data.discountPercent ? (
          <>
            <View style={styles.totalRow}>
               <Text>Subtotal del Proyecto:</Text>
               <Text>${formatCurrency(data.total)}</Text>
            </View>
            <View style={styles.totalRow}>
               <Text>Descuento ({data.discountPercent}%):</Text>
               <Text>-${formatCurrency(data.total - (data.totalNeto || data.total))}</Text>
            </View>
            <View style={styles.totalRow}>
               <Text>Total a Pagar:</Text>
               <Text>${formatCurrency(data.totalNeto || data.total)}</Text>
            </View>
          </>
        ) : (
          <View style={styles.totalRow}>
             <Text>Total del Proyecto:</Text>
             <Text>${formatCurrency(data.total)}</Text>
          </View>
        )}
        <View style={styles.totalRow}>
           <Text>Abono Recibido:</Text>
           <Text>${formatCurrency(data.abono)}</Text>
        </View>
        <View style={{...styles.totalRow, ...styles.totalHighlight}}>
           <Text>SALDO PENDIENTE:</Text>
           <Text>${formatCurrency(data.saldo)}</Text>
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
