import Anthropic from '@anthropic-ai/sdk';
import { limpiarEnv } from '../env';

// Modelo actual de la familia Haiku: rápido, económico y — a diferencia del viejo
// claude-3-haiku-20240307 — SÍ soporta lectura de PDF e imágenes. El modelo anterior
// no aceptaba documentos PDF (fallaba al subir un archivo) y además se depreca en 2026.
const MODEL = 'claude-haiku-4-5';

function getClaude() {
  // La clave viaja en un header (`x-api-key`): si trae un BOM o un espacio
  // pegado al copiarla, `fetch` aborta antes de salir a la red. Ver `env.ts`.
  const customKey = limpiarEnv(localStorage.getItem('CUSTOM_CLAUDE_API_KEY') ?? undefined);
  const apiKey = customKey || limpiarEnv(import.meta.env.VITE_CLAUDE_API_KEY as string | undefined);
  if (!apiKey) {
    throw new Error("No hay una API Key de Claude configurada. Ve a Ajustes → Inteligencia Artificial (Claude) y pega tu clave (empieza con sk-ant-...).");
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

/**
 * Extrae el texto de la respuesta de Claude. La respuesta puede contener varios
 * bloques (por ejemplo si el modelo razona); concatenamos todos los de tipo texto.
 */
function extractText(response: Anthropic.Message): string {
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  if (!text) {
    throw new Error('La IA no devolvió texto legible. Intenta de nuevo.');
  }
  return text;
}

/**
 * Parsea el JSON de la respuesta de forma tolerante: limpia el markdown y, si el
 * modelo agregó texto alrededor, extrae el primer objeto {...} completo.
 */
function parseJson(raw: string): any {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Rescate: tomar desde la primera { hasta la última }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('La IA no devolvió un JSON válido. Revisa el documento e intenta de nuevo.');
  }
}

/**
 * Traduce los errores de la API de Anthropic a mensajes claros en español.
 */
function friendlyError(error: any): Error {
  // Errores tipados del SDK
  if (error instanceof Anthropic.AuthenticationError) {
    return new Error('La API Key de Claude no es válida o expiró. Ve a Ajustes y pega una clave nueva de console.anthropic.com.');
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new Error('Tu cuenta de Claude no tiene permiso o saldo para este modelo. Revisa tu plan/saldo en console.anthropic.com.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new Error('Demasiadas solicitudes seguidas a la IA. Espera unos segundos e intenta de nuevo.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new Error('El documento no se pudo procesar (formato o tamaño). Verifica que el PDF no supere ~30 MB. Detalle: ' + (error.message || ''));
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new Error('No hay conexión con el servicio de IA. Revisa tu internet e intenta de nuevo.');
  }
  if (error instanceof Anthropic.APIError) {
    return new Error(`Error de la IA (${(error as any).status ?? 's/n'}): ${error.message}`);
  }
  return new Error(error?.message || 'No se pudo procesar el documento con la IA.');
}

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
      model: MODEL,
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

    return parseJson(extractText(response));
  } catch (error: any) {
    console.error("Error extracting data via Claude:", error);
    throw friendlyError(error);
  }
}

export async function extractInvoiceDataFromText(text: string): Promise<any> {
  try {
    const claude = getClaude();

    const response = await claude.messages.create({
      model: MODEL,
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

    return parseJson(extractText(response));
  } catch (error: any) {
    console.error("Error extracting data via Claude:", error);
    throw friendlyError(error);
  }
}
