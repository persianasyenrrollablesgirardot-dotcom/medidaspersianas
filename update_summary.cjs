const fs = require('fs');
let code = fs.readFileSync('src/lib/exporters.ts', 'utf8');

const regex = /for \(const sol of win\.solutions\) \{[\s\S]*?if \(sol\.alerts\.length\) lines\.push\(`    Alertas: \$\{sol\.alerts\.map\(a => a\.message\)\.join\(' \| '\)\}`\);\n        \}/;

const newLoop = `        const validSolutions = win.solutions.filter(s => s.itemType === 'maintenance' ? s.maintenance?.tasks.some(t => t.selected) : (s.quickQuote ? quoteTotal(s.quickQuote) > 0 : solutionTotal(s) > 0));
        for (const sol of validSolutions) {
          if (sol.itemType === 'maintenance') {
            const tasksText = sol.maintenance?.tasks.filter(t => t.selected).map(t => t.label).join(', ') || 'Ninguno';
            lines.push(\`  > Mantenimiento: \${sol.system} - Tareas: \${tasksText}\`);
            lines.push(\`    Cotizacion: 1 unidad - \${solutionTotal(sol).toLocaleString('es-CO')} COP estimado\`);
          } else {
            lines.push(\`  > \${sol.name} [\${sol.layer}] \${sol.system} \${sol.fabric || ''}\`);
            if (sol.quickQuote) {
              lines.push(\`    Cotizacion: \${quoteArea(sol.quickQuote).toFixed(2)} m2 - \${quoteTotal(sol.quickQuote).toLocaleString('es-CO')} COP estimado\`);
            }
            lines.push(\`    Area: \${solutionArea(sol).toFixed(2)} m2\`);
            if (sol.divisions.length) lines.push(\`    Divisiones: \${sol.divisions.map(d => \`\${d.label} \${d.width}x\${d.height}\`).join(' | ')}\`);
            if (sol.alerts.length) lines.push(\`    Alertas: \${sol.alerts.map(a => a.message).join(' | ')}\`);
          }
        }`;

code = code.replace(regex, newLoop);
fs.writeFileSync('src/lib/exporters.ts', code);
