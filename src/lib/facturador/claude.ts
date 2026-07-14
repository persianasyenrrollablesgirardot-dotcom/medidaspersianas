import Anthropic from '@anthropic-ai/sdk';

function getClaude() {
  const customKey = localStorage.getItem('CUSTOM_CLAUDE_API_KEY');
  const apiKey = customKey || import.meta.env.VITE_CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("No hay una API Key configurada. Ve a Ajustes y añade tu Claude API Key.");
  }
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true, // Requerido porque estamos ejecutando desde el cliente (navegador)
  });
}

const SYSTEM_PROMPT = `
Eres un experto analista contable. Extrae la información de la factura o cotización y devuélvela ESTRICTAMENTE como un objeto JSON válido.
No incluyas formato markdown como \`\`\`json. Devuelve SOLO el texto JSON crudo.

REGLAS CRÍTICAS:
1. Para la "quantity" (cantidad): Ten MUCHO CUIDADO. A veces está en metros cuadrados (m2), metros (m) o unidades. Asegúrate de extraer el número exacto correspondiente a la cantidad o área.
2. Descuentos: Revisa minuciosamente si hay algún descuento aplicado al subtotal o a los ítems. Si hay un descuento total, ponlo en la propiedad "discount". Si no hay, pon 0.
3. Descripciones Largas: Extrae TODO el bloque de texto descriptivo completo y concaténalo en el campo "description" usando saltos de línea (\n).
4. OMITIR MEDIDAS: Bajo ninguna circunstancia debes incluir las medidas específicas (ancho, alto, ancho x alto) en la descripción del ítem. Al cliente final solo se le factura por metros cuadrados totales o unidades. Ignora cualquier medida técnica específica.
5. EXTRACCIÓN LITERAL DE TOTALES: NO INVENTES NI CALCULES VALORES. Extrae el subtotal, impuestos, descuentos y el TOTAL FINAL exactamente como aparecen impresos en el documento. Si el documento tiene un gran total impreso, úsalo sin alterarlo, sin importar si la suma matemática de los ítems parece diferir. JAMÁS sumes o multipliques por tu cuenta; tu tarea es leer y extraer, no calcular.
6. MANTENIMIENTOS: CRITICO Y OBLIGATORIO. Si ves palabras como "Mantenimiento", "Servicios", "Lavado", "Cambio", DEBES registrar cada uno como un item en el JSON final. Su precio DEBE ser extraído de la tabla.

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
      "quantity": "string or number",
      "total": "number" (Sin símbolos de moneda)
    }
  ],
  "subtotal": "number",
  "tax": "number",
  "discount": "number",
  "total": "number"
}
`;

export async function extractInvoiceData(file: File): Promise<any> {
  try {
    const claude = getClaude();

    // Convert file to base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });

    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Data,
              }
            },
            {
              type: 'text',
              text: 'Extrae los datos de este PDF siguiendo la estructura JSON solicitada.'
            }
          ],
        },
      ],
    });

    // Handle response content
    const contentBlock = response.content[0];
    let textResponse = '';
    
    if (contentBlock.type === 'text') {
      textResponse = contentBlock.text;
    } else {
      throw new Error("Respuesta inesperada de Claude API.");
    }

    // Clean potential markdown from response just in case
    const cleanedText = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanedText);
  } catch (error: any) {
    console.error("Error extracting data via Claude:", error);
    throw new Error(error.message || "No se pudo extraer la información del PDF usando Claude.");
  }
}

export async function extractInvoiceDataFromText(text: string): Promise<any> {
  try {
    const claude = getClaude();

    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extrae la información de esta factura o cotización de texto no estructurado:\n\n${text}`
            }
          ],
        },
      ],
    });

    const contentBlock = response.content[0];
    let textResponse = '';
    
    if (contentBlock.type === 'text') {
      textResponse = contentBlock.text;
    } else {
      throw new Error("Respuesta inesperada de Claude API.");
    }

    const cleanedText = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanedText);
  } catch (error: any) {
    console.error("Error extracting data via Claude:", error);
    throw new Error(error.message || "No se pudo extraer la información del texto usando Claude.");
  }
}
