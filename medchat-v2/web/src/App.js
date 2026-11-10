/**
 * MedChat Web App
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ChatsPage from './pages/ChatsPage';
import ChatPage from './pages/ChatPage';
import FilesPage from './pages/FilesPage';
import SettingsPage from './pages/SettingsPage';
import GuestConnectPage from './pages/GuestConnectPage';
import VkCallbackPage from './pages/VkCallbackPage';

function Protected({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="page-loading">Загрузка...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated && !isLoading ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/chats" element={<Protected><ChatsPage /></Protected>} />
      <Route path="/chats/:chatId" element={<Protected><ChatPage /></Protected>} />
      <Route path="/files" element={<Protected><FilesPage /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      <Route path="/connect" element={<GuestConnectPage />} />
      <Route path="/vk-callback" element={<VkCallbackPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
