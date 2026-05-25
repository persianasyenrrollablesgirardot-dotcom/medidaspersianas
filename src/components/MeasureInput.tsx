export function MeasureInput({ value, unit = 'm', onChange }: { value: number; unit?: string; onChange: (value: number) => void }) {
  return (
    <div className="measure-native">
      <input
        className="input"
        type="number"
        inputMode="decimal"
        step="0.01"
        value={value || ''}
        placeholder="0.00"
        onChange={event => onChange(Number(event.target.value) || 0)}
      />
      <span>{unit}</span>
    </div>
  );
}
