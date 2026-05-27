import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

export async function extractInvoiceData(file: File): Promise<any> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    // Convert file to base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });

    const prompt = `
      Eres un experto analista contable. Extrae la información de la factura o cotización de este PDF y devuélvela ESTRICTAMENTE como un objeto JSON válido.
      No incluyas formato markdown como \`\`\`json. Devuelve SOLO el texto JSON crudo.
      
      REGLAS CRÍTICAS:
      1. Para la "quantity" (cantidad): Ten MUCHO CUIDADO. A veces está en metros cuadrados (m2), metros (m) o unidades. Asegúrate de extraer el número exacto correspondiente a la cantidad o área. Revisa bien las columnas del PDF.
      2. Descuentos: Revisa minuciosamente si hay algún descuento aplicado al subtotal o a los ítems. Si hay un descuento total, ponlo en la propiedad "discount". Si no hay, pon 0.
      3. Descripciones Largas: Muchas facturas tienen descripciones que abarcan múltiples párrafos o viñetas debajo del título principal del ítem. DEBES extraer TODO el bloque de texto descriptivo completo y concatenarlo en el campo "description" usando saltos de línea (\n).
      4. OMITIR MEDIDAS: Bajo ninguna circunstancia debes incluir las medidas específicas (ancho, alto, ancho x alto) en la descripción del ítem. Al cliente final solo se le factura por metros cuadrados totales o unidades, nunca se le desglosan las medidas técnicas. Si ves medidas como "1.20 x 1.50", ignóralas por completo de la descripción.
      
      Estructura obligatoria:
      {
        "type": "INVOICE" | "QUOTE", (INVOICE si es Factura, QUOTE si es Cotizacion)
        "documentNumber": "string",
        "clientName": "string",
        "clientNit": "string",
        "clientAddress": "string",
        "date": "string", (Formato YYYY-MM-DD)
        "items": [
          {
            "description": "string",
            "quantity": "string or number", (Ej: "5.75" o "2")
            "total": "number" (Sin símbolos de moneda)
          }
        ],
        "subtotal": "number",
        "tax": "number",
        "discount": "number", (Suma de descuentos aplicados. 0 si no hay)
        "total": "number" (Total final a pagar)
      }
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: "application/pdf"
        }
      }
    ]);

    const textResponse = result.response.text();
    // Clean potential markdown from response just in case
    const cleanedText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Error extracting data via Gemini:", error);
    throw new Error("No se pudo extraer la información del PDF.");
  }
}

export async function extractInvoiceDataFromText(text: string): Promise<any> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
      Eres un experto analista contable. Extrae la información de la factura o cotización de este texto no estructurado y devuélvela ESTRICTAMENTE como un objeto JSON válido.
      No incluyas formato markdown como \`\`\`json. Devuelve SOLO el texto JSON crudo.
      
      REGLAS CRÍTICAS:
      1. Para la "quantity" (cantidad): Ten MUCHO CUIDADO. A veces está en metros cuadrados (m2), metros (m) o unidades. Asegúrate de extraer el número exacto correspondiente a la cantidad o área.
      2. Descuentos: Revisa minuciosamente si hay algún descuento aplicado al subtotal o a los ítems. Si hay un descuento total, ponlo en la propiedad "discount". Si no hay, pon 0.
      3. Descripciones Largas: Muchas veces el texto tiene descripciones que abarcan múltiples párrafos o viñetas. DEBES extraer TODO el bloque de texto descriptivo completo y concatenarlo en el campo "description".
      4. Tolerancia al desorden: El texto puede estar muy desordenado. Tu trabajo es identificar al cliente, los ítems y calcular el total.
      5. OMITIR MEDIDAS: Bajo ninguna circunstancia debes incluir las medidas específicas (ancho, alto, ancho x alto) en la descripción del ítem. Al cliente final solo se le factura por metros cuadrados totales o unidades, nunca se le desglosan las medidas de fabricación. Ignora cualquier medida específica en el texto y deja solo el área total.
      
      Estructura obligatoria:
      {
        "type": "INVOICE" | "QUOTE",
        "documentNumber": "string",
        "clientName": "string",
        "clientNit": "string",
        "clientAddress": "string",
        "date": "string",
        "items": [
          {
            "description": "string",
            "quantity": "string or number",
            "total": "number"
          }
        ],
        "subtotal": "number",
        "tax": "number",
        "discount": "number",
        "total": "number"
      }
      
      TEXTO A ANALIZAR:
      ${text}
    `;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text();
    const cleanedText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Error extracting data from text via Gemini:", error);
    throw new Error("No se pudo extraer la información del texto.");
  }
}

