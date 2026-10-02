import { downloadBlob, jpegToPdfBlob } from '../../../utils/shareCapture.js';
import { barSegments, dayMarker } from './ddGantt.js';

const SCALE = 2;

export function formatShareDate(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/** One row per milestone bar: name plus the start and end drawn on the chart. */
export function ganttShareRows(stages) {
  return (stages || []).map((stage) => ({
    milestone: stage.label || 'Milestone',
    start: formatShareDate(stage.barStart),
    end: formatShareDate(stage.barEnd)
  }));
}

export function ganttShareFilename(title, format) {
  const base = String(title || 'due-diligence')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'due-diligence';
  const ext = format === 'jpeg' ? 'jpg' : format;
  return `${base}-timeline.${ext}`;
}

function fitText(ctx, text, maxWidth) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  let next = value;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}…`;
}

const MONTHS = ['#7ec8e3', '#6f9fe8', '#8b7fd6', '#5eae9a', '#d4a24c', '#d48aa8'];
const BG = '#1a1a1a';
const PANEL = '#2a2a2a';
const TEXT = '#e4e4e4';
const MUTED = '#a8a8a8';
const LINE = '#3d3d3d';

function hexToRgb(hex) {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function mixHex(fg, bg, amount) {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  const c = a.map((channel, index) => Math.round(channel * amount + b[index] * (1 - amount)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Draw the same weekly Gantt the workspace shows: milestone names, month colors, bars, close diamond.
 */
export function drawGanttChart({ weeks = [], stages = [], holidays = [] } = {}) {
  const labelW = 210 * SCALE;
  const weekW = 112 * SCALE;
  const headH = 54 * SCALE;
  const rowH = 40 * SCALE;
  const trackW = Math.max(weeks.length, 1) * weekW;
  const width = labelW + trackW;
  const height = headH + Math.max(stages.length, 1) * rowH;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = MUTED;
  ctx.font = `600 ${11 * SCALE}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('MILESTONE', 12 * SCALE, headH / 2);

  weeks.forEach((week, index) => {
    const x = labelW + index * weekW;
    const month = MONTHS[week.month % MONTHS.length];
    ctx.fillStyle = mixHex(month, PANEL, 0.28);
    ctx.fillRect(x, 0, weekW, 28 * SCALE);
    ctx.fillStyle = month;
    ctx.fillRect(x, 28 * SCALE, weekW, headH - 28 * SCALE);
    ctx.fillStyle = TEXT;
    ctx.font = `650 ${12 * SCALE}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(fitText(ctx, week.label, weekW - 8 * SCALE), x + weekW / 2, 14 * SCALE);
    ctx.font = `700 ${11 * SCALE}px system-ui, sans-serif`;
    ctx.fillStyle = '#1a1a1a';
    const dayW = weekW / 5;
    (week.days || ['M', 'T', 'W', 'T', 'F']).forEach((day, dayIndex) => {
      const dx = x + dayIndex * dayW + dayW / 2;
      if (week.todayDay === dayIndex) {
        ctx.save();
        ctx.translate(dx, 28 * SCALE + (headH - 28 * SCALE) / 2);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#f4f7fb';
        ctx.fillRect(-7 * SCALE, -7 * SCALE, 14 * SCALE, 14 * SCALE);
        ctx.restore();
        ctx.fillStyle = '#1a1a1a';
      }
      ctx.fillText(day, dx, 28 * SCALE + (headH - 28 * SCALE) / 2);
    });
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(x + weekW + 0.5, 0);
    ctx.lineTo(x + weekW + 0.5, height);
    ctx.stroke();
  });

  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(labelW + 0.5, 0);
  ctx.lineTo(labelW + 0.5, height);
  ctx.stroke();

  stages.forEach((stage, index) => {
    const y = headH + index * rowH;
    ctx.fillStyle = index % 2 === 0 ? BG : '#202020';
    ctx.fillRect(0, y, labelW, rowH);
    weeks.forEach((week, weekIndex) => {
      const month = MONTHS[week.month % MONTHS.length];
      ctx.fillStyle = mixHex(month, BG, week.today ? 0.16 : 0.08);
      ctx.fillRect(labelW + weekIndex * weekW, y, weekW, rowH);
    });
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(0, y + rowH + 0.5);
    ctx.lineTo(width, y + rowH + 0.5);
    ctx.stroke();

    const count = stage.total ? `${stage.complete}/${stage.total}` : '0';
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT;
    ctx.font = `600 ${13 * SCALE}px system-ui, sans-serif`;
    ctx.fillText(fitText(ctx, stage.label || 'Milestone', labelW - 64 * SCALE), 12 * SCALE, y + rowH / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = `600 ${12 * SCALE}px system-ui, sans-serif`;
    ctx.fillText(count, labelW - 10 * SCALE, y + rowH / 2);

    const isClose = stage.id === 'close';
    const hasSpan = stage.barStart != null && stage.barEnd != null && stage.barEnd > stage.barStart;
    const segments = stage.barStart != null && stage.barEnd != null && (!isClose || hasSpan)
      ? barSegments(stage.barStart, stage.barEnd, weeks)
      : [];
    segments.forEach((segment) => {
      const month = MONTHS[(segment.month ?? 0) % MONTHS.length];
      const bx = labelW + (segment.left / 100) * trackW;
      const bw = Math.max((segment.width / 100) * trackW, 4 * SCALE);
      const by = y + (rowH - 16 * SCALE) / 2;
      ctx.fillStyle = month;
      roundRect(ctx, bx, by, bw, 16 * SCALE, 3 * SCALE);
      ctx.fill();
    });

    if (isClose && stage.milestoneAt != null) {
      const placed = dayMarker(stage.milestoneAt, weeks);
      if (placed) {
        const dx = labelW + (placed.left / 100) * trackW;
        const dy = y + rowH / 2;
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#f4f7fb';
        ctx.fillRect(-7 * SCALE, -7 * SCALE, 14 * SCALE, 14 * SCALE);
        ctx.restore();
      }
    }
  });

  holidays.forEach((holiday) => {
    if (holiday.left == null) return;
    const x = labelW + (Number.parseFloat(holiday.left) / 100) * trackW;
    ctx.fillStyle = holiday.weight === 'partial' ? 'rgba(228, 228, 228, 0.14)' : 'rgba(228, 228, 228, 0.28)';
    ctx.fillRect(x - 3 * SCALE, headH, 6 * SCALE, height - headH);
    ctx.save();
    ctx.translate(x, headH + 8 * SCALE);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT;
    ctx.font = `650 ${10 * SCALE}px system-ui, sans-serif`;
    ctx.fillText(fitText(ctx, holiday.name || 'Holiday', height - headH - 16 * SCALE), 0, 0);
    ctx.restore();
  });

  console.log('[exportGanttShare] drew chart', { weeks: weeks.length, stages: stages.length, holidays: holidays.length });
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not build the export'))),
      type,
      quality
    );
  });
}

/**
 * Chart image on top, milestone start/end table underneath.
 * Light page so a bank, broker, or seller can print it.
 */
export function composeGanttShareCanvas(chartCanvas, { title = '', rows = [], exportedAt = new Date() } = {}) {
  const pad = 32 * SCALE;
  const titleSize = 22 * SCALE;
  const subSize = 13 * SCALE;
  const cellSize = 13 * SCALE;
  const rowH = 32 * SCALE;
  const headerH = 36 * SCALE;
  const gap = 20 * SCALE;
  const chartW = chartCanvas.width;
  const chartH = chartCanvas.height;
  const width = chartW + pad * 2;
  const tableTop = pad + titleSize + 8 * SCALE + subSize + gap + chartH + gap;
  const height = tableTop + headerH + Math.max(rows.length, 1) * rowH + pad;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#1a1a1a';
  ctx.font = `600 ${titleSize}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  const heading = title || 'Due diligence timeline';
  ctx.fillText(fitText(ctx, heading, width - pad * 2), pad, pad);

  ctx.fillStyle = '#5c5c5c';
  ctx.font = `${subSize}px system-ui, sans-serif`;
  const prepared = exportedAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  ctx.fillText(`Due diligence timeline · ${prepared}`, pad, pad + titleSize + 8 * SCALE);

  const chartY = pad + titleSize + 8 * SCALE + subSize + gap;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(pad, chartY, chartW, chartH);
  ctx.drawImage(chartCanvas, pad, chartY, chartW, chartH);

  const cols = [0.5, 0.25, 0.25];
  const labels = ['Milestone', 'Start', 'End'];
  const tableW = chartW;
  let x = pad;
  ctx.font = `600 ${cellSize}px system-ui, sans-serif`;
  cols.forEach((share, index) => {
    const colW = tableW * share;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x, tableTop, colW, headerH);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillText(labels[index], x + 12 * SCALE, tableTop + 10 * SCALE);
    x += colW;
  });

  const body = rows.length ? rows : [{ milestone: 'No milestone dates yet', start: '—', end: '—' }];
  ctx.font = `${cellSize}px system-ui, sans-serif`;
  body.forEach((row, rowIndex) => {
    const y = tableTop + headerH + rowIndex * rowH;
    ctx.fillStyle = rowIndex % 2 === 0 ? '#ffffff' : '#ececec';
    ctx.fillRect(pad, y, tableW, rowH);
    ctx.strokeStyle = '#d5d5d5';
    ctx.strokeRect(pad, y, tableW, rowH);
    const values = [row.milestone, row.start, row.end];
    let colX = pad;
    ctx.fillStyle = '#1a1a1a';
    cols.forEach((share, index) => {
      const colW = tableW * share;
      ctx.fillText(fitText(ctx, values[index], colW - 20 * SCALE), colX + 12 * SCALE, y + 9 * SCALE);
      colX += colW;
    });
  });

  console.log('[exportGanttShare] composed', { width, height, rows: body.length });
  return canvas;
}

export async function downloadGanttShare({ title, rows, format, chart }) {
  const drawn = drawGanttChart(chart || {});
  const page = composeGanttShareCanvas(drawn, { title, rows });
  const filename = ganttShareFilename(title, format);
  if (format === 'pdf') {
    const jpeg = await canvasToBlob(page, 'image/jpeg', 0.92);
    const pdf = jpegToPdfBlob(new Uint8Array(await jpeg.arrayBuffer()), page.width, page.height);
    downloadBlob(pdf, filename);
    return;
  }
  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(page, type, format === 'png' ? undefined : 0.92);
  downloadBlob(blob, filename);
}
