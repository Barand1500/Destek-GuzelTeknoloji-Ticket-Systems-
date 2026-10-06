import { NavLink as RouterNavLink, useLocation, type NavLinkProps } from 'react-router-dom';
import { useAuth } from '../features/auth/Auth';
import { hasPermission, screenPermission } from '../features/auth/permissions';
import type { ReactNode } from 'react';
export function PermissionNavLink(props: NavLinkProps) {
  const { user } = useAuth();
  const path = typeof props.to === 'string' ? props.to : props.to.pathname ?? '';
  const permission = screenPermission(path);
  if (permission && !hasPermission(user, permission)) return null;
  return <RouterNavLink {...props}/>;
}
export function PermissionScreen({ children }: { children: ReactNode }) {
  const { pathname } = useLocation(), { user } = useAuth();
  const permission = screenPermission(pathname);
  if (permission && !hasPermission(user, permission)) return <main className="page"><h1>Erişim yetkiniz yok</h1><p className="muted">Bu ekran rolünüze açık değil. Sol menüden erişebildiğiniz bir ekranı seçebilirsiniz.</p></main>;
  return <>{children}</>;
}
