// Renders a PDF into a container by drawing each page onto its own <canvas>,
// scaled to fit the container's width — deliberately not relying on any
// browser's native embedded PDF viewer (via <iframe src="...pdf">), since
// those vary wildly in capability and ignore standard sizing hints
// inconsistently (Chrome's respects #view=FitH; Safari's built-in viewer
// does not). Rendering the pages ourselves with PDF.js gives the same,
// correct fit-to-width behavior in every browser.
//
// A plain classic script (not `type="module"`), loaded after
// vendor/pdfjs/pdf.min.js — deliberately, since this app is opened via
// `file://` (double-clicking index.html) as often as via a server, and
// `import`/`type="module"` is blocked by CORS under `file://` in Chrome
// and Safari. pdf.min.js's classic build sets the global `pdfjsLib`
// itself, same pattern as everything else in this project.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

// The PDF itself is never fetched at runtime — see math-background-pdf-data.js
// for why (file:// blocks XMLHttpRequest/fetch to local files, a separate
// restriction from the module-loading CORS issue above). Its bytes are
// embedded as a base64 global instead, decoded here once and reused.
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Caches the loaded (parsed) document — re-opening the overlay re-renders
// the canvases (cheap, and picks up the container's current width if the
// window was resized since last open) but doesn't re-parse the PDF itself.
let cachedPdfPromise = null;

const PAGE_PADDING = 16; // must match #about-frame's CSS padding

window.renderMathBackgroundPdf = async function renderMathBackgroundPdf(container) {
  container.innerHTML = '';
  const status = document.createElement('div');
  status.className = 'pdf-viewer-status';
  status.textContent = 'Loading…';
  container.appendChild(status);

  try {
    if (!cachedPdfPromise) {
      const bytes = base64ToUint8Array(window.MATH_BACKGROUND_PDF_BASE64);
      cachedPdfPromise = pdfjsLib.getDocument({ data: bytes }).promise;
    }
    const pdf = await cachedPdfPromise;
    container.innerHTML = '';

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(100, container.clientWidth - PAGE_PADDING * 2);

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: scale * dpr });

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = Math.ceil(viewport.width / dpr) + 'px';
      canvas.style.height = Math.ceil(viewport.height / dpr) + 'px';

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      container.appendChild(canvas);
    }
  } catch (err) {
    container.innerHTML = '';
    const errEl = document.createElement('div');
    errEl.className = 'pdf-viewer-status';
    errEl.textContent = 'Could not load the PDF: ' + err.message;
    container.appendChild(errEl);
  }
};
