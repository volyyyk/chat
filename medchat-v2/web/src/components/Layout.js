/**
 * Common layout with sidebar for authenticated users
 */
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">MedChat</div>
        <nav className="sidebar-nav">
          <NavLink to="/" end>Главная</NavLink>
          <NavLink to="/chats">Чаты</NavLink>
          <NavLink to="/files">Файлы</NavLink>
          <NavLink to="/settings">Настройки</NavLink>
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-name">
            {user ? (user.lastName + ' ' + user.firstName) : 'Врач'}
          </div>
          <button className="btn btn-ghost btn-small" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
};

export default Layout;
