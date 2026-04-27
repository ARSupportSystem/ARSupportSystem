import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listMarkersRequest, uploadMarkerImagesRequest } from '../services/markersApi';
import './MarkersPage.css';

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const MarkersPage = () => {
  const token = useMemo(() => localStorage.getItem('authToken') || '', []);
  const apiBaseUrl = useMemo(() => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000', []);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const refreshMarkers = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await listMarkersRequest(token, false);
      setMarkers(response);
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

  const handleUpload = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!selectedFiles.length) {
      setErrorMessage('Choose at least one marker image to upload.');
      return;
    }

    try {
      setIsUploading(true);
      const created = await uploadMarkerImagesRequest(token, selectedFiles);
      setSuccessMessage(`Uploaded ${created.length} marker image${created.length === 1 ? '' : 's'}.`);
      setSelectedFiles([]);
      await refreshMarkers();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Marker image upload failed';
      setErrorMessage(detail);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadPrintableSheet = () => {
    setErrorMessage('');
    const printableMarkers = markers.filter((marker) => marker.image_url);
    if (printableMarkers.length === 0) {
      setErrorMessage('No marker images are available to print yet.');
      return;
    }

    const popup = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!popup) {
      setErrorMessage('Popup blocked. Please allow popups to open printable marker sheet.');
      return;
    }

    const cards = printableMarkers.map((marker) => {
      const imageUrl = marker.image_url?.startsWith('http')
        ? marker.image_url
        : `${apiBaseUrl}${marker.image_url}`;

      return `
        <article class="marker-card">
          <img src="${escapeHtml(imageUrl)}" alt="Marker ${escapeHtml(marker.marker_id)}" />
          <h3>${escapeHtml(marker.marker_id)}</h3>
          <p>${escapeHtml(marker.label || 'Uploaded marker')}</p>
        </article>
      `;
    }).join('');

    const sheetHtml = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Marker Sheet</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #111827; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          .sub { margin: 0 0 20px; color: #4b5563; }
          .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
          .marker-card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; text-align: center; page-break-inside: avoid; }
          .marker-card img { width: 100%; max-width: 220px; height: 220px; object-fit: contain; margin: 0 auto 8px; display: block; }
          .marker-card h3 { margin: 0 0 4px; font-size: 16px; letter-spacing: 0.4px; }
          .marker-card p { margin: 0; font-size: 12px; color: #6b7280; }
          @media print {
            body { margin: 8mm; }
            .print-hint { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Printable Marker Sheet</h1>
        <p class="sub">Print this page (or Save as PDF) and distribute markers to technicians.</p>
        <p class="print-hint">Tip: Use browser print and choose "Save as PDF" for download.</p>
        <section class="grid">${cards}</section>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `;

    popup.document.open();
    popup.document.write(sheetHtml);
    popup.document.close();
  };

  return (
    <div className="markers-page">
      <section className="markers-hero">
        <h1>Admin Marker Management</h1>
        <p>
          Upload marker images to initialize IDs in the system. This creates blank marker records for technicians to use later.
        </p>
      </section>

      <section className="markers-grid">
        <article className="marker-panel">
          <h2>Upload Marker Images</h2>
          <p className="marker-help-text">
            Select one or many image files (<code>.png</code>, <code>.jpg</code>, <code>.jpeg</code>, <code>.webp</code>). Marker IDs are auto-generated.
          </p>
          <form onSubmit={handleUpload} className="marker-form">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
            />
            {selectedFiles.length > 0 && (
              <p className="marker-help-text">
                {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected.
              </p>
            )}
            <button type="submit" className="marker-btn" disabled={isUploading}>
              {isUploading ? 'Uploading…' : 'Upload Marker Images'}
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
          <h2>Registered Markers</h2>
          <div className="marker-list-actions">
            <button type="button" className="marker-btn marker-btn-secondary" onClick={handleDownloadPrintableSheet}>
              Download Printable Sheet
            </button>
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
                  <th>Source image</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {markers.map((marker) => (
                  <tr key={marker.id}>
                    <td>{marker.marker_id}</td>
                    <td>
                      {marker.image_url ? (
                        <img
                          className="marker-preview"
                          src={`${apiBaseUrl}${marker.image_url}`}
                          alt={`Marker ${marker.marker_id}`}
                        />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{marker.label || '-'}</td>
                    <td>{marker.is_active ? 'Yes' : 'No'}</td>
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

export default MarkersPage;
