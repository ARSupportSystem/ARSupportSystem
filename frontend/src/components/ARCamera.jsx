import React from 'react';
import { useLocation } from 'react-router-dom';
import './ARCamera.css';

const ARCamera = () => {
  const { pathname } = useLocation();

  const pageContent = pathname === '/tools'
    ? {
        title: 'Tools - AR Workspace',
        subtitle: 'Use AR assistance to inspect and verify tools in your workflow.',
      }
    : {
        title: 'Faults - AR Detection',
        subtitle: 'Point your device at target areas to detect and visualize faults.',
      };

  return (
    <div className="ar-camera-container">
      <section className="ar-header">
        <h1>{pageContent.title}</h1>
        <p>{pageContent.subtitle}</p>
      </section>
      
      <section className="ar-content">
        <div className="camera-view">
          <div className="placeholder">
            <p>AR Camera View</p>
            <p className="placeholder-subtext">
              Camera feed will appear here
            </p>
          </div>
        </div>
        
        <div className="ar-controls">
          <h2>Controls</h2>
          <button className="control-btn">Start Camera</button>
          <button className="control-btn">Capture Fault</button>
          <button className="control-btn">Toggle Overlay</button>
        </div>
      </section>
    </div>
  );
};

export default ARCamera;
