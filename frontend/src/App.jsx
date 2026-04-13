import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './components/HomePage';
import ARCamera from './components/ARCamera';
import './App.css';

function AppRoutes() {
  const location = useLocation();

  return (
    <main>
      <div className="page-transition" key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/ar-camera" element={<Navigate to="/faults" replace />} />
          <Route path="/faults" element={<ARCamera />} />
          <Route path="/tools" element={<ARCamera />} />
          <Route path="/monitoring" element={<HomePage />} />
        </Routes>
      </div>
    </main>
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <Header />
        <AppRoutes />
      </div>
    </Router>
  );
}

export default App;
