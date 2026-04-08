import React from 'react';
import './ARCamera.css';

const ARCamera = () => {
  return (
    <div className="ar-camera-container">
      <section className="ar-header">
        <h1>AR Camera - Fault Detection</h1>
        <p>Point your device at areas to detect and visualize faults</p>
      </section>
      
      <section className="ar-content">
        <div className="camera-view">
          <div className="placeholder">
            <p>AR Camera View</p>
            <p style={{ fontSize: '0.9rem', marginTop: '1rem', color: '#a8d8ff' }}>
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
