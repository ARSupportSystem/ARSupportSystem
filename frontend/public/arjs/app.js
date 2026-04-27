const statusElement = document.getElementById('status');
const faultDetailsElement = document.getElementById('faultDetails');
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || 'faults';
const modeText = mode === 'tools' ? 'Tools mode' : 'Faults mode';
const API_BASE_URL = params.get('apiBase') || 'http://localhost:8000';
const authToken = localStorage.getItem('authToken') || '';

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const severityClass = (severity) => `severity-${String(severity || '').toLowerCase()}`;

const sendStatus = (message) => {
  statusElement.textContent = message;
  window.parent.postMessage({ type: 'arjs-status', message }, window.location.origin);
};

const notifyMarkerFound = (marker) => {
  window.parent.postMessage({ type: 'arjs-marker-found', marker }, window.location.origin);
};

const setFaultDetails = (content, isHtml = false) => {
  if (!faultDetailsElement) {
    return;
  }

  if (!content) {
    faultDetailsElement.style.display = 'none';
    faultDetailsElement.textContent = '';
    return;
  }

  faultDetailsElement.style.display = 'inline-block';
  if (isHtml) {
    faultDetailsElement.innerHTML = content;
  } else {
    faultDetailsElement.textContent = content;
  }
};

const renderFaultError = (markerId, detail) => {
  setFaultDetails(
    `<p class="fault-card-title">Marker ${escapeHtml(markerId)}</p><p class="fault-error">${escapeHtml(detail)}</p>`,
    true,
  );
};

const fetchFaultByMarker = async (markerId) => {
  if (!authToken) {
    renderFaultError(markerId, 'Sign in required to load backend fault details.');
    return;
  }

  setFaultDetails(`<p class="fault-card-title">Marker ${escapeHtml(markerId)}</p><p class="fault-row">Loading fault details...</p>`, true);

  try {
    const response = await fetch(`${API_BASE_URL}/api/faults/marker/${encodeURIComponent(markerId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const detail = typeof payload === 'object' && payload !== null
        ? payload.detail || JSON.stringify(payload)
        : payload || 'Unable to load fault details';
      renderFaultError(markerId, detail);
      return;
    }

    if (!payload || typeof payload !== 'object') {
      renderFaultError(markerId, 'Unexpected backend response format. Check API base URL.');
      return;
    }

    setFaultDetails(
      `
        <p class="fault-card-title">Fault #${escapeHtml(payload.id)} · ${escapeHtml(payload.title)}</p>
        <div class="fault-meta">
          <span class="fault-chip ${severityClass(payload.severity)}">${escapeHtml(payload.severity)}</span>
          <span class="fault-chip">${escapeHtml(payload.status)}</span>
          <span class="fault-chip">marker: ${escapeHtml(markerId)}</span>
        </div>
        <p class="fault-row"><span class="fault-label">Location:</span> ${escapeHtml(payload.location)}${payload.location_detail ? ` (${escapeHtml(payload.location_detail)})` : ''}</p>
        ${payload.description ? `<p class="fault-row"><span class="fault-label">Description:</span> ${escapeHtml(payload.description)}</p>` : ''}
      `,
      true,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load fault details';
    renderFaultError(markerId, message);
  }
};

const wireMarker = (elementId, markerId, label) => {
  const markerElement = document.getElementById(elementId);
  if (!markerElement) {
    return;
  }

  markerElement.addEventListener('markerFound', () => {
    sendStatus(`${label} marker found.`);
    notifyMarkerFound(markerId);
    fetchFaultByMarker(markerId);
  });

  markerElement.addEventListener('markerLost', () => {
    sendStatus(`${label} marker lost.`);
  });
};

const monitorCameraVideo = ({ onReady, onTimeout }) => {
  const cameraBootstrapTimeout = window.setTimeout(() => {
    sendStatus('Camera not detected yet. Waiting for permission/stream...');
  }, 2500);

  const cameraFailTimeout = window.setTimeout(() => {
    onTimeout();
  }, 7000);

  const stopTimeouts = () => {
    window.clearTimeout(cameraBootstrapTimeout);
    window.clearTimeout(cameraFailTimeout);
  };

  const checkVideo = () => {
    const streamVideo = document.querySelector('video');

    if (!streamVideo) {
      window.requestAnimationFrame(checkVideo);
      return;
    }

    const onCameraReady = () => {
      stopTimeouts();
      onReady(streamVideo);
    };

    if (streamVideo.readyState >= 2 && !streamVideo.paused) {
      onCameraReady();
      return;
    }

    streamVideo.addEventListener('playing', onCameraReady, { once: true });
  };

  checkVideo();
};

window.addEventListener('load', () => {
  sendStatus(`AR.js initializing (${modeText})...`);

  const backButton = document.getElementById('backBtn');
  if (backButton) {
    backButton.addEventListener('click', () => window.history.back());
  }

  wireMarker('marker-hiro', 'hiro', 'Hiro');
  wireMarker('marker-kanji', 'kanji', 'Kanji');

  monitorCameraVideo({
    onReady: (streamVideo) => {
      sendStatus(`AR.js ready (${modeText}). Point camera at Hiro or Kanji marker.`);

      streamVideo.addEventListener('pause', () => {
        sendStatus('Camera stream paused unexpectedly. Re-open AR camera.');
      });

      streamVideo.addEventListener('ended', () => {
        sendStatus('Camera stream ended unexpectedly. Re-open AR camera.');
      });
    },
    onTimeout: () => {
      sendStatus('Camera stream did not start. Check browser camera permission.');
    },
  });
});
