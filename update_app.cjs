const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  `import { Toaster } from 'react-hot-toast';`,
  `import { Toaster } from 'react-hot-toast';\nimport { useEffect } from 'react';\nimport { db, DEFAULT_CATALOG } from './db';\nimport { DEFAULT_MAINTENANCE_TASKS } from './lib/defaultTasks';`
);

code = code.replace(
  `export default function App() {`,
  `export default function App() {\n  useEffect(() => {\n    db.catalog.toCollection().first().then(cat => {\n      if (cat && cat.id) {\n        db.catalog.update(cat.id, { systems: DEFAULT_CATALOG.systems, maintenanceTasks: DEFAULT_MAINTENANCE_TASKS });\n      } else {\n        db.catalog.add({ ...DEFAULT_CATALOG, maintenanceTasks: DEFAULT_MAINTENANCE_TASKS, lastUpdatedAt: Date.now() });\n      }\n    });\n  }, []);\n`
);

fs.writeFileSync('src/App.tsx', code);
