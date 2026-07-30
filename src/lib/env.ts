/**
 * LIMPIEZA DE VARIABLES DE ENTORNO
 *
 * No es cosmético: costó que no subiera **ni una sola foto**.
 *
 * Las tres variables de Supabase llegaban con un **BOM** (`U+FEFF`) pegado
 * adelante — la marca invisible que mete Windows/PowerShell cuando un `.env` se
 * guarda como "UTF-8 con BOM" (`>` y `Out-File` lo hacen por defecto). El valor
 * se veía perfecto en el panel de Vercel y en la consola.
 *
 * El detonante: `fetch` exige que los valores de los headers sean ISO-8859-1.
 * Con un carácter > U+00FF tira `TypeError: String contains non ISO-8859-1 code
 * point` y **la petición nunca sale a la red**. Encima el nombre del bucket
 * quedaba como "﻿evidencias", que no existe.
 *
 * Por eso las claves se limpian acá antes de usarse, en vez de confiar en cómo
 * quedaron pegadas: BOM, caracteres de ancho cero, espacios y comillas de más.
 *
 * Los invisibles van escritos con escapes a propósito: como caracteres
 * literales, cualquier editor o formateador podría "limpiarlos" y romper el
 * arreglo sin que se vea en la revisión.
 */
const INVISIBLES = /[﻿​-‍⁠]/g;

export function limpiarEnv(valor?: string): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpio = valor
    .replace(INVISIBLES, '')
    .trim()
    // Comillas envolventes, por si el valor se pegó con ellas.
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  return limpio || undefined;
}
