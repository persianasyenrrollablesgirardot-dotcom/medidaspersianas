import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export function PageHeader({ title, subtitle, backTo }: { title: string; subtitle?: string; backTo?: string }) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <button className="ghost" onClick={() => backTo ? navigate(backTo) : navigate(-1)}>
        <ArrowLeftIcon className="icon" />
      </button>
      <div>
        {subtitle && <p>{subtitle}</p>}
        <h1>{title}</h1>
      </div>
    </header>
  );
}
