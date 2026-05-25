import { useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Field, SelectInput, TextInput } from './Field';

export function EditableSelect({
  label,
  value,
  options,
  onChange,
  onAddOption,
  onDeleteOption,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string) => void;
  onAddOption: (value: string) => void;
  onDeleteOption: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const add = () => {
    const clean = draft.trim();
    if (!clean) return;
    onAddOption(clean);
    onChange(clean);
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="editable-select">
      <Field label={label}>
        <SelectInput value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">Pendiente</option>
          {options.map(option => <option key={option}>{option}</option>)}
        </SelectInput>
      </Field>
      <div className="option-tools">
        <button className="secondary small" type="button" onClick={() => setAdding(v => !v)}>
          <PlusIcon className="icon" /> Opcion
        </button>
        {value && (
          <button className="secondary small danger-outline" type="button" onClick={() => onDeleteOption(value)}>
            <TrashIcon className="icon" /> Borrar
          </button>
        )}
      </div>
      {adding && (
        <div className="inline-add">
          <TextInput value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Nueva opcion para ${label}`} autoFocus />
          <button className="primary" type="button" onClick={add}>Agregar</button>
        </div>
      )}
    </div>
  );
}
