const fs = require('fs');
let code = fs.readFileSync('src/pages/WindowWorkspace.tsx', 'utf8');

const oldListStyle = '<div className="maintenance-list" style={{ display: \'flex\', flexDirection: \'column\', gap: \'12px\' }}>';
const newListStyle = '<div className="maintenance-list" style={{ display: \'grid\', gridTemplateColumns: \'repeat(auto-fill, minmax(280px, 1fr))\', gap: \'8px\' }}>';
code = code.replace(oldListStyle, newListStyle);

const oldRowStyle = '<div key={task.id} style={{ display: \'flex\', alignItems: \'center\', gap: \'12px\', background: \'var(--bg-subtle)\', padding: \'12px\', borderRadius: \'8px\' }}>';
const newRowStyle = '<div key={task.id} style={{ display: \'flex\', alignItems: \'center\', gap: \'8px\', background: isSelected ? \'var(--bg-deep)\' : \'var(--bg-subtle)\', border: isSelected ? \'1px solid var(--primary)\' : \'1px solid transparent\', padding: \'8px 12px\', borderRadius: \'6px\', transition: \'all 0.2s\' }}>';
code = code.replace(oldRowStyle, newRowStyle);

const oldInputWidth = '<div style={{ width: \'120px\' }}>';
const newInputWidth = '<div style={{ width: \'100px\' }}>';
code = code.replace(oldInputWidth, newInputWidth);

fs.writeFileSync('src/pages/WindowWorkspace.tsx', code);
