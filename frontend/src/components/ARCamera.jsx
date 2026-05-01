import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getFaultByMarkerRequest } from '../services/faultsApi';
import { listToolsRequest, logToolActionRequest } from '../services/toolsApi';
import './ARCamera.css';

const ARCamera = () => {
  const { pathname } = useLocation();
  const isToolsPage = pathname === '/tools';
  const token = localStorage.getItem('authToken') || '';
  const [arStatus, setArStatus] = useState('Starting AR.js camera...');
  const [detectedMarker, setDetectedMarker] = useState(null);
  const [hologramMessage, setHologramMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [faultForm, setFaultForm] = useState({
    severity: 'Medium',
    zone: '',
    faultType: '',
  });

  // Tool checklist state
  const [tools, setTools] = useState([]);
  const [checklistActive, setChecklistActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmed, setConfirmed] = useState([]);
  const [scanWarning, setScanWarning] = useState('');

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  // embedded=1 tells the AR.js page to hide its back button
  const arSceneUrl = useMemo(
    () => `/arjs/index.html?mode=${isToolsPage ? 'tools' : 'faults'}&apiBase=${encodeURIComponent(apiBaseUrl)}&embedded=1`,
    [apiBaseUrl, isToolsPage],
  );

  const pageContent = isToolsPage
    ? {
        title: 'Tools — AR Workspace',
        subtitle: 'Point the camera at a tool\'s ArUco marker to scan it.',
      }
    : {
        title: 'Faults — AR Detection',
        subtitle: 'Point the camera at a fault marker to look up its details.',
      };

  // Load tools when in tools mode
  useEffect(() => {
    if (!isToolsPage) return;
    listToolsRequest(token)
      .then((data) => setTools(data))
      .catch(() => setActionMessage('Could not load tools from the server.'));
  }, [isToolsPage, token]);

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

  // Handle tool checklist scan
  const handleToolScan = useCallback(async (markerId) => {
    if (!checklistActive || currentIndex >= tools.length) return;

    const currentTool = tools[currentIndex];
    setScanWarning('');

    if (String(markerId) !== String(currentTool.marker_id)) {
      setScanWarning(`Wrong tool scanned. Expected: ${currentTool.name} (marker #${currentTool.marker_id})`);
      return;
    }

    try {
      await logToolActionRequest(token, { tool_id: currentTool.id, action: 'confirmed' });
    } catch {
      // Non-critical — still advance the checklist
    }

    setConfirmed((prev) => [...prev, currentTool.id]);
    setActionMessage(`${currentTool.name} confirmed.`);
    setCurrentIndex((prev) => prev + 1);
  }, [checklistActive, currentIndex, tools, token]);

  useEffect(() => {
    const handleMessage = (event) => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'arjs-status' && payload.message) {
        setArStatus(payload.message);
        return;
      }

      if (payload.type === 'arjs-marker-found' && payload.marker) {
        if (isToolsPage && checklistActive) {
          handleToolScan(payload.marker);
        } else if (!isToolsPage) {
          resolveFaultByMarker(payload.marker, 'AR.js');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [resolveFaultByMarker, handleToolScan, isToolsPage, checklistActive]);

  const handleFaultCapture = () => {
    if (!faultForm.zone.trim() || !faultForm.faultType.trim()) {
      setActionMessage('Enter zone and fault type before capture.');
      return;
    }
    setActionMessage(`Fault captured: ${faultForm.faultType} (${faultForm.severity}) in ${faultForm.zone}.`);
  };

  const startChecklist = () => {
    if (tools.length === 0) {
      setActionMessage('No tools registered. Add tools via Tool Management first.');
      return;
    }
    setConfirmed([]);
    setCurrentIndex(0);
    setScanWarning('');
    setActionMessage('');
    setChecklistActive(true);
  };

  const resetChecklist = () => {
    setChecklistActive(false);
    setConfirmed([]);
    setCurrentIndex(0);
    setScanWarning('');
    setActionMessage('');
  };

  const handleManualToolAction = async (action) => {
    if (!checklistActive || tools.length === 0) {
      setActionMessage('Start the tool check first.');
      return;
    }

    const currentTool = tools[Math.min(currentIndex, tools.length - 1)];

    try {
      await logToolActionRequest(token, { tool_id: currentTool.id, action });
      const labels = { checkin: 'checked in', checkout: 'checked out', missing: 'flagged as missing' };
      setActionMessage(`${currentTool.name} ${labels[action] || action}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Action failed';
      setActionMessage(detail);
    }
  };

  const triggerMarkerDemo = (markerId) => {
    resolveFaultByMarker(markerId, 'Manual trigger');
  };

  const checklistComplete = checklistActive && currentIndex >= tools.length;

  return (
    <div className="ar-camera-container">
      <section className="ar-header">
        <h1>{pageContent.title}</h1>
        <p>{pageContent.subtitle}</p>
      </section>

      <section className="ar-content">
        {/* Live AR camera — always active via iframe */}
        <div className="camera-view">
          <iframe
            src={arSceneUrl}
            className="ar-iframe"
            title="AR Camera"
            allow="camera; microphone"
          />
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

          {!isToolsPage && (
            <div className="control-section">
              <h3>Hit Markers</h3>
              <p className="marker-help">
                Point camera to markers in the camera feed, or trigger manually.
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
          )}

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
              <h3>Tool Check</h3>

              {!checklistActive && (
                <button className="control-btn" onClick={startChecklist}>
                  Start Tool Check
                </button>
              )}

              {checklistActive && !checklistComplete && (
                <>
                  <div className="tool-checklist-prompt">
                    <p className="tool-scan-instruction">Scan marker for:</p>
                    <p className="tool-scan-name">{tools[currentIndex]?.name}</p>
                    <p className="tool-scan-marker">
                      Marker ID: <code>{tools[currentIndex]?.marker_id}</code>
                    </p>
                  </div>

                  {scanWarning && <p className="tool-scan-warning">{scanWarning}</p>}

                  <ul className="tool-checklist">
                    {tools.map((tool, index) => {
                      const isDone = confirmed.includes(tool.id);
                      const isCurrent = index === currentIndex;
                      return (
                        <li
                          key={tool.id}
                          className={`tool-checklist-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
                        >
                          <span className="tool-checklist-status">
                            {isDone ? '✓' : isCurrent ? '▶' : '○'}
                          </span>
                          <span className="tool-checklist-name">{tool.name}</span>
                          <code className="tool-checklist-marker">{tool.marker_id}</code>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="control-section">
                    <h3>Manual Override</h3>
                    <p className="marker-help">
                      Current tool: <strong>{tools[currentIndex]?.name}</strong>
                    </p>
                    <button className="control-btn" onClick={() => handleManualToolAction('checkin')}>
                      Check In
                    </button>
                    <button className="control-btn" onClick={() => handleManualToolAction('checkout')}>
                      Check Out
                    </button>
                    <button className="control-btn control-btn-alert" onClick={() => handleManualToolAction('missing')}>
                      Missing Alert
                    </button>
                  </div>

                  <button className="control-btn control-btn-secondary" onClick={resetChecklist}>
                    Reset Checklist
                  </button>
                </>
              )}

              {checklistComplete && (
                <div className="tool-checklist-complete">
                  <p className="tool-complete-message">
                    Tool check complete. All {tools.length} tool{tools.length === 1 ? '' : 's'} accounted for.
                  </p>
                  <ul className="tool-checklist">
                    {tools.map((tool) => (
                      <li key={tool.id} className="tool-checklist-item done">
                        <span className="tool-checklist-status">✓</span>
                        <span className="tool-checklist-name">{tool.name}</span>
                        <code className="tool-checklist-marker">{tool.marker_id}</code>
                      </li>
                    ))}
                  </ul>
                  <button className="control-btn" onClick={resetChecklist}>
                    Run Again
                  </button>
                </div>
              )}
            </div>
          )}

          {actionMessage && <p className="action-message">{actionMessage}</p>}
        </div>
      </section>
    </div>
  );
};

export default ARCamera;
