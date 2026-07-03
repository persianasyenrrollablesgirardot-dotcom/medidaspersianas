import { useState, useEffect } from 'react';

export function MeasureInput({ value, unit = 'm', onChange }: { value: number; unit?: string; onChange: (value: number) => void }) {
  const [local, setLocal] = useState(value ? String(value) : '');

  useEffect(() => {
    if (value === 0 && local === '') return;
    const parsed = parseFloat(local.replace(',', '.'));
    if (value !== parsed && !(isNaN(parsed) && !value)) {
      setLocal(value ? String(value) : '');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    val = val.replace(/[^0-9.,]/g, '');
    setLocal(val);
    
    const parsed = parseFloat(val.replace(',', '.'));
    if (!isNaN(parsed)) {
      onChange(parsed);
    } else if (val === '') {
      onChange(0);
    }
  };

  return (
    <div className="measure-native">
      <input
        className="input"
        type="text"
        inputMode="decimal"
        value={local}
        placeholder="0.00"
        onChange={handleChange}
        onBlur={() => {
          const parsed = parseFloat(local.replace(',', '.'));
          setLocal(!isNaN(parsed) && parsed !== 0 ? String(parsed) : '');
        }}
      />
      <span>{unit}</span>
    </div>
  );
}
