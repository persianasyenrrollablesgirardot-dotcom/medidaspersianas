import { pdf } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { RigidDocument } from '../../components/facturador/RigidDocument';

export async function generateFinalInvoiceUrl(data: any): Promise<string> {
  // 1. Generate the single page invoice using react-pdf
  const blob = await pdf(<RigidDocument data={data} />).toBlob();
  const invoiceBytes = await blob.arrayBuffer();

  // 2. Fetch the beautifully designed original conditions
  const conditionsRes = await fetch('/condiciones.pdf');
  const conditionsBytes = await conditionsRes.arrayBuffer();

  // 3. Merge them using pdf-lib
  const invoiceDoc = await PDFDocument.load(invoiceBytes);
  const conditionsDoc = await PDFDocument.load(conditionsBytes);

  const copiedPages = await invoiceDoc.copyPages(conditionsDoc, conditionsDoc.getPageIndices());
  
  copiedPages.forEach((page: any) => {
    invoiceDoc.addPage(page);
  });

  const finalPdfBytes = await invoiceDoc.save();
  // @ts-ignore
  const finalBlob = new Blob([finalPdfBytes], { type: 'application/pdf' });
  
  return URL.createObjectURL(finalBlob);
}
