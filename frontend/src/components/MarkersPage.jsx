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

  const handlePrintMarker = (marker) => {
    setErrorMessage('');
    if (!marker.image_url) {
      setErrorMessage('This marker does not have an image to print.');
      return;
    }

    const imageUrl = marker.image_url?.startsWith('http')
      ? marker.image_url
      : `${apiBaseUrl}${marker.image_url}`;

    const sheetHtml = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Print Marker - ${escapeHtml(marker.marker_id)}</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #111827; text-align: center; }
          .marker-card { display: inline-block; border: 1px solid #d1d5db; border-radius: 8px; padding: 24px; }
          .marker-card img { width: 100%; max-width: 400px; height: auto; object-fit: contain; margin: 0 auto 16px; display: block; }
          .marker-card h3 { margin: 0 0 8px; font-size: 24px; letter-spacing: 0.4px; }
          .marker-card p { margin: 0; font-size: 16px; color: #6b7280; }
          @media print {
            body { margin: 8mm; }
            .print-hint { display: none; }
          }
        </style>
      </head>
      <body>
        <p class="print-hint">Tip: Use browser print and choose "Save as PDF" for download.</p>
        <div class="marker-card">
          <img src="${escapeHtml(imageUrl)}" alt="Marker ${escapeHtml(marker.marker_id)}" />
          <h3>${escapeHtml(marker.marker_id)}</h3>
          <p>${escapeHtml(marker.label || 'Uploaded marker')}</p>
        </div>
        <script>
          window.onload = () => {
            window.print();
            // Optional: you can communicate back to parent if needed, but setTimeout works to allow print dialog to open
          };
        </script>
      </body>
      </html>
    `;

    // Create a hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    
    document.body.appendChild(iframe);

    // Write the content to the iframe
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(sheetHtml);
    iframe.contentWindow.document.close();

    // After print finishes or after a timeout, remove the iframe
    // Note: window.onafterprint in the iframe is an option, but browsers handle iframe printing timeouts differently.
    // Easiest is to listen on the iframe's contentWindow window.onafterprint
    iframe.contentWindow.onafterprint = () => {
      document.body.removeChild(iframe);
    };
    
    // Fallback if onafterprint is not supported or not triggered
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 60000); // 1 minute timeout cleanup
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
            <button type="button" className="marker-btn marker-btn-secondary" onClick={refreshMarkers}>
              Refresh
            </button>
          </div>
        </div>        {loading ? (
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
                  <th>Actions</th>
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
                    <td>
                      {marker.image_url && (
                        <button 
                          className="marker-btn marker-btn-secondary" 
                          onClick={() => handlePrintMarker(marker)}
                        >
                          Print
                        </button>
                      )}
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

export default MarkersPage;
