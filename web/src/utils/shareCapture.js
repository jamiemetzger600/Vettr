import html2canvas from 'html2canvas';

function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(text) {
  return new TextEncoder().encode(text);
}

/**
 * Wrap a JPEG in a one-page PDF sized to the image (points = pixels * 72/96).
 */
export function jpegToPdfBlob(jpegBytes, widthPx, heightPx) {
  const jpeg = jpegBytes instanceof Uint8Array ? jpegBytes : new Uint8Array(jpegBytes);
  const pageW = Math.max(1, Math.round((widthPx * 72) / 96));
  const pageH = Math.max(1, Math.round((heightPx * 72) / 96));
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q\n`;
  const contentBytes = ascii(content);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
    `<< /Length ${contentBytes.length} >>\nstream\n${content}endstream`,
    null
  ];

  const imgDict = ascii(
    `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
  );
  const imgEnd = ascii('\nendstream');

  const chunks = [ascii('%PDF-1.4\n')];
  const offsets = [0];
  let pos = chunks[0].length;

  const pushObj = (num, bodyBytes) => {
    const header = ascii(`${num} 0 obj\n`);
    const footer = ascii('\nendobj\n');
    offsets[num] = pos;
    chunks.push(header, bodyBytes, footer);
    pos += header.length + bodyBytes.length + footer.length;
  };

  objects.forEach((body, i) => {
    const num = i + 1;
    if (num === 5) {
      pushObj(5, concatBytes([imgDict, jpeg, imgEnd]));
      return;
    }
    pushObj(num, ascii(body));
  });

  const xrefStart = pos;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(ascii(xref));
  return new Blob([concatBytes(chunks)], { type: 'application/pdf' });
}

export async function captureElementJpeg(el, { scale = 2, backgroundColor = '#1a1a1a' } = {}) {
  if (!el) throw new Error('Nothing to capture');
  console.log('[shareCapture] capturing element', el.className);
  const canvas = await html2canvas(el, {
    backgroundColor,
    scale,
    useCORS: true,
    logging: false
  });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error('Could not capture image'))),
      'image/jpeg',
      0.92
    );
  });
  return { blob, width: canvas.width, height: canvas.height };
}

export async function captureElementPng(el, { scale = 2, backgroundColor = '#1a1a1a' } = {}) {
  if (!el) throw new Error('Nothing to capture');
  const canvas = await html2canvas(el, {
    backgroundColor,
    scale,
    useCORS: true,
    logging: false
  });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error('Could not capture image'))),
      'image/png'
    );
  });
  return { blob, width: canvas.width, height: canvas.height };
}

export async function captureElementPdf(el, opts) {
  const jpeg = await captureElementJpeg(el, opts);
  const bytes = new Uint8Array(await jpeg.blob.arrayBuffer());
  const pdf = jpegToPdfBlob(bytes, jpeg.width, jpeg.height);
  console.log('[shareCapture] pdf bytes', pdf.size);
  return pdf;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  console.log('[shareCapture] downloaded', filename, blob.size);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export async function nativeShare({ title, text, url, files } = {}) {
  if (typeof navigator.share !== 'function') return false;
  const payload = { title, text, url };
  if (Array.isArray(files) && files.length && navigator.canShare?.({ files })) {
    payload.files = files;
  }
  try {
    await navigator.share(payload);
    console.log('[shareCapture] native share ok', { files: Boolean(payload.files) });
    return true;
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.log('[shareCapture] native share cancelled');
      return true;
    }
    console.warn('[shareCapture] native share failed', err?.message);
    return false;
  }
}

export function mailtoCompare({ subject, body }) {
  const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}
