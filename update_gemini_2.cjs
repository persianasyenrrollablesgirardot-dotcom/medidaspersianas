const fs = require('fs');
let code = fs.readFileSync('src/lib/facturador/gemini.ts', 'utf8');

// For PDF
const oldRule5 = '5. MANTENIMIENTOS: Si hay tablas o secciones de "Mantenimiento", extráelas como ítems adicionales. Agrupa todos los servicios de una ventana en la descripción. La cantidad (quantity) para mantenimientos suele ser 1.';
const newRule5 = '5. MANTENIMIENTOS: CRITICO Y OBLIGATORIO. Si en el PDF ves palabras como "Mantenimiento", "Servicios", "Lavado", "Cambio", DEBES registrar cada mantenimiento como un item en el JSON final. El precio de estos mantenimientos DEBE ser sumado al "total" de la factura.';

code = code.replace(oldRule5, newRule5);

// For text
const oldRule6 = '6. MANTENIMIENTOS: Si hay secciones de "Mantenimiento", extráelas como ítems adicionales. Agrupa todos los servicios de una ventana en la descripción. La cantidad (quantity) para mantenimientos suele ser 1.';
const newRule6 = '6. MANTENIMIENTOS: CRITICO Y OBLIGATORIO. Si en el texto ves "Mantenimiento" o tareas, DEBES extraerlas como items válidos y SUMAR sus precios al "total" final. No los omitas bajo ninguna circunstancia.';

code = code.replace(oldRule6, newRule6);

fs.writeFileSync('src/lib/facturador/gemini.ts', code);
