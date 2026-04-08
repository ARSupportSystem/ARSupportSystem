import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

const Header = () => {
  return (
    <header className="header">
      <div className="logo">AR Support System</div>
      <nav>
        <ul>
          <li><Link to="/">Dashboard</Link></li>
          <li><Link to="/ar-camera">AR Camera</Link></li>
          <li><Link to="/faults">Faults</Link></li>
          <li><Link to="/tools">Tools</Link></li>
          <li><Link to="/monitoring">System Monitoring</Link></li>
        </ul>
      </nav>
    </header>
  );
};

export default Header;
