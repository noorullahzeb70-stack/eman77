import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/app.css';
import { RouterProvider, useRouter, matchPath } from './lib/router.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { ToastProvider } from './components/ui/Primitives.jsx';
import { RequireAuth } from './components/layout/AppLayout.jsx';
import { Spinner } from './components/ui/Button.jsx';

// Each page loads only when visited (code splitting).
const Home = lazy(() => import('./pages/Home.jsx'));
const Info = (name) => lazy(() => import('./pages/InfoPages.jsx').then((m) => ({ default: m[name] })));
const Lib = (name) => lazy(() => import('./pages/Library.jsx').then((m) => ({ default: m[name] })));
const Pub = (name) => lazy(() => import('./pages/Contact.jsx').then((m) => ({ default: m[name] })));
const AuthP = (name) => lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m[name] })));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Chat = lazy(() => import('./pages/Chat.jsx'));
const Tools = lazy(() => import('./pages/Tools.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Notifications = lazy(() => import('./pages/Settings.jsx').then((m) => ({ default: m.Notifications })));
const AdminHome = lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m.AdminHome })));
const AdminAI = lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m.AdminAI })));
const DesignSystem = lazy(() => import('./pages/DesignSystem.jsx'));
const Legal = Pub('Legal');
const NotFound = Pub('NotFound');

const routes = [
  { path: '/', component: Home },
  { path: '/about', component: Info('About') },
  { path: '/ai', component: Info('AIPage') },
  { path: '/features', component: Info('Features') },
  { path: '/education', component: Lib('Education') },
  { path: '/books', component: Lib('Books') },
  { path: '/gallery', component: Lib('Gallery') },
  { path: '/contact', component: Pub('Contact') },
  { path: '/privacy', component: Legal, props: { page: 'privacy' } },
  { path: '/terms', component: Legal, props: { page: 'terms' } },
  { path: '/ai-notice', component: Legal, props: { page: 'ai-notice' } },
  { path: '/login', component: AuthP('Login') },
  { path: '/register', component: AuthP('Register') },
  { path: '/forgot-password', component: AuthP('ForgotPassword') },
  { path: '/reset-password', component: AuthP('ResetPassword') },
  { path: '/verify-email', component: AuthP('VerifyEmail') },
  { path: '/design', component: DesignSystem },
  { path: '/dashboard', component: Dashboard, auth: true },
  { path: '/chat', component: Chat, auth: true },
  { path: '/chat/:id', component: Chat, auth: true },
  { path: '/tools', component: Tools, auth: true },
  { path: '/settings', component: Settings, auth: true },
  { path: '/notifications', component: Notifications, auth: true },
  { path: '/admin', component: AdminHome, auth: 'admin' },
  { path: '/admin/ai', component: AdminAI, auth: 'admin' },
];

function PageLoader() {
  return <div className="page-loader"><Spinner label="Loading page" /></div>;
}

function Routes() {
  const { path } = useRouter();
  for (const r of routes) {
    const params = matchPath(r.path, path);
    if (!params) continue;
    const C = r.component;
    const page = <C params={params} {...(r.props || {})} />;
    return r.auth ? <RequireAuth role={r.auth === 'admin' ? 'admin' : undefined}>{page}</RequireAuth> : page;
  }
  return <NotFound />;
}

// Register the service worker (installable app + offline shell). AI still needs a connection.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes />
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </RouterProvider>
  </StrictMode>,
);
