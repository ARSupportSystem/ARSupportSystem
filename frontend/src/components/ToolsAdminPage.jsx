import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createToolRequest, deleteToolRequest, listToolsRequest, updateToolImageRequest, updateToolRequest } from '../services/toolsApi';
import { listUsersRequest } from '../services/usersApi';
import { generateArucoDataUrl } from '../utils/arucoGenerator';
import './ToolsAdminPage.css';

// Valid AR.js 3x3 barcode marker values (0-63)
const ARUCO_RANGE = Array.from({ length: 64 }, (_, i) => i);

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const ToolsAdminPage = ({ currentUser }) => {
  const token = useMemo(() => localStorage.getItem('authToken') || '', []);
  const isAdmin = currentUser?.role === 'admin';
  const [tools, setTools] = useState([]);
  const [users, setUsers] = useState([]);
  const [usedValues, setUsedValues] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [toolForm, setToolForm] = useState({ name: '', marker_id: '', owner_id: '' });

  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const ownerOptions = useMemo(() => (
    users.filter((user) => user.is_active)
  ), [users]);

  const refreshTools = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await listToolsRequest(token);
      setTools(data);
      const ownerIdForMarkerPool = isAdmin && toolForm.owner_id
        ? Number.parseInt(toolForm.owner_id, 10)
        : currentUser?.id;
      setUsedValues(new Set(
        data
          .filter((t) => !ownerIdForMarkerPool || t.owner_id === ownerIdForMarkerPool)
          .map((t) => String(t.marker_id))
          .filter(Boolean),
      ));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to load tools';
      setErrorMessage(detail);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, isAdmin, token, toolForm.owner_id]);

  useEffect(() => {
    refreshTools();
  }, [refreshTools]);

  useEffect(() => {
    if (!isAdmin) return;

    listUsersRequest(token)
      .then((payload) => setUsers(payload.items || []))
      .catch((error) => {
        const detail = error instanceof Error ? error.message : 'Unable to load users';
        setErrorMessage(detail);
      });
  }, [isAdmin, token]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!toolForm.name.trim()) {
      setErrorMessage('Tool name is required.');
      return;
    }

    if (toolForm.marker_id === '') {
      setErrorMessage('Please select an ArUco marker number.');
      return;
    }

    if (isAdmin && !toolForm.owner_id) {
      setErrorMessage('Please choose which user owns this tool.');
      return;
    }

    try {
      setIsSubmitting(true);
      const markerId = toolForm.marker_id;
      const markerImage = generateArucoDataUrl(parseInt(markerId, 10), { cellSize: 60 });
      await createToolRequest(token, {
        name: toolForm.name.trim(),
        marker_id: markerId,
        marker_image: markerImage,
        owner_id: isAdmin ? Number.parseInt(toolForm.owner_id, 10) : undefined,
      });
      setSuccessMessage(`Tool "${toolForm.name.trim()}" created with ArUco marker #${markerId}.`);
      setToolForm({ name: '', marker_id: '', owner_id: isAdmin ? toolForm.owner_id : '' });
      await refreshTools();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to create tool';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (tool) => {
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await deleteToolRequest(token, tool.id);
      setSuccessMessage(`Tool "${tool.name}" deleted.`);
      await refreshTools();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to delete tool';
      setErrorMessage(detail);
    }
  };

  const handleBackfill = async () => {
    const missing = tools.filter((t) => t.marker_id !== null && t.marker_id !== undefined && !t.marker_image);
    if (missing.length === 0) {
      setSuccessMessage('All tools already have generated marker images.');
      return;
    }
    setIsBackfilling(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      for (const tool of missing) {
        const markerImage = generateArucoDataUrl(parseInt(tool.marker_id, 10), { cellSize: 60 });
        await updateToolImageRequest(token, tool.id, markerImage);
      }
      setSuccessMessage(`Generated and saved markers for ${missing.length} tool${missing.length !== 1 ? 's' : ''}.`);
      await refreshTools();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to generate missing markers';
      setErrorMessage(detail);
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleAssignOwner = async (tool, ownerId) => {
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const nextOwnerId = Number.parseInt(ownerId, 10);
      await updateToolRequest(token, tool.id, { owner_id: nextOwnerId });
      const ownerName = userById.get(nextOwnerId)?.full_name || `User #${nextOwnerId}`;
      setSuccessMessage(`Tool "${tool.name}" assigned to ${ownerName}.`);
      await refreshTools();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to assign tool';
      setErrorMessage(detail);
    }
  };

  const handleRegenerateAll = async () => {
    const markedTools = tools.filter((t) => {
      const markerValue = Number.parseInt(t.marker_id, 10);
      return Number.isInteger(markerValue) && markerValue >= 0 && markerValue <= 63;
    });
    if (markedTools.length === 0) {
      setErrorMessage('No marked tools found to regenerate.');
      return;
    }

    setIsRegenerating(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      for (const tool of markedTools) {
        const markerImage = generateArucoDataUrl(parseInt(tool.marker_id, 10), { cellSize: 60 });
        await updateToolImageRequest(token, tool.id, markerImage);
      }
      setSuccessMessage(`Regenerated markers for ${markedTools.length} tool${markedTools.length !== 1 ? 's' : ''}.`);
      await refreshTools();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to regenerate markers';
      setErrorMessage(detail);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handlePrintLabel = (tool) => {
    const markerImageSrc = tool.marker_image
      || generateArucoDataUrl(parseInt(tool.marker_id, 10), { cellSize: 60 });

    const sheetHtml = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>ArUco Label — ${escapeHtml(tool.name)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #111; text-align: center; background: #fff; }
          .card { display: inline-block; border: 3px solid #111; border-radius: 8px; padding: 32px 48px; }
          .tool-name { font-size: 28px; font-weight: 700; margin: 0 0 16px; }
          .marker-img { display: block; margin: 0 auto 12px; width: 200px; height: 200px; image-rendering: pixelated; }
          .aruco-label { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #555; margin: 0 0 4px; }
          .aruco-value { font-size: 24px; font-weight: 800; margin: 0 0 16px; }
          .instructions { font-size: 13px; color: #555; max-width: 340px; line-height: 1.5; margin: 0 auto; }
          @media print { body { margin: 8mm; } .print-hint { display: none; } }
        </style>
      </head>
      <body>
        <p class="print-hint" style="color:#888;font-size:13px;">Press Ctrl+P or use browser print to print this label.</p>
        <div class="card">
          <p class="tool-name">${escapeHtml(tool.name)}</p>
          <img class="marker-img" src="${markerImageSrc}" alt="ArUco marker #${escapeHtml(String(tool.marker_id))}" />
          <p class="aruco-label">ArUco ID</p>
          <p class="aruco-value">#${escapeHtml(String(tool.marker_id))} - 3x3 matrix</p>
          <p class="instructions">Scan with AR camera to look up tool details.</p>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(sheetHtml);
    iframe.contentWindow.document.close();
    iframe.contentWindow.onafterprint = () => document.body.removeChild(iframe);
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 60000);
  };

  const selectedValue = toolForm.marker_id;
  const previewDataUrl = selectedValue !== ''
    ? generateArucoDataUrl(parseInt(selectedValue, 10), { cellSize: 32 })
    : null;

  const missingCount = tools.filter((t) => t.marker_id !== null && t.marker_id !== undefined && !t.marker_image).length;

  return (
    <div className="tools-admin-page">
      <section className="tools-admin-hero">
        <h1>Tool Management</h1>
        <p>
          {isAdmin
            ? 'Manage every engineer toolkit, regenerate labels, and remove tools when needed.'
            : 'Build your personal toolkit before each job, print labels, and scan your own tools during AR checks.'}
        </p>
      </section>

      <section className="tools-admin-grid">
        <article className="tool-panel">
          <h2>Add New Tool</h2>
          <p className="tool-help-text">
            Choose an available marker number for your own toolkit (0-63). The marker image is generated automatically - no external tool needed.
          </p>
          <form onSubmit={handleCreate} className="tool-form">
            <label htmlFor="tool-name">Tool Name</label>
            <input
              id="tool-name"
              type="text"
              placeholder="e.g. Torque Wrench"
              value={toolForm.name}
              onChange={(event) => setToolForm({ ...toolForm, name: event.target.value })}
            />

            {isAdmin && (
              <>
                <label htmlFor="tool-owner">Assign To</label>
                <select
                  id="tool-owner"
                  value={toolForm.owner_id}
                  onChange={(event) => setToolForm({ ...toolForm, owner_id: event.target.value, marker_id: '' })}
                >
                  <option value="">Select a user</option>
                  {ownerOptions.map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.full_name} ({user.role})
                    </option>
                  ))}
                </select>
              </>
            )}

            <label htmlFor="tool-marker">ArUco Marker Number</label>
            <select
              id="tool-marker"
              value={toolForm.marker_id}
              onChange={(event) => setToolForm({ ...toolForm, marker_id: event.target.value })}
              disabled={isAdmin && !toolForm.owner_id}
            >
              <option value="">— Select a number —</option>
              {ARUCO_RANGE.map((n) => {
                const taken = usedValues.has(String(n));
                return (
                  <option key={n} value={String(n)} disabled={taken}>
                    {`#${n}${taken ? ' (in use)' : ''}`}
                  </option>
                );
              })}
            </select>

            {previewDataUrl && (
              <div className="aruco-live-preview">
                <img src={previewDataUrl} alt={`ArUco marker #${selectedValue}`} />
                <span className="aruco-live-preview-label">ArUco #{selectedValue} — 3×3 matrix</span>
              </div>
            )}

            <button type="submit" className="tool-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Tool'}
            </button>
          </form>
        </article>

        <article className="tool-panel">
          <h2>How ArUco Markers Work</h2>
          <p className="tool-help-text">
            ArUco markers are black-and-white square patterns. Each number (0-63) maps to a unique scannable pattern generated right here in the app.
          </p>
          <ol className="aruco-steps">
            <li>Add a tool and select an available marker number above.</li>
            <li>The marker image is generated and saved automatically.</li>
            <li>Click <strong>Print Label</strong> to print the real scannable pattern.</li>
            <li>Attach the printed marker to the physical tool.</li>
            <li>Technicians scan the marker during AR tool checks.</li>
          </ol>
        </article>
      </section>

      {(errorMessage || successMessage) && (
        <section className="tool-feedback">
          {errorMessage && <p className="tool-error">{errorMessage}</p>}
          {successMessage && <p className="tool-success">{successMessage}</p>}
        </section>
      )}

      <section className="tool-panel tool-list-panel">
        <div className="tool-list-header">
          <h2>{isAdmin ? 'All Registered Tools' : 'My Toolkit'}</h2>
          <div className="tool-list-actions">
            {missingCount > 0 && (
              <button
                type="button"
                className="tool-btn tool-btn-secondary"
                onClick={handleBackfill}
                disabled={isBackfilling}
              >
                {isBackfilling ? 'Generating…' : `Generate Missing (${missingCount})`}
              </button>
            )}
            <button type="button" className="tool-btn tool-btn-secondary" onClick={refreshTools}>
              Refresh
            </button>
            <button
              type="button"
              className="tool-btn tool-btn-secondary"
              onClick={handleRegenerateAll}
              disabled={isRegenerating}
            >
              {isRegenerating ? 'Regenerating...' : 'Regenerate All Markers'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="tool-help-text">Loading tools...</p>
        ) : tools.length === 0 ? (
          <p className="tool-help-text">No tools registered yet. Add one above.</p>
        ) : (
          <div className="tool-table-wrap">
            <table className="tool-table">
              <thead>
                <tr>
                  <th>Tool Name</th>
                  <th>Marker</th>
                  <th>ArUco ID</th>
                  {isAdmin && <th>Owner</th>}
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => (
                  <tr key={tool.id}>
                    <td>{tool.name}</td>
                    <td>
                      {tool.marker_image
                        ? (
                          <img
                            src={tool.marker_image}
                            alt={`ArUco #${tool.marker_id}`}
                            className="aruco-table-img"
                          />
                        )
                        : tool.marker_id !== null && tool.marker_id !== undefined
                          ? <span className="aruco-table-badge">#{tool.marker_id}</span>
                          : <span style={{ color: '#6b7280' }}>—</span>}
                    </td>
                    <td>
                      {tool.marker_id !== null && tool.marker_id !== undefined
                        ? <span className="aruco-table-badge">#{tool.marker_id}</span>
                        : <span style={{ color: '#6b7280' }}>—</span>}
                    </td>
                    {isAdmin && (
                      <td>
                        <select
                          className="tool-owner-select"
                          value={tool.owner_id || ''}
                          onChange={(event) => handleAssignOwner(tool, event.target.value)}
                        >
                          <option value="" disabled>Unassigned</option>
                          {ownerOptions.map((user) => (
                            <option key={user.id} value={String(user.id)}>
                              {user.full_name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td>{tool.created_at ? new Date(tool.created_at).toLocaleDateString() : '—'}</td>
                    <td className="tool-table-actions">
                      {tool.marker_id !== null && tool.marker_id !== undefined && (
                        <button
                          className="tool-btn tool-btn-secondary"
                          onClick={() => handlePrintLabel(tool)}
                          type="button"
                        >
                          Print Label
                        </button>
                      )}
                      <button
                        className="tool-btn tool-btn-danger"
                        onClick={() => handleDelete(tool)}
                        type="button"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default ToolsAdminPage;
