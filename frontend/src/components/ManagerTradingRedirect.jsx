import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

const HOME_BY_ROLE = {
  admin: '/admin/panel',
  institution_admin: '/institution/portal',
};

/**
 * Super Admin and Institution Admin keep their portals. Trading Lab routes
 * redirect home so those roles never land on student/faculty trading screens.
 */
export default function ManagerTradingRedirect({ children }) {
  const user = useAuthStore((s) => s.user);
  const dest = HOME_BY_ROLE[user?.role];
  if (dest) {
    return <Navigate to={dest} replace />;
  }
  return children;
}
