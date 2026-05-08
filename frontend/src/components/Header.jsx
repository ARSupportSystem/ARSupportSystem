import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import './Header.css';

const Header = ({ isAuthenticated, currentUser, onLogout }) => {
  const roleLabel = currentUser?.role
    ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)
    : '';

  return (
    <header className="header">
      <Link to="/" className="logo-link">
        <div className="logo">AR Support System</div>
      </Link>
      <nav>
        <ul>
          {isAuthenticated ? (
            <>
              <li>
                <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  Dashboard
                </NavLink>
              </li>
              <li>
                <NavLink to="/faults" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  Faults
                </NavLink>
              </li>
              <li>
                <NavLink to="/tools" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  Tools
                </NavLink>
              </li>
              <li>
                <NavLink to="/tools-admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  Manage Tools
                </NavLink>
              </li>
              {currentUser?.role === 'admin' && (
                <>
                  <li>
                    <NavLink to="/monitoring" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                      Monitoring
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/faults-admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                      Manage Faults
                    </NavLink>
                  </li>
                </>
              )}
              <li className="user-pill">{currentUser?.full_name} ({roleLabel})</li>
              <li>
                <button type="button" className="nav-link nav-logout" onClick={onLogout}>
                  Logout
                </button>
              </li>
            </>
          ) : (
            <li>
              <NavLink to="/login" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                Login
              </NavLink>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
};

export default Header;
