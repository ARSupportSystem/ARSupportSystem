import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './components/HomePage';
import ARCamera from './components/ARCamera';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/ar-camera" element={<Navigate to="/faults" replace />} />
            <Route path="/faults" element={<ARCamera />} />
            <Route path="/tools" element={<ARCamera />} />
            <Route path="/monitoring" element={<HomePage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
