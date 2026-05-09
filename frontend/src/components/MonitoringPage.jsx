import React, { useEffect, useMemo, useState } from 'react';
import { listAuditLogsRequest, listSecurityEventsRequest } from '../services/auditApi';
import { listFaultsRequest } from '../services/faultsApi';
import { listMarkersRequest } from '../services/markersApi';
import { listToolsRequest, listToolSessionsRequest } from '../services/toolsApi';
import './MonitoringPage.css';

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

const MonitoringPage = ({ currentUser }) => {
  const token = localStorage.getItem('authToken') || '';
  const isAdmin = currentUser?.role === 'admin';
  const canViewSecurity = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const [faults, setFaults] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [tools, setTools] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadMonitoring = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [faultData, markerData, toolData, sessionData, auditData, securityData] = await Promise.all([
          listFaultsRequest(token),
          listMarkersRequest(token, false),
          listToolsRequest(token, isAdmin ? {} : { owner_id: currentUser?.id }),
          listToolSessionsRequest(token, isAdmin ? {} : { technician_id: currentUser?.id }),
          isAdmin ? listAuditLogsRequest(token, { page_size: 8 }) : Promise.resolve({ items: [] }),
          canViewSecurity ? listSecurityEventsRequest(token, { page_size: 8 }) : Promise.resolve({ items: [] }),
        ]);

        if (!isMounted) return;
        setFaults(faultData);
        setMarkers(markerData);
        setTools(toolData);
        setSessions(sessionData);
        setAuditLogs(auditData?.items || []);
        setSecurityEvents(securityData?.items || []);
      } catch (error) {
        if (!isMounted) return;
        const detail = error instanceof Error ? error.message : 'Unable to load monitoring';
        setErrorMessage(detail);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadMonitoring();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, isAdmin, canViewSecurity, token]);

  const faultByMarkerId = useMemo(() => (
    new Map(faults.filter((fault) => fault.ar_marker_id).map((fault) => [String(fault.ar_marker_id), fault]))
  ), [faults]);

  const openFaults = useMemo(() => (
    faults.filter((fault) => fault.status !== 'resolved')
  ), [faults]);

  const priorityQueue = useMemo(() => (
    [...openFaults]
      .sort((a, b) => {
        const severityDelta = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
        if (severityDelta !== 0) return severityDelta;
        return new Date(a.created_at) - new Date(b.created_at);
      })
      .slice(0, 8)
  ), [openFaults]);

  const blankMarkers = useMemo(() => (
    markers.filter((marker) => marker.is_active && !faultByMarkerId.has(String(marker.marker_id)))
  ), [faultByMarkerId, markers]);

  const linkedMarkers = useMemo(() => (
    markers.filter((marker) => faultByMarkerId.has(String(marker.marker_id)))
  ), [faultByMarkerId, markers]);

  const activeSessions = useMemo(() => (
    sessions.filter((session) => session.status === 'active')
  ), [sessions]);

  const incompleteSessions = useMemo(() => (
    sessions.filter((session) => session.status === 'incomplete')
  ), [sessions]);

  const recentEvents = useMemo(() => {
    const faultEvents = faults.map((fault) => ({
      id: `fault-${fault.id}`,
      type: 'Fault',
      title: fault.title,
      detail: `Marker #${fault.ar_marker_id || 'none'} - ${fault.status.replace('_', ' ')} - severity ${fault.severity}`,
      time: fault.created_at,
      severity: fault.severity,
    }));

    const sessionEvents = sessions.map((session) => ({
      id: `session-${session.id}`,
      type: 'Tool Check',
      title: session.session_name,
      detail: `${session.status.replace('_', ' ')} - severity ${session.status === 'incomplete' ? 'high' : 'low'}`,
      time: session.completed_at || session.started_at,
      severity: session.status === 'incomplete' ? 'high' : 'low',
    }));

    return [...faultEvents, ...sessionEvents]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 8);
  }, [faults, sessions]);

  const securitySeverity = (action) => {
    if (action === 'BRUTE_FORCE_SUSPECTED') return 'high';
    if (action === 'UNAUTHORISED_ACCESS_ATTEMPT') return 'medium';
    return 'low';
  };

  return (
    <div className="monitoring-page">
      <section className="monitoring-header">
        <div>
          <p className="monitoring-kicker">{isAdmin ? 'Operational Monitoring' : 'My Monitoring'}</p>
          <h1>Monitoring</h1>
          <p>Admin control-room view of system-wide fault pressure, marker stock, and tool-check risk.</p>
        </div>
        <div className="monitoring-state">
          <span>{loading ? 'Refreshing' : 'Updated'}</span>
          <strong>{formatDateTime(new Date().toISOString())}</strong>
        </div>
      </section>

      {errorMessage && <p className="monitoring-error">{errorMessage}</p>}

      <section className="monitoring-strip">
        <article>
          <span>Open Faults</span>
          <strong>{openFaults.length}</strong>
        </article>
        <article>
          <span>Critical / High</span>
          <strong>{openFaults.filter((fault) => fault.severity === 'critical' || fault.severity === 'high').length}</strong>
        </article>
        <article>
          <span>Blank Markers</span>
          <strong>{blankMarkers.length}</strong>
        </article>
        <article>
          <span>Incomplete Tool Checks</span>
          <strong>{incompleteSessions.length}</strong>
        </article>
      </section>

      <section className="monitoring-layout">
        <article className="monitoring-panel monitoring-panel-wide">
          <div className="monitoring-panel-heading">
            <h2>Fault Queue</h2>
            <span>Highest risk first</span>
          </div>
          {priorityQueue.length === 0 ? (
            <p className="monitoring-empty">No unresolved faults in the queue.</p>
          ) : (
            <div className="monitoring-table-wrap">
              <table className="monitoring-table">
                <thead>
                  <tr>
                    <th>Fault</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityQueue.map((fault) => (
                    <tr key={fault.id}>
                      <td>
                        <strong>#{fault.id} {fault.title}</strong>
                        <span>Marker #{fault.ar_marker_id || 'none'}</span>
                      </td>
                      <td><span className={`monitoring-chip severity-${fault.severity}`}>{fault.severity}</span></td>
                      <td>{fault.status.replace('_', ' ')}</td>
                      <td>{fault.location}{fault.location_detail ? ` - ${fault.location_detail}` : ''}</td>
                      <td>{formatDateTime(fault.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="monitoring-panel">
          <div className="monitoring-panel-heading">
            <h2>Marker Stock</h2>
            <span>{markers.length} total</span>
          </div>
          <div className="monitoring-stack">
            <div><span>Blank active</span><strong>{blankMarkers.length}</strong></div>
            <div><span>Linked to faults</span><strong>{linkedMarkers.length}</strong></div>
            <div><span>Inactive</span><strong>{markers.filter((marker) => !marker.is_active).length}</strong></div>
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="monitoring-panel-heading">
            <h2>Tool Safety</h2>
            <span>{tools.length} tools</span>
          </div>
          <div className="monitoring-stack">
            <div><span>Active checks</span><strong>{activeSessions.length}</strong></div>
            <div><span>Incomplete checks</span><strong>{incompleteSessions.length}</strong></div>
            <div><span>Marked tools</span><strong>{tools.filter((tool) => tool.marker_id).length}</strong></div>
          </div>
        </article>

        <article className="monitoring-panel monitoring-panel-wide">
          <div className="monitoring-panel-heading">
            <h2>Recent Activity</h2>
            <span>Faults and tool checks</span>
          </div>
          {recentEvents.length === 0 ? (
            <p className="monitoring-empty">No recent activity.</p>
          ) : (
            <ul className="monitoring-feed">
              {recentEvents.map((event) => (
                <li key={event.id}>
                  <span className={`monitoring-feed-dot severity-${event.severity}`} aria-hidden="true" />
                  <div>
                    <strong>{event.type}: {event.title}</strong>
                    <span>{event.detail} - {formatDateTime(event.time)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        {canViewSecurity && (
          <article className="monitoring-panel">
            <div className="monitoring-panel-heading">
              <h2>Security Events</h2>
              <span>Last 24 hours</span>
            </div>
            {securityEvents.length === 0 ? (
              <p className="monitoring-empty">No security events logged.</p>
            ) : (
              <ul className="monitoring-feed">
                {securityEvents.map((event) => (
                  <li key={event.id}>
                    <span className={`monitoring-feed-dot severity-${securitySeverity(event.action)}`} aria-hidden="true" />
                    <div>
                      <strong>{event.action.replace(/_/g, ' ')}</strong>
                      <span>{event.ip_address || 'Unknown IP'} - {event.actor?.email || 'system'} - {formatDateTime(event.timestamp)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}

        {isAdmin && (
          <article className="monitoring-panel">
            <div className="monitoring-panel-heading">
              <h2>Audit Trail</h2>
              <span>Latest admin events</span>
            </div>
            {auditLogs.length === 0 ? (
              <p className="monitoring-empty">No audit entries found.</p>
            ) : (
              <ul className="monitoring-feed">
                {auditLogs.map((entry) => (
                  <li key={entry.id}>
                    <span className="monitoring-feed-dot severity-low" aria-hidden="true" />
                    <div>
                      <strong>{entry.action.replace(/_/g, ' ')}</strong>
                      <span>
                        {entry.actor?.email || `User ${entry.user_id ?? 'system'}`} - {entry.resource_type || 'general'} #{entry.resource_id ?? '-'} - {formatDateTime(entry.timestamp)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}
      </section>
    </div>
  );
};

export default MonitoringPage;
