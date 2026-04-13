import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './ARCamera.css';

const ARCamera = () => {
  const { pathname } = useLocation();
  const isToolsPage = pathname === '/tools';
  const fallbackVideoRef = useRef(null);
  const fallbackStreamRef = useRef(null);
  const [arStatus, setArStatus] = useState('Waiting for marker...');
  const [detectedMarker, setDetectedMarker] = useState(null);
  const [hologramMessage, setHologramMessage] = useState('');
  const [isArSceneReady, setIsArSceneReady] = useState(false);
  const [arSceneError, setArSceneError] = useState('');
  const [isFallbackCameraActive, setIsFallbackCameraActive] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [faultForm, setFaultForm] = useState({
    severity: 'Medium',
    zone: '',
    faultType: '',
  });
  const [toolForm, setToolForm] = useState({
    toolId: '',
    toolName: '',
  });
  const arSceneUrl = useMemo(() => `/arjs/index.html?mode=${isToolsPage ? 'tools' : 'faults'}`, [isToolsPage]);

  const stopFallbackCamera = () => {
    if (fallbackStreamRef.current) {
      fallbackStreamRef.current.getTracks().forEach((track) => track.stop());
      fallbackStreamRef.current = null;
    }

    if (fallbackVideoRef.current) {
      fallbackVideoRef.current.srcObject = null;
    }

    setIsFallbackCameraActive(false);
  };

  const startFallbackCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setArSceneError('Camera API unavailable in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      fallbackStreamRef.current = stream;

      if (fallbackVideoRef.current) {
        fallbackVideoRef.current.srcObject = stream;
        await fallbackVideoRef.current.play().catch(() => {});
      }

      setIsFallbackCameraActive(true);
      setArStatus('Fallback camera mode active.');
      setArSceneError('');
    } catch {
      setArSceneError('Unable to start fallback camera. Check browser camera permissions.');
    }
  };

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setIsArSceneReady(false);
      setArSceneError('');
    }, 0);

    const sceneWatchdog = window.setTimeout(() => {
      setArSceneError('Embedded AR.js camera did not initialize. Use fallback camera mode below.');
      startFallbackCamera();
    }, 7000);

    const handleMarkerEvent = (event) => {
      if (event.origin !== window.location.origin || !event.data?.type) {
        return;
      }

      if (event.data.type === 'arjs-status') {
        setArStatus(event.data.message || 'AR.js ready.');
      }

      if (event.data.type === 'arjs-camera-live') {
        setIsArSceneReady(true);
        setArSceneError('');
        setArStatus('AR.js camera live.');
        window.clearTimeout(sceneWatchdog);
      }

      if (event.data.type === 'arjs-camera-error') {
        setIsArSceneReady(false);
        setArSceneError(event.data.message || 'AR.js camera failed to initialize.');
        setArStatus('AR.js camera failed.');
        window.clearTimeout(sceneWatchdog);
      }

      if (event.data.type === 'arjs-marker-found') {
        const markerId = event.data.marker;

        if (markerId === 'hiro') {
          setDetectedMarker({ name: 'Hiro Marker' });
          setHologramMessage('HIRO marker detected: maintenance overlay aligned.');
          setArStatus('Hiro marker tracked.');
        }

        if (markerId === 'kanji') {
          setDetectedMarker({ name: 'FLT-002 BMW 3 Series' });
          setHologramMessage('FLT-002 fault profile loaded: inspect front-left assembly.');
          setArStatus('FLT-002 marker tracked.');
        }
      }

      if (event.data.type === 'arjs-marker-lost') {
        setArStatus('Marker lost. Re-align marker in camera view.');
      }
    };

    window.addEventListener('message', handleMarkerEvent);

    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(sceneWatchdog);
      window.removeEventListener('message', handleMarkerEvent);
      stopFallbackCamera();
    };
  }, [arSceneUrl]);

  const pageContent = pathname === '/tools'
    ? {
        title: 'Tools - AR Workspace',
        subtitle: 'Use AR assistance to inspect and verify tools in your workflow.',
      }
    : {
        title: 'Faults - AR Detection',
        subtitle: 'Point your device at target areas to detect and visualize faults.',
      };

  const handleFaultCapture = () => {
    if (!faultForm.zone.trim() || !faultForm.faultType.trim()) {
      setActionMessage('Enter zone and fault type before capture.');
      return;
    }

    setActionMessage(`Fault captured: ${faultForm.faultType} (${faultForm.severity}) in ${faultForm.zone}.`);
  };

  const handleToolAction = (type) => {
    if (!toolForm.toolId.trim() || !toolForm.toolName.trim()) {
      setActionMessage('Enter tool ID and tool name first.');
      return;
    }

    if (type === 'missing') {
      setActionMessage(`Missing alert raised for ${toolForm.toolName} (${toolForm.toolId}).`);
      return;
    }

    const verb = type === 'in' ? 'checked in' : 'checked out';
    setActionMessage(`${toolForm.toolName} (${toolForm.toolId}) ${verb}.`);
  };

  const triggerMarkerDemo = (markerId) => {
    if (markerId === 'hiro') {
      setDetectedMarker({ name: 'Hiro Marker' });
      setHologramMessage('HIRO marker detected: maintenance overlay aligned.');
      setArStatus('Hiro marker triggered manually.');
    }

    if (markerId === 'kanji') {
      setDetectedMarker({ name: 'FLT-002 BMW 3 Series' });
      setHologramMessage('FLT-002 fault profile loaded: inspect front-left assembly.');
      setArStatus('FLT-002 marker triggered manually.');
    }
  };

  return (
    <div className="ar-camera-container">
      <section className="ar-header">
        <h1>{pageContent.title}</h1>
        <p>{pageContent.subtitle}</p>
      </section>
      
      <section className="ar-content">
        <div className="camera-view">
          <iframe
            title="AR.js Scene"
            src={arSceneUrl}
            className={`arjs-frame${isArSceneReady ? ' ready' : ''}`}
            allow="camera; xr-spatial-tracking"
          />
          {isFallbackCameraActive && (
            <video
              ref={fallbackVideoRef}
              className="fallback-feed"
              autoPlay
              muted
              playsInline
            />
          )}
          {arSceneError && (
            <div className="arjs-overlay-warning">
              <p>{arSceneError}</p>
            </div>
          )}
          {hologramMessage && (
            <div className="hologram-overlay">
              <p className="hologram-title">
                {detectedMarker ? `${detectedMarker.name} Detected` : 'Holographic Message'}
              </p>
              <p className="hologram-text">{hologramMessage}</p>
            </div>
          )}
        </div>
        
        <div className="ar-controls">
          <h2>Controls</h2>
          <div className="xr-status-block">
            <p className="xr-status-label">AR.js Status</p>
            <p className="xr-status-message ok">{arStatus}</p>
          </div>
          {!!arSceneError && !isFallbackCameraActive && (
            <button className="control-btn" onClick={startFallbackCamera}>
              Start Fallback Camera
            </button>
          )}
          {isFallbackCameraActive && (
            <button className="control-btn" onClick={stopFallbackCamera}>
              Stop Fallback Camera
            </button>
          )}

          <div className="control-section">
            <h3>Hit Markers</h3>
            <p className="marker-help">
              Point camera to Hiro/Kanji markers in AR.js scene, or trigger manually.
            </p>
            <div className="marker-grid">
              <button className="marker-card" onClick={() => triggerMarkerDemo('hiro')} type="button">
                <img src="/markers/hiro-marker.png" alt="Hiro Marker" />
                <span>Hiro Marker</span>
              </button>
              <button className="marker-card" onClick={() => triggerMarkerDemo('kanji')} type="button">
                <img src="/markers/vehicle2.png" alt="FLT-002 BMW 3 Series" />
                <span>FLT-002 BMW 3 Series</span>
              </button>
            </div>
          </div>

          {!isToolsPage && (
            <div className="control-section">
              <h3>Fault Capture</h3>
              <label className="control-label" htmlFor="fault-severity">Severity</label>
              <select
                id="fault-severity"
                className="control-input"
                value={faultForm.severity}
                onChange={(event) => setFaultForm({ ...faultForm, severity: event.target.value })}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>

              <label className="control-label" htmlFor="fault-zone">Zone</label>
              <input
                id="fault-zone"
                className="control-input"
                value={faultForm.zone}
                onChange={(event) => setFaultForm({ ...faultForm, zone: event.target.value })}
                placeholder="e.g. Tunnel 3, Platform A"
              />

              <label className="control-label" htmlFor="fault-type">Fault Type</label>
              <input
                id="fault-type"
                className="control-input"
                value={faultForm.faultType}
                onChange={(event) => setFaultForm({ ...faultForm, faultType: event.target.value })}
                placeholder="e.g. Signal drop, crack, leakage"
              />

              <button className="control-btn" onClick={handleFaultCapture}>
                Capture Fault
              </button>
            </div>
          )}

          {isToolsPage && (
            <div className="control-section">
              <h3>Tool Tracking</h3>
              <label className="control-label" htmlFor="tool-id">Tool ID</label>
              <input
                id="tool-id"
                className="control-input"
                value={toolForm.toolId}
                onChange={(event) => setToolForm({ ...toolForm, toolId: event.target.value })}
                placeholder="e.g. TL-204"
              />

              <label className="control-label" htmlFor="tool-name">Tool Name</label>
              <input
                id="tool-name"
                className="control-input"
                value={toolForm.toolName}
                onChange={(event) => setToolForm({ ...toolForm, toolName: event.target.value })}
                placeholder="e.g. Torque Wrench"
              />

              <button className="control-btn" onClick={() => handleToolAction('in')}>
                Check In
              </button>
              <button className="control-btn" onClick={() => handleToolAction('out')}>
                Check Out
              </button>
              <button className="control-btn control-btn-alert" onClick={() => handleToolAction('missing')}>
                Missing Alert
              </button>
            </div>
          )}

          {actionMessage && <p className="action-message">{actionMessage}</p>}
        </div>
      </section>
    </div>
  );
};

export default ARCamera;
