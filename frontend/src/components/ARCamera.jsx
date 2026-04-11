import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './ARCamera.css';

const ARCamera = () => {
  const { pathname } = useLocation();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraActive(false);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported in this browser.');
      return;
    }

    try {
      setCameraError('');

      if (streamRef.current) {
        stopCamera();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setIsCameraActive(true);
    } catch {
      setCameraError('Unable to access the camera. Please allow camera permission and try again.');
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

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
          <video
            className={`camera-feed${isCameraActive ? ' active' : ''}`}
            ref={videoRef}
            autoPlay
            muted
            playsInline
          />
          {!isCameraActive && (
            <div className="placeholder">
              <p>AR Camera View</p>
              <p className="placeholder-subtext">
                Camera feed will appear here
              </p>
              {cameraError && <p className="camera-error">{cameraError}</p>}
            </div>
          )}
        </div>
        
        <div className="ar-controls">
          <h2>Controls</h2>
          <button className="control-btn" onClick={startCamera} disabled={isCameraActive}>
            {isCameraActive ? 'Camera Running' : 'Start Camera'}
          </button>
          <button className="control-btn" onClick={stopCamera} disabled={!isCameraActive}>
            Stop Camera
          </button>
          <button className="control-btn" disabled={!isCameraActive}>Capture Fault</button>
        </div>
      </section>
    </div>
  );
};

export default ARCamera;
