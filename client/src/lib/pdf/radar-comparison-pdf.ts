import { jsPDF } from 'jspdf';

/** Shape matching `useCompare()` entries — kept local so the helper has no React deps. */
export interface RadarComparisonEntry {
  system: {
    id: string;
    name: string;
    vendor?: string;
    category?: string;
    isOwnSystem?: boolean;
  };
  percentage: number;
  domainScores: Array<{
    domainCode: string;
    domainName: string;
    percentage: number;
  }>;
}

export interface RadarPdfOptions {
  /** Active framework name (HERM / FHE / …) rendered in the header + footer. */
  frameworkName: string;
  /** Attribution notice (the canonical HERM licence notice) rendered in the footer. */
  attribution?: string | null;
  /** Override for the generation date — defaults to `new Date()`. Used by tests. */
  now?: Date;
}

/**
 * Build the PDF as raw bytes. This is the kernel the other exports wrap;
 * tests use it directly to avoid jsdom's flaky Blob.arrayBuffer().
 */
export function buildRadarComparisonPdfBytes(
  entries: readonly RadarComparisonEntry[],
  opts: RadarPdfOptions,
): Uint8Array {
  const doc = renderRadarComparisonDoc(entries, opts);
  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}

/**
 * Build a PDF document from a radar-comparison dataset. Pure: returns a
 * `Blob` without touching the DOM, so it's unit-testable.
 *
 * Layout:
 *   - Title + subtitle + generated-at stamp
 *   - Framework name (procurement teams reviewing offline must know
 *     which framework the % are against)
 *   - Per-system header + overall %
 *   - Per-domain % table for that system
 *   - HERM attribution footer (required for any offline export of HERM
 *     derivative data — see HERM_COMPLIANCE.md)
 *
 * No fonts, no canvas, no images — just jsPDF's default Helvetica and
 * text primitives. That keeps the bundle light, avoids html2canvas's
 * cost, and gives a consistent, searchable PDF.
 */
export function buildRadarComparisonPdf(
  entries: readonly RadarComparisonEntry[],
  opts: RadarPdfOptions,
): Blob {
  return renderRadarComparisonDoc(entries, opts).output('blob');
}

function renderRadarComparisonDoc(
  entries: readonly RadarComparisonEntry[],
  opts: RadarPdfOptions,
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const now = opts.now ?? new Date();

  // ── Footer geometry (computed up-front) ────────────────────────────────
  // The attribution notice can wrap to several lines for real HERM
  // copy (~277 chars → 2–3 lines at 8pt). Derive the footer's vertical
  // footprint ONCE so every page-break threshold below agrees with
  // where the footer will actually land — otherwise long notices
  // overlap body text near the page bottom.
  //
  // CRITICAL: `splitTextToSize` uses the *current* font size to measure
  // character widths, so we MUST switch to the 8pt footer size before
  // wrapping or we'll wrap at default ~16pt width (roughly half as
  // many chars per line → double the lines → over-reserved footer →
  // wasted vertical space on every page).
  const footerLineHeight = 10;
  const pageNumberReserve = 20; // height for the "Page X of N" line
  const footerFontSize = 8;
  let attributionLines: string[] = [];
  if (opts.attribution) {
    const priorFontSize = doc.getFontSize();
    doc.setFontSize(footerFontSize);
    attributionLines = doc.splitTextToSize(
      opts.attribution,
      pageWidth - margin * 2,
    ) as string[];
    doc.setFontSize(priorFontSize);
  }
  // Total vertical footprint of the footer region, measured from the
  // bottom of the page upward. Includes attribution lines, the page
  // number, and a little breathing room so body text never kisses the
  // footer baseline.
  const footerHeight =
    attributionLines.length * footerLineHeight + pageNumberReserve + 12;
  // Any body element drawn at `y` must keep `y <= bodyMaxY` or the next
  // element's baseline will overlap the footer.
  const bodyMaxY = pageHeight - footerHeight;
  // Conservative thresholds for the various body elements — each
  // leaves a bit more headroom than its own row height so the page
  // break fires BEFORE the last fitting row.
  const summaryRowBreak = bodyMaxY - 14;
  const sectionHeaderBreak = bodyMaxY - 40;
  const domainRowBreak = bodyMaxY - 12;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Radar Comparison', margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(
    `Framework: ${opts.frameworkName} · Generated ${now.toISOString().slice(0, 10)}`,
    margin,
    y,
  );
  y += 18;

  // Systems summary table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(`Systems compared (${entries.length})`, margin, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  entries.forEach((entry, i) => {
    const rank = i + 1;
    const pct = `${entry.percentage.toFixed(1)}%`;
    const line = `${rank}. ${entry.system.name}${entry.system.vendor ? ` — ${entry.system.vendor}` : ''}  ·  ${pct}`;
    doc.text(line, margin, y);
    y += 14;
    if (y > summaryRowBreak) {
      doc.addPage();
      y = margin;
    }
  });

  y += 8;

  // Per-system domain breakdown
  entries.forEach((entry) => {
    if (y > sectionHeaderBreak) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(`${entry.system.name}`, margin, y);
    const headerOverall = `${entry.percentage.toFixed(1)}% overall`;
    doc.text(headerOverall, pageWidth - margin - doc.getTextWidth(headerOverall), y);
    y += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(70);
    entry.domainScores.forEach((dom) => {
      if (y > domainRowBreak) {
        doc.addPage();
        y = margin;
      }
      const label = `  ${dom.domainName}`;
      const value = `${dom.percentage.toFixed(1)}%`;
      doc.text(label, margin, y);
      doc.text(value, pageWidth - margin - doc.getTextWidth(value), y);
      y += 12;
    });

    y += 10;
  });

  // Footer on every page — HERM attribution is mandatory on offline
  // derivatives of CC-licensed HERM content. Positioned using the
  // `footerHeight` geometry computed above so body-content thresholds
  // and footer placement agree exactly.
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120);

    if (attributionLines.length > 0) {
      const footerY =
        pageHeight - footerHeight + footerLineHeight; // first baseline
      doc.text(attributionLines, margin, footerY);
    }

    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${p} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - margin + 8,
      { align: 'right' },
    );
  }

  return doc;
}

/**
 * Browser-side convenience: build the PDF and trigger a download. No-op
 * outside a browser context (tests use `buildRadarComparisonPdf` directly).
 */
export function downloadRadarComparisonPdf(
  entries: readonly RadarComparisonEntry[],
  opts: RadarPdfOptions,
  filename = 'radar-comparison.pdf',
): void {
  if (typeof window === 'undefined') return;
  const blob = buildRadarComparisonPdf(entries, opts);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Release the Blob URL after the click had a chance to dispatch.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
