import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Boards from './pages/Boards.jsx';
import BoardPage from './pages/BoardPage.jsx';
import ThreadPage from './pages/ThreadPage.jsx';
import Welcome from './pages/Welcome.jsx';

// 不常用 / 次要页面按需加载，首屏只需要核心那几个
const SearchPage = lazy(() => import('./pages/SearchPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const MePage = lazy(() => import('./pages/MePage.jsx'));
const UserPage = lazy(() => import('./pages/UserPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'));
const LoginPage = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.Login })));
const RegisterPage = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.Register })));

const Loading = () => <div className="page muted">马上就来…</div>;

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* 开始界面：独立全屏，不在论坛布局里 */}
        <Route path="/welcome" element={<Welcome />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Boards />} />
          <Route path="/b/:slug" element={<BoardPage />} />
          <Route path="/t/:id" element={<ThreadPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/u/:id" element={<UserPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
