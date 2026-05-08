import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteFaultRequest, listFaultsRequest } from '../services/faultsApi';
import { createMarkerRequest, listMarkersRequest, updateMarkerRequest } from '../services/markersApi';
import { generateArucoDataUrl } from '../utils/arucoGenerator';
import './MarkersPage.css';

const ARUCO_RANGE = Array.from({ length: 64 }, (_, i) => i);

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const isArucoMarkerId = (markerId) => {
  const value = Number.parseInt(markerId, 10);
  return String(value) === String(markerId) && Number.isInteger(value) && value >= 0 && value <= 63;
};

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const MarkersPage = () => {
  const token = useMemo(() => localStorage.getItem('authToken') || '', []);
  const [markers, setMarkers] = useState([]);
  const [faults, setFaults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState('');
  const [editForm, setEditForm] = useState({
    label: '',
    location_detail: '',
    description: '',
    is_active: true,
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [markerForm, setMarkerForm] = useState({
    marker_id: '',
    description: '',
    label: '',
    location_detail: '',
  });

  const markerById = useMemo(() => (
    new Map(markers.map((marker) => [String(marker.marker_id), marker]))
  ), [markers]);

  const faultByMarkerId = useMemo(() => (
    new Map(faults.filter((fault) => fault.ar_marker_id).map((fault) => [String(fault.ar_marker_id), fault]))
  ), [faults]);

  const previewDataUrl = markerForm.marker_id !== ''
    ? generateArucoDataUrl(Number.parseInt(markerForm.marker_id, 10), { cellSize: 32 })
    : null;

  const refreshMarkers = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [markerResponse, faultResponse] = await Promise.all([
        listMarkersRequest(token, false),
        listFaultsRequest(token),
      ]);
      setMarkers(markerResponse);
      setFaults(faultResponse);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to load markers';
      setErrorMessage(detail);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshMarkers();
  }, [refreshMarkers]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (markerForm.marker_id === '') {
      setErrorMessage('Choose an ArUco marker number.');
      return;
    }

    if (markerById.has(String(markerForm.marker_id))) {
      setErrorMessage('That marker number is already registered.');
      return;
    }

    try {
      setIsSubmitting(true);
      const marker = await createMarkerRequest(token, {
        marker_id: markerForm.marker_id,
        label: markerForm.label.trim() || `Blank fault marker #${markerForm.marker_id}`,
        description: markerForm.description.trim() || null,
        location_detail: markerForm.location_detail.trim() || null,
        is_active: true,
      });

      setSuccessMessage(`Blank fault marker #${marker.marker_id} is ready to print and place in the field.`);
      setMarkerForm({
        marker_id: '',
        description: '',
        label: '',
        location_detail: '',
      });
      await refreshMarkers();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to create marker';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintMarker = (marker) => {
    setErrorMessage('');
    if (!isArucoMarkerId(marker.marker_id)) {
      setErrorMessage('Only numeric ArUco markers can be printed from this page.');
      return;
    }

    const markerImageSrc = generateArucoDataUrl(Number.parseInt(marker.marker_id, 10), { cellSize: 60 });
    const sheetHtml = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Print Fault Marker - ${escapeHtml(marker.marker_id)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #111; text-align: center; background: #fff; }
          .card { display: inline-block; border: 3px solid #111; border-radius: 8px; padding: 32px 48px; }
          .marker-img { display: block; margin: 0 auto 12px; width: 220px; height: 220px; image-rendering: pixelated; }
          .marker-title { font-size: 28px; font-weight: 800; margin: 0 0 8px; }
          .marker-label { font-size: 16px; color: #555; margin: 0 0 12px; }
          .marker-note { font-size: 13px; color: #555; max-width: 340px; line-height: 1.5; margin: 0 auto; }
          @media print { body { margin: 8mm; } .print-hint { display: none; } }
        </style>
      </head>
      <body>
        <p class="print-hint" style="color:#888;font-size:13px;">Press Ctrl+P or use browser print to print this label.</p>
        <div class="card">
          <img class="marker-img" src="${markerImageSrc}" alt="Fault ArUco marker #${escapeHtml(String(marker.marker_id))}" />
          <p class="marker-title">Fault Marker #${escapeHtml(String(marker.marker_id))}</p>
          <p class="marker-label">${escapeHtml(marker.label || 'Fault marker')}</p>
          <p class="marker-note">Place this blank marker on a discovered fault, then scan it in Faults mode to create the report.</p>
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
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 60000);
  };

  const handleDeleteFault = async (fault) => {
    const confirmed = window.confirm(
      `Delete fault #${fault.id} "${fault.title}"? The marker will become blank and ready to reuse.`,
    );
    if (!confirmed) return;

    setErrorMessage('');
    setSuccessMessage('');

    try {
      await deleteFaultRequest(token, fault.id);
      setSuccessMessage(`Fault #${fault.id} deleted. Marker #${fault.ar_marker_id} is blank again.`);
      await refreshMarkers();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to delete fault';
      setErrorMessage(detail);
    }
  };

  const startEditMarker = (marker) => {
    setErrorMessage('');
    setSuccessMessage('');
    setEditingMarkerId(String(marker.marker_id));
    setEditForm({
      label: marker.label || '',
      location_detail: marker.location_detail || '',
      description: marker.description || '',
      is_active: Boolean(marker.is_active),
    });
  };

  const cancelEditMarker = () => {
    setEditingMarkerId('');
    setEditForm({
      label: '',
      location_detail: '',
      description: '',
      is_active: true,
    });
  };

  const handleUpdateMarker = async (event) => {
    event.preventDefault();
    if (!editingMarkerId) return;

    try {
      setIsSavingEdit(true);
      setErrorMessage('');
      setSuccessMessage('');
      await updateMarkerRequest(token, editingMarkerId, {
        label: editForm.label.trim() || null,
        location_detail: editForm.location_detail.trim() || null,
        description: editForm.description.trim() || null,
        is_active: editForm.is_active,
      });
      setSuccessMessage(`Marker #${editingMarkerId} updated.`);
      cancelEditMarker();
      await refreshMarkers();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to update marker';
      setErrorMessage(detail);
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="markers-page">
      <section className="markers-hero">
        <h1>Manage Faults</h1>
        <p>
          Prepare blank AR.js 3x3 ArUco markers for technicians to place on newly discovered faults.
        </p>
      </section>

      <section className="markers-grid">
        <article className="marker-panel">
          <h2>Prepare Blank Marker</h2>
          <p className="marker-help-text">
            Register a marker number (0-63), print it, and keep it ready for a technician to link to a real fault in the field.
          </p>
          <form onSubmit={handleCreate} className="marker-form">
            <label htmlFor="marker-id">ArUco Marker Number</label>
            <select
              id="marker-id"
              value={markerForm.marker_id}
              onChange={(event) => setMarkerForm({ ...markerForm, marker_id: event.target.value })}
            >
              <option value="">Select a number</option>
              {ARUCO_RANGE.map((n) => {
                const existingMarker = markerById.get(String(n));
                const linkedFault = faultByMarkerId.get(String(n));
                return (
                  <option key={n} value={String(n)} disabled={Boolean(existingMarker)}>
                    {`#${n}${linkedFault ? ' (fault linked)' : existingMarker ? ' (marker exists)' : ''}`}
                  </option>
                );
              })}
            </select>

            <label htmlFor="marker-label">Marker Label</label>
            <input
              id="marker-label"
              type="text"
              placeholder="e.g. Blank field marker pack A"
              value={markerForm.label}
              onChange={(event) => setMarkerForm({ ...markerForm, label: event.target.value })}
            />

            <label htmlFor="marker-location">Storage / Pack Detail</label>
            <input
              id="marker-location"
              type="text"
              placeholder="e.g. Admin office marker folder"
              value={markerForm.location_detail}
              onChange={(event) => setMarkerForm({ ...markerForm, location_detail: event.target.value })}
            />

            <label htmlFor="marker-description">Notes</label>
            <textarea
              id="marker-description"
              rows="3"
              placeholder="Optional notes for this blank marker."
              value={markerForm.description}
              onChange={(event) => setMarkerForm({ ...markerForm, description: event.target.value })}
            />

            {previewDataUrl && (
              <div className="aruco-marker-preview">
                <img src={previewDataUrl} alt={`ArUco marker #${markerForm.marker_id}`} />
                <span>Fault marker #{markerForm.marker_id}</span>
              </div>
            )}

            <button type="submit" className="marker-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Preparing...' : 'Prepare Blank Marker'}
            </button>
          </form>
        </article>
      </section>

      {(errorMessage || successMessage) && (
        <section className="marker-feedback">
          {errorMessage && <p className="marker-error">{errorMessage}</p>}
          {successMessage && <p className="marker-success">{successMessage}</p>}
        </section>
      )}

      <section className="marker-panel marker-list-panel">
        <div className="marker-list-header">
          <h2>Prepared Fault Markers</h2>
          <div className="marker-list-actions">
            <button type="button" className="marker-btn marker-btn-secondary" onClick={refreshMarkers}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading markers...</p>
        ) : markers.length === 0 ? (
          <p>No markers found yet.</p>
        ) : (
          <div className="marker-table-wrap">
            <table className="marker-table">
              <thead>
                <tr>
                  <th>Marker ID</th>
                  <th>Preview</th>
                  <th>Label</th>
                  <th>Fault Details</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {markers.map((marker) => {
                  const canPrint = isArucoMarkerId(marker.marker_id);
                  const linkedFault = faultByMarkerId.get(String(marker.marker_id));
                  return (
                    <React.Fragment key={marker.id}>
                    <tr>
                      <td>{marker.marker_id}</td>
                      <td>
                        {canPrint ? (
                          <img
                            className="marker-preview"
                            src={generateArucoDataUrl(Number.parseInt(marker.marker_id, 10), { cellSize: 18 })}
                            alt={`ArUco marker ${marker.marker_id}`}
                          />
                        ) : (
                          <span className="legacy-marker-note">Legacy pattern</span>
                        )}
                      </td>
                      <td>{marker.label || '-'}</td>
                      <td>
                        {linkedFault ? (
                          <div className="fault-detail-cell">
                            <div className="fault-detail-heading">
                              <strong>#{linkedFault.id} {linkedFault.title}</strong>
                              <span className={`fault-status-pill fault-status-${linkedFault.status}`}>
                                {linkedFault.status.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="fault-detail-meta">
                              <span>{linkedFault.severity}</span>
                              <span>{linkedFault.location}</span>
                              <span>{formatDateTime(linkedFault.created_at)}</span>
                            </div>
                            {linkedFault.location_detail && (
                              <p className="fault-detail-row">{linkedFault.location_detail}</p>
                            )}
                            {linkedFault.description && (
                              <p className="fault-detail-description">{linkedFault.description}</p>
                            )}
                          </div>
                        ) : (
                          <span className="blank-marker-note">Blank - ready for technician</span>
                        )}
                      </td>
                      <td>{marker.is_active ? 'Yes' : 'No'}</td>
                      <td>
                        <div className="marker-row-actions">
                          {canPrint && (
                            <button
                              className="marker-btn marker-btn-secondary"
                              onClick={() => handlePrintMarker(marker)}
                              type="button"
                            >
                              Print
                            </button>
                          )}
                          {linkedFault && (
                            <button
                              className="marker-btn marker-btn-danger"
                              onClick={() => handleDeleteFault(linkedFault)}
                              type="button"
                            >
                              Delete Fault
                            </button>
                          )}
                          {!linkedFault && (
                            <button
                              className="marker-btn marker-btn-secondary"
                              onClick={() => startEditMarker(marker)}
                              type="button"
                            >
                              Edit Marker
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editingMarkerId === String(marker.marker_id) && !linkedFault && (
                      <tr className="marker-edit-row">
                        <td colSpan="6">
                          <form className="marker-edit-form" onSubmit={handleUpdateMarker}>
                            <label htmlFor={`edit-label-${marker.marker_id}`}>Label</label>
                            <input
                              id={`edit-label-${marker.marker_id}`}
                              type="text"
                              value={editForm.label}
                              onChange={(event) => setEditForm({ ...editForm, label: event.target.value })}
                              placeholder="e.g. Blank marker pack A"
                            />

                            <label htmlFor={`edit-location-${marker.marker_id}`}>Storage / Pack Detail</label>
                            <input
                              id={`edit-location-${marker.marker_id}`}
                              type="text"
                              value={editForm.location_detail}
                              onChange={(event) => setEditForm({ ...editForm, location_detail: event.target.value })}
                              placeholder="e.g. Admin office marker folder"
                            />

                            <label htmlFor={`edit-description-${marker.marker_id}`}>Notes</label>
                            <textarea
                              id={`edit-description-${marker.marker_id}`}
                              rows="3"
                              value={editForm.description}
                              onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                              placeholder="Optional notes for this blank marker."
                            />

                            <label className="marker-edit-checkbox" htmlFor={`edit-active-${marker.marker_id}`}>
                              <input
                                id={`edit-active-${marker.marker_id}`}
                                type="checkbox"
                                checked={editForm.is_active}
                                onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })}
                              />
                              Active for AR scanning
                            </label>

                            <div className="marker-edit-actions">
                              <button className="marker-btn" type="submit" disabled={isSavingEdit}>
                                {isSavingEdit ? 'Saving...' : 'Save Marker'}
                              </button>
                              <button
                                className="marker-btn marker-btn-secondary"
                                type="button"
                                onClick={cancelEditMarker}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default MarkersPage;
