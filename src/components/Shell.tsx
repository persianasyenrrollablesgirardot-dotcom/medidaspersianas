import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowDownTrayIcon, HomeIcon, TrashIcon, DocumentTextIcon, Cog6ToothIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { AutosaveStatus } from './AutosaveStatus';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AutosaveStatus />
      <main className="app-main">{children}</main>
      <nav className="bottom-nav">
        <NavItem to="/" label="Proyectos" icon={<HomeIcon />} />
        <NavItem to="/exports" label="Exportar" icon={<ArrowDownTrayIcon />} />
        <NavItem to="/facturacion" label="Facturas" icon={<DocumentTextIcon />} />
        <NavItem to="/contabilidad" label="Contabilidad" icon={<BanknotesIcon />} />
        <NavItem to="/papelera" label="Papelera" icon={<TrashIcon />} />
        <NavItem to="/settings" label="Ajustes" icon={<Cog6ToothIcon />} />
      </nav>
    </div>
  );
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}
