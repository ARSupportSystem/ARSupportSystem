import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import './Header.css';

const Header = () => {
  return (
    <header className="header">
      <Link to="/" className="logo-link">
        <div className="logo">AR Support System</div>
      </Link>
      <nav>
        <ul>
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
            <NavLink to="/monitoring" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Monitoring
            </NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Header;
