import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { GuestRoute, ProtectedRoute } from './features/auth/RouteGuards';
import { ComposePage } from './pages/ComposePage';
import { DashboardPage } from './pages/DashboardPage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        {/* Folder views share the sidebar layout. */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
        {/* Full-page views, as in the design: no sidebar. */}
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/emails/:id" element={<EmailDetailPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
