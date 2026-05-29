const fs = require('fs');
let code = fs.readFileSync('src/lib/facturador/gemini.ts', 'utf8');

const regex4 = /4\. OMITIR MEDIDAS: Bajo ninguna circunstancia debes incluir las medidas espec.ficas \(ancho, alto, ancho x alto\) en la descripci.n del .tem\. Al cliente final solo se le factura por metros cuadrados totales o unidades, nunca se le desglosan las medidas t.cnicas\. Si ves medidas como "1\.20 x 1\.50", ign.ralas por completo de la descripci.n\./g;
const rule5PDF = '4. OMITIR MEDIDAS: Bajo ninguna circunstancia debes incluir las medidas específicas (ancho, alto, ancho x alto) en la descripción del ítem. Al cliente final solo se le factura por metros cuadrados totales o unidades, nunca se le desglosan las medidas técnicas. Si ves medidas como "1.20 x 1.50", ignóralas por completo de la descripción.\n        5. MANTENIMIENTOS: Si hay tablas o secciones de "Mantenimiento", extráelas como ítems adicionales. Agrupa todos los servicios de una ventana en la descripción. La cantidad (quantity) para mantenimientos suele ser 1.';

code = code.replace(regex4, rule5PDF);

const regex5 = /5\. OMITIR MEDIDAS: Bajo ninguna circunstancia debes incluir las medidas espec.ficas \(ancho, alto, ancho x alto\) en la descripci.n del .tem\. Al cliente final solo se le factura por metros cuadrados totales o unidades, nunca se le desglosan las medidas de fabricaci.n\. Ignora cualquier medida espec.fica en el texto y deja solo el .rea total\./g;
const rule6Text = '5. OMITIR MEDIDAS: Bajo ninguna circunstancia debes incluir las medidas específicas (ancho, alto, ancho x alto) en la descripción del ítem. Al cliente final solo se le factura por metros cuadrados totales o unidades, nunca se le desglosan las medidas de fabricación. Ignora cualquier medida específica en el texto y deja solo el área total.\n        6. MANTENIMIENTOS: Si hay secciones de "Mantenimiento", extráelas como ítems adicionales. Agrupa todos los servicios de una ventana en la descripción. La cantidad (quantity) para mantenimientos suele ser 1.';

code = code.replace(regex5, rule6Text);

fs.writeFileSync('src/lib/facturador/gemini.ts', code);
