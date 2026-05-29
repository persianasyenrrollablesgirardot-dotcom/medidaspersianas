const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const oldListStyle = '<div style={{ display: \'grid\', gap: \'12px\' }}>';
const newListStyle = '<div style={{ display: \'grid\', gridTemplateColumns: \'repeat(auto-fill, minmax(280px, 1fr))\', gap: \'8px\' }}>';
code = code.replace(oldListStyle, newListStyle);

const oldRowStyle = '<div key={task.id} style={{ display: \'flex\', gap: \'12px\', alignItems: \'center\', background: \'var(--bg-subtle)\', padding: \'12px\', borderRadius: \'8px\' }}>';
const newRowStyle = '<div key={task.id} style={{ display: \'flex\', gap: \'8px\', alignItems: \'center\', background: \'var(--bg-subtle)\', padding: \'8px 12px\', borderRadius: \'6px\' }}>';
code = code.replace(oldRowStyle, newRowStyle);

const oldInputWidth = '<div style={{ width: \'150px\' }}>';
const newInputWidth = '<div style={{ width: \'120px\' }}>';
code = code.replace(oldInputWidth, newInputWidth);

fs.writeFileSync('src/pages/Settings.tsx', code);
