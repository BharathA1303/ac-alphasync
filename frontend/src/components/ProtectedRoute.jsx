import { useAuthStore } from '../stores/useAuthStore';
import { Navigate } from 'react-router-dom';
import AppLoader from './ui/AppLoader';

export default function ProtectedRoute({ children }) {
    const user = useAuthStore((s) => s.user);
    const initializing = useAuthStore((s) => s.initializing);

    // Fast path: if we have a cached user in localStorage, skip the spinner
    // entirely to prevent the flash. Firebase will validate in the background.
    const hasCachedUser = !user && initializing && (() => {
        try { return !!localStorage.getItem('alphasync_user'); } catch { return false; }
    })();

    if (initializing && !hasCachedUser) {
        return <AppLoader />;
    }

    if (!user && !hasCachedUser) {
        return <Navigate to="/login" replace />;
    }

    if (user) {
        const status = (user.account_status || 'active').toLowerCase();
        const isActive = status === 'active' && user.is_active !== false;
        if (!isActive) {
            return <Navigate to="/account-status" replace />;
        }
    }

    return children;
}
