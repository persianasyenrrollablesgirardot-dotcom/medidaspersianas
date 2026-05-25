import type { TechnicalAlert, TechnicalSolution, WindowRecord } from '../types';

export function evaluateSolution(window: WindowRecord, solution: TechnicalSolution): TechnicalAlert[] {
  const alerts: TechnicalAlert[] = [];
  const width = solution.quickQuote?.width || solution.assembly.fabricationWidth || 0;
  const height = solution.quickQuote?.height || solution.assembly.fabricationHeight || 0;

  if (solution.status !== 'quick' && (!width || !height)) {
    alerts.push({ id: 'missing-fabrication-size', level: 'blocker', message: 'Faltan medidas finales de fabricacion.' });
  }

  if (solution.layer === 'inside' && !window.geometry.depth) {
    alerts.push({ id: 'missing-depth', level: 'warning', message: 'Instalacion interna sin profundidad de vano registrada.' });
  }

  if (solution.drive === 'motor') {
    if (!solution.motor || solution.motor.powerPoint !== 'available') {
      alerts.push({ id: 'motor-power', level: 'blocker', message: 'Motor sin punto electrico confirmado.' });
    }
    if (solution.motor?.groundPole !== 'yes') {
      alerts.push({ id: 'motor-ground', level: 'warning', message: 'Validar polo a tierra o condicion electrica antes de fabricar.' });
    }
  }

  if (solution.divisions.length > 0) {
    const sum = solution.divisions.reduce((acc, part) => acc + (Number(part.width) || 0), 0);
    if (!width) {
      alerts.push({ id: 'division-base-width', level: 'warning', message: 'Hay divisiones registradas pero falta el ancho principal para validar la suma.' });
    }
    if (!height) {
      alerts.push({ id: 'division-common-height', level: 'warning', message: 'Hay divisiones registradas pero falta el alto unico principal.' });
    }
    if (width && Math.abs(sum - width) > 0.02) {
      alerts.push({ id: 'division-sum', level: 'warning', message: `La suma de divisiones (${sum.toFixed(2)} m) no coincide con el ancho (${width.toFixed(2)} m).` });
    }
  }

  if (solution.planTemplate?.centralDivisions && solution.divisions.length === 0) {
    alerts.push({
      id: 'plan-central-divisions',
      level: 'info',
      message: `${solution.planTemplate.label} sugiere dividir el tramo central en ${solution.planTemplate.centralDivisions} partes.`,
    });
  }

  if (solution.system.toLowerCase().includes('enrollable') && width > 0 && height > 0 && width > height * 3) {
    alerts.push({ id: 'wide-rollup-ratio', level: 'warning', message: 'Enrollable con ancho mayor a 3 veces el alto; requiere validacion tecnica.' });
  }

  if (window.siteConditions.some(c => c.severity === 'high')) {
    alerts.push({ id: 'site-risk', level: 'warning', message: 'La ventana tiene condiciones de sitio de alto riesgo.' });
  }

  return alerts;
}
