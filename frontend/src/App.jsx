import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
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
            <Route path="/ar-camera" element={<ARCamera />} />
            {/* Define other routes here */}
            {/* <Route path="/faults" element={<Faults />} /> */}
            {/* <Route path="/tools" element={<Tools />} /> */}
            {/* <Route path="/monitoring" element={<Monitoring />} /> */}
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
