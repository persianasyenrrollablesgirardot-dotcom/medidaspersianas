import { useState } from 'react';

export function MeasureInput({ value, unit = 'm', onChange }: { value: number; unit?: string; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const display = value ? String(value) : '';

  const start = () => {
    setDraft(display);
    setOpen(true);
  };
  const press = (key: string) => {
    setDraft(current => {
      if (key === 'del') return current.slice(0, -1);
      if (key === 'clear') return '';
      if (key === '.' && current.includes('.')) return current;
      if (key === '.' && !current) return '0.';
      return `${current}${key}`;
    });
  };
  const accept = () => {
    onChange(Number(draft) || 0);
    setOpen(false);
  };

  return (
    <>
      <button type="button" className="measure-trigger input" onClick={start}>
        <span>{display || '0.00'}</span>
        <em>{unit}</em>
      </button>
      {open && (
        <div className="measure-keypad-backdrop" onClick={() => setOpen(false)}>
          <div className="measure-keypad" onClick={event => event.stopPropagation()}>
            <div className="keypad-display">{draft || '0'}</div>
            <div className="keypad-grid">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0'].map(key => (
                <button key={key} type="button" onClick={() => press(key)}>{key}</button>
              ))}
              <button type="button" onClick={() => press('del')}>Borrar</button>
            </div>
            <div className="keypad-actions">
              <button type="button" className="secondary" onClick={() => press('clear')}>Limpiar</button>
              <button type="button" className="primary" onClick={accept}>Aceptar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
