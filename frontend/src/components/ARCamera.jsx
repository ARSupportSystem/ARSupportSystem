import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getFaultByMarkerRequest } from '../services/faultsApi';
import './ARCamera.css';

const ARCamera = () => {
  const { pathname } = useLocation();
  const isToolsPage = pathname === '/tools';
  const token = localStorage.getItem('authToken') || '';
  const [arStatus, setArStatus] = useState('Ready to launch AR.js camera.');
  const [detectedMarker, setDetectedMarker] = useState(null);
  const [hologramMessage, setHologramMessage] = useState('');
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

  const pageContent = pathname === '/tools'
    ? {
        title: 'Tools - AR Workspace',
        subtitle: 'Use AR assistance to inspect and verify tools in your workflow.',
      }
    : {
        title: 'Faults - AR Detection',
        subtitle: 'Point your device at target areas to detect and visualize faults.',
      };

  const resolveFaultByMarker = useCallback(async (markerId, source = 'AR.js marker') => {
    setArStatus(`${source} detected (${markerId}). Looking up fault...`);

    try {
      const fault = await getFaultByMarkerRequest(token, markerId);
      setDetectedMarker({ name: markerId, fault });
      setHologramMessage(
        `${fault.title} (${fault.severity}) • ${fault.location}${fault.location_detail ? ` - ${fault.location_detail}` : ''}`,
      );
      setArStatus(`Loaded fault ${fault.id} for marker ${markerId}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to fetch fault';
      setDetectedMarker({ name: markerId });
      setHologramMessage(`No backend fault found for marker ${markerId}.`);
      setArStatus(detail);
    }
  }, [token]);

  useEffect(() => {
    const handleMessage = (event) => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') {
        return;
      }

      if (payload.type === 'arjs-status' && payload.message) {
        setArStatus(payload.message);
        return;
      }

      if (payload.type === 'arjs-marker-found' && payload.marker) {
        resolveFaultByMarker(payload.marker, 'AR.js');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [resolveFaultByMarker]);

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

  const launchArCamera = () => {
    setArStatus('Opening AR.js camera...');
    window.location.href = arSceneUrl;
  };

  const triggerMarkerDemo = (markerId) => {
    resolveFaultByMarker(markerId, 'Manual trigger');
  };

  return (
    <div className="ar-camera-container">
      <section className="ar-header">
        <h1>{pageContent.title}</h1>
        <p>{pageContent.subtitle}</p>
      </section>
      
      <section className="ar-content">
        <div className="camera-view">
          <div className="ar-launch-panel">
            <p className="ar-launch-title">AR.js Camera Session</p>
            <p className="ar-launch-text">
              Launch AR.js in full-screen mode for reliable camera access and marker tracking.
            </p>
            <button className="control-btn" onClick={launchArCamera}>
              Launch AR.js Camera
            </button>
            <p className="ar-launch-note">Use browser back to return here after scanning markers.</p>
          </div>
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
