import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';

// Shell for the folder views: sidebar on the left (on top on small screens), the list beside it.
export function AppLayout() {
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-10 lg:px-6 lg:py-6">
        <Outlet />
      </main>
    </div>
  );
}
