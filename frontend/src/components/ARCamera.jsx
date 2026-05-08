import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createAnnotationRequest, listAnnotationsRequest } from '../services/annotationsApi';
import { createFaultRequest, getFaultByMarkerRequest, updateFaultStatusRequest } from '../services/faultsApi';
import {
  completeToolSessionRequest,
  createToolSessionRequest,
  listToolsRequest,
  logToolActionRequest,
} from '../services/toolsApi';
import './ARCamera.css';

const TOOL_SCAN_COOLDOWN_MS = 2000;
const FAULT_REPORT_DEFAULTS = {
  title: '',
  description: '',
  severity: 'medium',
  location: 'other',
  location_detail: '',
};
const ANNOTATION_DEFAULTS = {
  annotation_type: 'note',
  title: '',
  content: '',
};

const formatAnnotationTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const ARCamera = ({ currentUser }) => {
  const { pathname } = useLocation();
  const isToolsPage = pathname === '/tools';
  const token = localStorage.getItem('authToken') || '';
  const [arStatus, setArStatus] = useState('Starting AR.js camera...');
  const [detectedMarker, setDetectedMarker] = useState(null);
  const [hologramMessage, setHologramMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [faultReport, setFaultReport] = useState(FAULT_REPORT_DEFAULTS);
  const [faultSubmitting, setFaultSubmitting] = useState(false);
  const [faultAnnotations, setFaultAnnotations] = useState([]);
  const [annotationForm, setAnnotationForm] = useState(ANNOTATION_DEFAULTS);
  const [annotationSubmitting, setAnnotationSubmitting] = useState(false);

  // Tool checklist state
  const [tools, setTools] = useState([]);
  const [detectedTool, setDetectedTool] = useState(null);
  const [checklistActive, setChecklistActive] = useState(false);
  const [toolSession, setToolSession] = useState(null);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmed, setConfirmed] = useState([]);
  const [missingTools, setMissingTools] = useState([]);
  const [scanWarning, setScanWarning] = useState('');
  const scanCooldownUntilRef = useRef(0);
  const scanCooldownTimerRef = useRef(null);
  const lastFaultMarkerRef = useRef('');

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
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
        subtitle: 'Scan a prepared marker to view its linked fault or report a new one.',
      };

  const arHeaderContent = isToolsPage
    ? {
        kicker: 'Tool Accountability',
        title: 'AR Tool Check',
        subtitle: 'Scan each tool marker in your assigned toolkit and confirm nothing is left behind.',
        primaryStat: tools.length,
        primaryLabel: 'Toolkit tools',
        secondaryStat: checklistActive ? `${Math.min(currentIndex, tools.length)}/${tools.length}` : 'Ready',
        secondaryLabel: checklistActive ? 'Confirmed' : 'Checklist',
      }
    : {
        kicker: 'Field Fault Reporting',
        title: 'AR Fault Scanner',
        subtitle: 'Scan a prepared marker to view the linked fault record or attach a new field report.',
        primaryStat: detectedMarker?.fault ? `#${detectedMarker.fault.id}` : detectedMarker ? `#${detectedMarker.name}` : '--',
        primaryLabel: detectedMarker?.fault ? 'Loaded fault' : detectedMarker ? 'Last marker' : 'No marker',
        secondaryStat: detectedMarker?.fault?.status?.replace('_', ' ') || 'Ready',
        secondaryLabel: 'Fault status',
      };
  void pageContent;

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
    const markerKey = String(markerId);
    const isSameLastMarker = lastFaultMarkerRef.current === markerKey;
    lastFaultMarkerRef.current = markerKey;
    setArStatus(`${source} detected (${markerId}). Looking up fault...`);

    try {
      const fault = await getFaultByMarkerRequest(token, markerId);
      setDetectedMarker({ name: markerId, fault });
      setFaultReport(FAULT_REPORT_DEFAULTS);
      setAnnotationForm(ANNOTATION_DEFAULTS);
      try {
        const annotations = await listAnnotationsRequest(token, { fault_id: fault.id });
        setFaultAnnotations(annotations);
      } catch {
        setFaultAnnotations([]);
      }
      setHologramMessage(
        `${fault.title} (${fault.severity}) • ${fault.location}${fault.location_detail ? ` - ${fault.location_detail}` : ''}`,
      );
      setArStatus(`Loaded fault ${fault.id} for marker ${markerId}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to fetch fault';
      setDetectedMarker({ name: markerId, fault: null });
      setFaultAnnotations([]);
      if (!isSameLastMarker) {
        setFaultReport(FAULT_REPORT_DEFAULTS);
      }
      setHologramMessage(`Marker ${markerId} is ready for a fault report.`);
      setArStatus(`${detail}. Last scanned marker ${markerId} is selected for reporting.`);
    }
  }, [token]);

  const handleFaultReportChange = (field, value) => {
    setFaultReport((prev) => ({ ...prev, [field]: value }));
  };

  const handleAnnotationChange = (field, value) => {
    setAnnotationForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateAnnotation = async (event) => {
    event.preventDefault();
    const fault = detectedMarker?.fault;
    if (!fault) {
      setActionMessage('Scan a linked fault marker before adding an annotation.');
      return;
    }

    if (!annotationForm.title.trim() && !annotationForm.content.trim()) {
      setActionMessage('Add an annotation title or note before saving.');
      return;
    }

    try {
      setAnnotationSubmitting(true);
      const created = await createAnnotationRequest(token, {
        fault_id: fault.id,
        annotation_type: annotationForm.annotation_type,
        title: annotationForm.title.trim() || null,
        content: annotationForm.content.trim() || null,
        ar_marker_id: fault.ar_marker_id,
        ar_position: { x: 0, y: 1, z: 0 },
      });
      setFaultAnnotations((prev) => {
        const next = [created, ...prev];
        setHologramMessage(`${fault.title} now has ${next.length} AR annotation${next.length === 1 ? '' : 's'}.`);
        return next;
      });
      setAnnotationForm(ANNOTATION_DEFAULTS);
      setActionMessage(`Annotation saved to fault #${fault.id}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to create annotation';
      setActionMessage(detail);
    } finally {
      setAnnotationSubmitting(false);
    }
  };

  const handleCreateFaultReport = async (event) => {
    event.preventDefault();
    const markerId = detectedMarker?.name;

    if (!markerId) {
      setActionMessage('Scan a prepared fault marker first.');
      return;
    }

    if (detectedMarker?.fault) {
      setActionMessage('This marker already has a linked fault.');
      return;
    }

    if (!faultReport.title.trim()) {
      setActionMessage('Add a fault title before saving.');
      return;
    }

    try {
      setFaultSubmitting(true);
      setActionMessage('');
      const createdFault = await createFaultRequest(token, {
        title: faultReport.title.trim(),
        description: faultReport.description.trim() || null,
        severity: faultReport.severity,
        location: faultReport.location,
        location_detail: faultReport.location_detail.trim() || null,
        ar_marker_id: String(markerId),
      });

      setDetectedMarker({ name: markerId, fault: createdFault });
      setFaultReport(FAULT_REPORT_DEFAULTS);
      setHologramMessage(
        `${createdFault.title} (${createdFault.severity}) • ${createdFault.location}${createdFault.location_detail ? ` - ${createdFault.location_detail}` : ''}`,
      );
      setActionMessage(`Fault #${createdFault.id} linked to marker #${createdFault.ar_marker_id}.`);
      setArStatus(`Created fault ${createdFault.id} for marker ${createdFault.ar_marker_id}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to create fault report';
      setActionMessage(detail);
    } finally {
      setFaultSubmitting(false);
    }
  };

  const handleFaultStatusUpdate = async (status) => {
    const fault = detectedMarker?.fault;
    if (!fault) {
      setActionMessage('Scan a fault marker first.');
      return;
    }

    try {
      const updatedFault = await updateFaultStatusRequest(token, fault.id, status);
      setDetectedMarker((prev) => ({ ...prev, fault: updatedFault }));
      setHologramMessage(
        `${updatedFault.title} (${updatedFault.severity}) • ${updatedFault.location}${updatedFault.location_detail ? ` - ${updatedFault.location_detail}` : ''}`,
      );
      const statusLabel = status.replace('_', ' ');
      setActionMessage(`Fault #${updatedFault.id} marked ${statusLabel}.`);
      setArStatus(`Updated fault ${updatedFault.id} to ${statusLabel}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to update fault status';
      setActionMessage(detail);
    }
  };

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
    setMissingTools((prev) => prev.filter((id) => id !== currentTool.id));
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

  const startChecklist = async () => {
    if (tools.length === 0) {
      setActionMessage('No tools registered. Add tools via Tool Management first.');
      return;
    }

    try {
      const session = await createToolSessionRequest(token, {
        session_name: `AR tool check - ${new Date().toLocaleString()}`,
        notes: 'Started from AR tool scanner.',
        items: tools.map((tool) => ({ tool_id: tool.id, expected_count: 1 })),
      });
      setToolSession(session);
      setConfirmed([]);
      setMissingTools([]);
      setCurrentIndex(0);
      setScanWarning('');
      setActionMessage(`Tool session #${session.id} started.`);
      setChecklistActive(true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to start tool session';
      setActionMessage(detail);
    }
  };

  const resetChecklist = () => {
    setChecklistActive(false);
    setToolSession(null);
    setConfirmed([]);
    setMissingTools([]);
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
      setMissingTools((prev) => (prev.includes(targetTool.id) ? prev : [...prev, targetTool.id]));
      setConfirmed((prev) => prev.filter((id) => id !== targetTool.id));
      setCurrentIndex((prev) => prev + 1);
      setActionMessage(`${targetTool.name} flagged as missing. Continuing to next tool.`);
      startToolScanCooldown(targetTool.name);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Action failed';
      setActionMessage(detail);
    }
  };

  const checklistComplete = checklistActive && currentIndex >= tools.length;

  useEffect(() => {
    if (!checklistComplete || !toolSession || isCompletingSession) return;

    const completeSession = async () => {
      try {
        setIsCompletingSession(true);
        const completed = await completeToolSessionRequest(token, toolSession.id, {
          verified_items: tools.map((tool) => ({
            tool_id: tool.id,
            actual_count: confirmed.includes(tool.id) ? 1 : 0,
          })),
          notes: missingTools.length > 0
            ? `Missing tools: ${tools.filter((tool) => missingTools.includes(tool.id)).map((tool) => tool.name).join(', ')}`
            : 'All tools accounted for in AR checklist.',
        });
        setToolSession(completed);
        setActionMessage(
          completed.status === 'completed'
            ? `Tool session #${completed.id} completed. All tools accounted for.`
            : `Tool session #${completed.id} incomplete. ${missingTools.length} tool${missingTools.length === 1 ? '' : 's'} missing.`,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unable to complete tool session';
        setActionMessage(detail);
      } finally {
        setIsCompletingSession(false);
      }
    };

    completeSession();
  }, [checklistComplete, confirmed, isCompletingSession, missingTools, token, toolSession, tools]);

  return (
    <div className="ar-camera-container">
      <section className={`ar-header ${isToolsPage ? 'ar-header-tools' : 'ar-header-faults'}`}>
        <div className="ar-header-copy">
          <p className="ar-kicker">{arHeaderContent.kicker}</p>
          <h1>{arHeaderContent.title}</h1>
          <p>{arHeaderContent.subtitle}</p>
        </div>
        <div className="ar-header-status" aria-label="AR mode summary">
          <div>
            <span>{arHeaderContent.primaryLabel}</span>
            <strong>{arHeaderContent.primaryStat}</strong>
          </div>
          <div>
            <span>{arHeaderContent.secondaryLabel}</span>
            <strong>{arHeaderContent.secondaryStat}</strong>
          </div>
        </div>
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

          {!isToolsPage && detectedMarker?.fault && (
            <div className="control-section fault-action-panel">
              <h3>Fault Action</h3>
              <div className="fault-summary">
                <p className="fault-summary-title">{detectedMarker.fault.title}</p>
                <div className="fault-summary-meta">
                  <span>{detectedMarker.fault.severity}</span>
                  <span>{detectedMarker.fault.status.replace('_', ' ')}</span>
                  <span>Marker #{detectedMarker.fault.ar_marker_id}</span>
                </div>
                <p className="fault-summary-row">
                  {detectedMarker.fault.location}
                  {detectedMarker.fault.location_detail ? ` - ${detectedMarker.fault.location_detail}` : ''}
                </p>
                {detectedMarker.fault.description && (
                  <p className="fault-summary-row">{detectedMarker.fault.description}</p>
                )}
              </div>
              <button
                className="control-btn"
                onClick={() => handleFaultStatusUpdate('in_progress')}
                disabled={detectedMarker.fault.status === 'in_progress' || detectedMarker.fault.status === 'resolved'}
              >
                Mark In Progress
              </button>
              <button
                className="control-btn"
                onClick={() => handleFaultStatusUpdate('resolved')}
                disabled={detectedMarker.fault.status === 'resolved'}
              >
                Mark Resolved
              </button>

              <div className="control-section annotations-panel">
                <h3>AR Notes &amp; Annotations</h3>
                <p className="annotation-subtitle">
                  Attach quick notes, hazards, or measurements to the active fault record.
                </p>
                {faultAnnotations.length === 0 ? (
                  <p className="annotation-empty">No annotations yet for this fault.</p>
                ) : (
                  <ul className="annotation-list">
                    {faultAnnotations.map((annotation) => (
                      <li key={annotation.id} className="annotation-item">
                        <div className="annotation-meta">
                          <span className="annotation-type">{annotation.annotation_type.replace('_', ' ')}</span>
                          <span className="annotation-time">{formatAnnotationTime(annotation.created_at)}</span>
                        </div>
                        <strong>{annotation.title || 'Untitled note'}</strong>
                        {annotation.content && <p>{annotation.content}</p>}
                      </li>
                    ))}
                  </ul>
                )}

                <form className="annotation-form" onSubmit={handleCreateAnnotation}>
                  <label htmlFor="annotation-type" className="control-label">Type</label>
                  <select
                    id="annotation-type"
                    value={annotationForm.annotation_type}
                    onChange={(event) => handleAnnotationChange('annotation_type', event.target.value)}
                  >
                    <option value="note">Note</option>
                    <option value="fault_marker">Fault marker</option>
                    <option value="measurement">Measurement</option>
                    <option value="hazard">Hazard</option>
                    <option value="repair_guide">Repair guide</option>
                  </select>

                  <label htmlFor="annotation-title" className="control-label">Title</label>
                  <input
                    id="annotation-title"
                    type="text"
                    value={annotationForm.title}
                    onChange={(event) => handleAnnotationChange('title', event.target.value)}
                    placeholder="e.g. Loose panel near upper hinge"
                  />

                  <label htmlFor="annotation-content" className="control-label">Details</label>
                  <textarea
                    id="annotation-content"
                    rows="3"
                    value={annotationForm.content}
                    onChange={(event) => handleAnnotationChange('content', event.target.value)}
                    placeholder="Add any critical context for the next engineer."
                  />

                  <button className="control-btn" type="submit" disabled={annotationSubmitting}>
                    {annotationSubmitting ? 'Saving Annotation...' : 'Save Annotation'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {!isToolsPage && detectedMarker && !detectedMarker.fault && (
            <div className="control-section fault-action-panel">
              <h3>Report New Fault</h3>
              <div className="last-marker-panel">
                <p className="tool-scan-instruction">Last scanned marker</p>
                <p className="tool-scan-name">Marker #{detectedMarker.name}</p>
                <p className="tool-scan-marker">
                  This marker will be linked when the report is saved.
                </p>
              </div>
              <form className="fault-report-form" onSubmit={handleCreateFaultReport}>
                <label htmlFor="fault-report-title">Fault Title</label>
                <input
                  id="fault-report-title"
                  type="text"
                  placeholder="e.g. Damaged cabinet door"
                  value={faultReport.title}
                  onChange={(event) => handleFaultReportChange('title', event.target.value)}
                />

                <label htmlFor="fault-report-severity">Severity</label>
                <select
                  id="fault-report-severity"
                  value={faultReport.severity}
                  onChange={(event) => handleFaultReportChange('severity', event.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>

                <label htmlFor="fault-report-location">Location Type</label>
                <select
                  id="fault-report-location"
                  value={faultReport.location}
                  onChange={(event) => handleFaultReportChange('location', event.target.value)}
                >
                  <option value="station">Station</option>
                  <option value="platform">Platform</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="track">Track</option>
                  <option value="tunnel">Tunnel</option>
                  <option value="service_corridor">Service Corridor</option>
                  <option value="plant_room">Plant Room</option>
                  <option value="other">Other</option>
                </select>

                <label htmlFor="fault-report-location-detail">Location Detail</label>
                <input
                  id="fault-report-location-detail"
                  type="text"
                  placeholder="e.g. Platform A, west stairs"
                  value={faultReport.location_detail}
                  onChange={(event) => handleFaultReportChange('location_detail', event.target.value)}
                />

                <label htmlFor="fault-report-description">Description</label>
                <textarea
                  id="fault-report-description"
                  rows="3"
                  placeholder="Describe what the next technician needs to know."
                  value={faultReport.description}
                  onChange={(event) => handleFaultReportChange('description', event.target.value)}
                />

                <button className="control-btn" type="submit" disabled={faultSubmitting}>
                  {faultSubmitting ? 'Saving Fault...' : 'Save Fault To Marker'}
                </button>
              </form>
            </div>
          )}

          {isToolsPage && (
            <div className="control-section">
              <h3>Tool Check</h3>

              {toolSession && (
                <div className="tool-session-panel">
                  <p className="tool-scan-instruction">Active session</p>
                  <p className="tool-scan-name">Session #{toolSession.id}</p>
                  <p className="tool-scan-marker">
                    Status: <strong>{toolSession.status.replace('_', ' ')}</strong>
                  </p>
                </div>
              )}

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
