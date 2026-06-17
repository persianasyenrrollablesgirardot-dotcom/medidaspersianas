import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowDownTrayIcon, HomeIcon, DocumentTextIcon, Cog6ToothIcon, BanknotesIcon, ArrowRightOnRectangleIcon, UsersIcon } from '@heroicons/react/24/outline';
import { AutosaveStatus } from './AutosaveStatus';
import { useAuth } from './AuthContext';

export function Shell({ children }: { children: ReactNode }) {
  const { role, logout } = useAuth();
  
  return (
    <div className="app-shell">
      <AutosaveStatus />
      <main className="app-main" style={{ paddingBottom: '80px' }}>{children}</main>
      <nav className="bottom-nav">
        <NavItem to="/" label="Proyectos" icon={<HomeIcon />} />
        
        {role === 'admin' && (
          <>
            <NavItem to="/exports" label="Exportar" icon={<ArrowDownTrayIcon />} />
            <NavItem to="/facturacion" label="Facturas" icon={<DocumentTextIcon />} />
            <NavItem to="/contabilidad" label="Cartera" icon={<BanknotesIcon />} />
            <NavItem to="/admin" label="Usuarios" icon={<UsersIcon />} />
            <NavItem to="/settings" label="Ajustes" icon={<Cog6ToothIcon />} />
          </>
        )}

        <button onClick={logout} className="nav-item" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
          <span className="nav-icon"><ArrowRightOnRectangleIcon /></span>
          <span>Salir</span>
        </button>
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
