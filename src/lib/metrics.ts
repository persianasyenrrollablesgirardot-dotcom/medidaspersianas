import type { QuickQuote, TechnicalSolution, WindowGeometry } from '../types';

export function areaM2(width = 0, height = 0): number {
  return Math.max(width * height, 0);
}

export function quoteArea(quote?: QuickQuote): number {
  if (!quote) return 0;
  return quote.manualArea && quote.manualArea > 0 ? quote.manualArea : areaM2(quote.width, quote.height);
}

export function quoteTotal(quote?: QuickQuote): number {
  if (!quote) return 0;
  const base = quoteArea(quote) * (quote.pricePerM2 || 0) * (quote.quantity || 1);
  return Math.round(base);
}

export function solutionTotal(solution: TechnicalSolution): number {
  if (solution.itemType === 'maintenance' && solution.maintenance) {
    return solution.maintenance.tasks.filter(t => t.selected).reduce((sum, t) => sum + (t.price || 0), 0);
  }
  return quoteTotal(solution.quickQuote);
}

export function averageWidth(g: WindowGeometry): number {
  const values = [g.widthTop, g.widthMiddle, g.widthBottom].filter((v): v is number => typeof v === 'number' && v > 0);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function averageHeight(g: WindowGeometry): number {
  const values = [g.heightLeft, g.heightCenter, g.heightRight].filter((v): v is number => typeof v === 'number' && v > 0);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function solutionArea(solution: TechnicalSolution): number {
  if (solution.divisions.length) {
    const commonHeight = solution.quickQuote?.height || solution.assembly.fabricationHeight || 0;
    return solution.divisions.reduce((sum, part) => sum + areaM2(part.width, commonHeight || part.height), 0);
  }
  return areaM2(solution.quickQuote?.width || solution.assembly.fabricationWidth || 0, solution.quickQuote?.height || solution.assembly.fabricationHeight || 0);
}
