import React, { useEffect, useMemo, useState } from 'react';
import { listFaultsRequest } from '../services/faultsApi';
import { listMarkersRequest } from '../services/markersApi';
import { listToolsRequest, listToolSessionsRequest } from '../services/toolsApi';
import './HomePage.css';

const severityRank = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const isOpenFault = (fault) => fault.status !== 'resolved';

const HomePage = ({ currentUser }) => {
  const token = localStorage.getItem('authToken') || '';
  const isAdmin = currentUser?.role === 'admin';
  const [faults, setFaults] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [tools, setTools] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [faultData, markerData, toolData, sessionData] = await Promise.all([
          listFaultsRequest(token),
          listMarkersRequest(token, false),
          listToolsRequest(token, isAdmin ? {} : { owner_id: currentUser?.id }),
          listToolSessionsRequest(token, isAdmin ? {} : { technician_id: currentUser?.id }),
        ]);

        if (!isMounted) return;
        setFaults(faultData);
        setMarkers(markerData);
        setTools(toolData);
        setSessions(sessionData);
      } catch (error) {
        if (!isMounted) return;
        const detail = error instanceof Error ? error.message : 'Unable to load dashboard';
        setErrorMessage(detail);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, isAdmin, token]);

  const faultByMarkerId = useMemo(() => (
    new Map(faults.filter((fault) => fault.ar_marker_id).map((fault) => [String(fault.ar_marker_id), fault]))
  ), [faults]);

  const openFaults = useMemo(() => faults.filter(isOpenFault), [faults]);
  const criticalFaults = useMemo(() => (
    openFaults.filter((fault) => fault.severity === 'critical' || fault.severity === 'high')
  ), [openFaults]);
  const blankMarkers = useMemo(() => (
    markers.filter((marker) => marker.is_active && !faultByMarkerId.has(String(marker.marker_id)))
  ), [faultByMarkerId, markers]);
  const activeSessions = useMemo(() => (
    sessions.filter((session) => session.status === 'active')
  ), [sessions]);
  const incompleteSessions = useMemo(() => (
    sessions.filter((session) => session.status === 'incomplete')
  ), [sessions]);
  const recentFaults = useMemo(() => (
    [...faults]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
  ), [faults]);
  const priorityFaults = useMemo(() => (
    [...openFaults]
      .sort((a, b) => {
        const severityDelta = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
        if (severityDelta !== 0) return severityDelta;
        return new Date(a.created_at) - new Date(b.created_at);
      })
      .slice(0, 4)
  ), [openFaults]);

  const toolkitLabel = isAdmin ? 'Registered Tools' : 'My Toolkit';

  return (
    <div className="homepage dashboard-page">
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">{currentUser?.full_name || 'Signed in'} · {currentUser?.role}</p>
          <h1>Dashboard</h1>
          <p>
            Your working overview: immediate priorities, marker readiness, and tool accountability for the current user.
          </p>
        </div>
        <div className="dashboard-role-panel">
          <span>{isAdmin ? 'Supervisor View' : 'Technician View'}</span>
          <strong>{loading ? 'Loading' : 'Live'}</strong>
        </div>
      </section>

      {errorMessage && <p className="dashboard-error">{errorMessage}</p>}

      <section className="dashboard-metrics" aria-label="Operational summary">
        <article className="metric-card">
          <span className="metric-label">Open Faults</span>
          <strong>{openFaults.length}</strong>
          <p>{criticalFaults.length} high priority</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Blank Markers</span>
          <strong>{blankMarkers.length}</strong>
          <p>{markers.length - blankMarkers.length} already linked or inactive</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">{toolkitLabel}</span>
          <strong>{tools.length}</strong>
          <p>{tools.filter((tool) => tool.marker_id).length} with AR markers</p>
        </article>
        <article className="metric-card metric-card-alert">
          <span className="metric-label">Tool Safety</span>
          <strong>{incompleteSessions.length}</strong>
          <p>{activeSessions.length} active checks</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-panel">
          <div className="panel-heading">
            <h2>Priority Faults</h2>
            <span>{openFaults.length} unresolved</span>
          </div>
          {priorityFaults.length === 0 ? (
            <p className="empty-state">No unresolved faults.</p>
          ) : (
            <ul className="work-list">
              {priorityFaults.map((fault) => (
                <li key={fault.id}>
                  <div>
                    <strong>{fault.title}</strong>
                    <span>{fault.location}{fault.location_detail ? ` · ${fault.location_detail}` : ''}</span>
                  </div>
                  <span className={`status-chip severity-${fault.severity}`}>{fault.severity}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="dashboard-panel">
          <div className="panel-heading">
            <h2>Recent Fault Activity</h2>
            <span>{faults.length} total</span>
          </div>
          {recentFaults.length === 0 ? (
            <p className="empty-state">No fault reports yet.</p>
          ) : (
            <ul className="activity-list">
              {recentFaults.map((fault) => (
                <li key={fault.id}>
                  <span className={`activity-dot severity-${fault.severity}`} />
                  <div>
                    <strong>{fault.title}</strong>
                    <span>Marker #{fault.ar_marker_id || 'none'} · {fault.status.replace('_', ' ')} · {formatDateTime(fault.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="dashboard-panel">
          <div className="panel-heading">
            <h2>Marker Readiness</h2>
            <span>{markers.length} registered</span>
          </div>
          <div className="readiness-bars">
            <div>
              <span>Blank active</span>
              <strong>{blankMarkers.length}</strong>
            </div>
            <div>
              <span>Linked to faults</span>
              <strong>{markers.filter((marker) => faultByMarkerId.has(String(marker.marker_id))).length}</strong>
            </div>
            <div>
              <span>Inactive</span>
              <strong>{markers.filter((marker) => !marker.is_active).length}</strong>
            </div>
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="panel-heading">
            <h2>Tool Checks</h2>
            <span>{sessions.length} sessions</span>
          </div>
          <div className="readiness-bars">
            <div>
              <span>Active</span>
              <strong>{activeSessions.length}</strong>
            </div>
            <div>
              <span>Incomplete</span>
              <strong>{incompleteSessions.length}</strong>
            </div>
            <div>
              <span>Completed</span>
              <strong>{sessions.filter((session) => session.status === 'completed').length}</strong>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
};

export default HomePage;
