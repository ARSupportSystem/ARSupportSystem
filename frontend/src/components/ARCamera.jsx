import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getFaultByMarkerRequest } from '../services/faultsApi';
import { listToolsRequest, logToolActionRequest } from '../services/toolsApi';
import './ARCamera.css';

const TOOL_SCAN_COOLDOWN_MS = 2000;

const ARCamera = ({ currentUser }) => {
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
  const [detectedTool, setDetectedTool] = useState(null);
  const [checklistActive, setChecklistActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmed, setConfirmed] = useState([]);
  const [scanWarning, setScanWarning] = useState('');
  const scanCooldownUntilRef = useRef(0);
  const scanCooldownTimerRef = useRef(null);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const toolkitOwnerId = currentUser?.id || '';

  // embedded=1 tells the AR.js page to hide its back button
  const arSceneUrl = useMemo(
    () => {
      const searchParams = new URLSearchParams({
        mode: isToolsPage ? 'tools' : 'faults',
        apiBase: apiBaseUrl,
        embedded: '1',
      });
      if (isToolsPage && toolkitOwnerId) {
        searchParams.set('ownerId', String(toolkitOwnerId));
      }
      return `/arjs/index.html?${searchParams.toString()}`;
    },
    [apiBaseUrl, isToolsPage, toolkitOwnerId],
  );

  const pageContent = isToolsPage
    ? {
        title: 'Tools — AR Workspace',
        subtitle: 'Point the camera at a marker from your assigned toolkit.',
      }
    : {
        title: 'Faults — AR Detection',
        subtitle: 'Point the camera at a fault marker to look up its details.',
      };

  // Load tools when in tools mode
  useEffect(() => {
    if (!isToolsPage) return;
    listToolsRequest(token, { owner_id: toolkitOwnerId })
      .then((data) => {
        const scannableTools = data.filter((tool) => {
          const markerValue = Number.parseInt(tool.marker_id, 10);
          return Number.isInteger(markerValue) && markerValue >= 0 && markerValue <= 63;
        });
        setTools(scannableTools);
        if (data.length > 0 && scannableTools.length === 0) {
          setActionMessage('No tools with valid marker IDs found. Add or update tool markers in Tool Management.');
        }
      })
      .catch(() => setActionMessage('Could not load tools from the server.'));
  }, [isToolsPage, token, toolkitOwnerId]);

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

  const findToolByMarkerId = useCallback((markerId) => (
    tools.find((tool) => String(tool.marker_id) === String(markerId))
  ), [tools]);

  const startToolScanCooldown = useCallback((toolName) => {
    scanCooldownUntilRef.current = Date.now() + TOOL_SCAN_COOLDOWN_MS;

    if (scanCooldownTimerRef.current) {
      window.clearTimeout(scanCooldownTimerRef.current);
    }

    scanCooldownTimerRef.current = window.setTimeout(() => {
      scanCooldownUntilRef.current = 0;
      setArStatus(`Ready for next tool after ${toolName}.`);
    }, TOOL_SCAN_COOLDOWN_MS);
  }, []);

  useEffect(() => () => {
    if (scanCooldownTimerRef.current) {
      window.clearTimeout(scanCooldownTimerRef.current);
    }
  }, []);

  // Handle tool checklist scan
  const handleToolScan = useCallback(async (markerId) => {
    if (!checklistActive || currentIndex >= tools.length) return false;

    const currentTool = tools[currentIndex];
    setScanWarning('');

    if (String(markerId) !== String(currentTool.marker_id)) {
      setScanWarning(`Wrong tool scanned. Expected: ${currentTool.name} (marker #${currentTool.marker_id})`);
      return false;
    }

    try {
      await logToolActionRequest(token, { tool_id: currentTool.id, action: 'confirmed' });
    } catch {
      // Non-critical: still advance the checklist so the physical count can continue.
    }

    setConfirmed((prev) => (prev.includes(currentTool.id) ? prev : [...prev, currentTool.id]));
    setActionMessage(`${currentTool.name} confirmed.`);
    setCurrentIndex((prev) => prev + 1);
    startToolScanCooldown(currentTool.name);
    return true;
  }, [checklistActive, currentIndex, startToolScanCooldown, tools, token]);

  const handleToolMarkerFound = useCallback(async (markerId) => {
    if (checklistActive && Date.now() < scanCooldownUntilRef.current) {
      return;
    }

    const tool = findToolByMarkerId(markerId);

    if (!tool) {
      setDetectedTool(null);
      setDetectedMarker({ name: markerId });
      setHologramMessage(`Unknown tool marker #${markerId}.`);
      setArStatus(`Marker #${markerId} detected, but no registered tool uses it.`);
      setScanWarning(`Marker #${markerId} is not assigned to a registered tool.`);
      return;
    }

    setDetectedTool(tool);
    setDetectedMarker({ name: tool.name });
    setHologramMessage(`${tool.name} detected - marker #${tool.marker_id}`);
    setArStatus(`Detected ${tool.name} (marker #${tool.marker_id}).`);
    setActionMessage(`${tool.name} detected.`);

    if (checklistActive) {
      const accepted = await handleToolScan(markerId);
      if (accepted) {
        setArStatus(`${tool.name} confirmed. Move the marker away before scanning the next tool.`);
      }
    }
  }, [checklistActive, findToolByMarkerId, handleToolScan]);

  useEffect(() => {
    const handleMessage = (event) => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'arjs-status' && payload.message) {
        setArStatus(payload.message);
        return;
      }

      if (payload.type === 'arjs-marker-found' && payload.marker) {
        if (isToolsPage) {
          void handleToolMarkerFound(payload.marker);
        } else if (!isToolsPage) {
          resolveFaultByMarker(payload.marker, 'AR.js');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [resolveFaultByMarker, handleToolMarkerFound, isToolsPage]);

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

  const handleMissingTool = async () => {
    if (!checklistActive || currentIndex >= tools.length) {
      setActionMessage('Start the tool check first.');
      return;
    }

    const targetTool = tools[currentIndex];

    try {
      await logToolActionRequest(token, { tool_id: targetTool.id, action: 'missing' });
      setDetectedTool(targetTool);
      setActionMessage(`${targetTool.name} flagged as missing.`);
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

              {detectedTool && (
                <div className="detected-tool-panel">
                  <p className="tool-scan-instruction">Detected tool</p>
                  <p className="tool-scan-name">{detectedTool.name}</p>
                  <p className="tool-scan-marker">
                    Marker ID: <code>{detectedTool.marker_id}</code>
                  </p>
                </div>
              )}

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
                    <button className="control-btn control-btn-alert" onClick={handleMissingTool}>
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
