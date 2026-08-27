import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import AppLoader from './ui/AppLoader';

export default function NonStudentRoute({ children }) {
    const user = useAuthStore((s) => s.user);
    const initializing = useAuthStore((s) => s.initializing);

    if (initializing) {
        return <AppLoader />;
    }

    if (!user || user.role === 'student') {
        return <Navigate to="/login" replace />;
    }

    return children;
}
