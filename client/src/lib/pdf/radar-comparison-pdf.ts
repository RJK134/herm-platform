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
  // Footer band (bottom-up):
  //   [bottom margin]
  //   attribution line N (baseline at pageHeight - margin)
  //   …
  //   attribution line 1
  //   [gap]
  //   "Page X of N"
  //   [top of footer band]
  //
  // CRITICAL: `splitTextToSize` uses the *current* font size to measure
  // character widths, so we MUST switch to the 8pt footer size before
  // wrapping or we'll wrap at default ~16pt width.
  const footerLineHeight = 10;
  const footerFontSize = 8;
  const pageNumberGap = 14; // vertical space between page number and first attribution line
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
  // Height of the attribution block, measured from its top baseline
  // down to the bottom page margin (including the bottom margin as
  // breathing room under the last line).
  const attributionBlockHeight =
    attributionLines.length > 0
      ? attributionLines.length * footerLineHeight + margin
      : 0;
  // Page number occupies one line + a gap above the attribution block
  // (or just one line of height at the bottom if no attribution).
  const pageNumberBlockHeight =
    attributionLines.length > 0
      ? footerLineHeight + pageNumberGap
      : margin; // no attribution: small bottom margin is enough
  // Total vertical footprint of the footer region, measured from the
  // bottom of the page upward. Body content must not cross this.
  const footerHeight = attributionBlockHeight + pageNumberBlockHeight;
  // Any body element drawn at `y` must keep `y <= bodyMaxY`.
  const bodyMaxY = pageHeight - footerHeight;
  // Conservative thresholds per element type — each leaves a bit more
  // headroom than its own row height so the page break fires BEFORE
  // the last fitting row.
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
  // derivatives of CC-licensed HERM content. Layout (bottom-up):
  //   last attribution baseline ≈ pageHeight - margin
  //   …wrapped attribution lines above…
  //   page number on the line immediately above the first attribution
  //   body content above bodyMaxY
  // The page number lives *above* the attribution with a real gap so
  // the two never share a Y coordinate.
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);

    // Attribution block — bottom-anchored to the page margin so the
    // last baseline sits at `pageHeight - margin`.
    let attributionFirstBaseline: number | null = null;
    if (attributionLines.length > 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(footerFontSize);
      doc.setTextColor(120);
      const attributionLastBaseline = pageHeight - margin;
      attributionFirstBaseline =
        attributionLastBaseline - (attributionLines.length - 1) * footerLineHeight;
      doc.text(attributionLines, margin, attributionFirstBaseline);
    }

    // Page number. When attribution is present, sit directly above the
    // attribution block with a `pageNumberGap` buffer so they never
    // share a Y. When absent, the old behaviour (below the bottom
    // margin) is fine.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(footerFontSize);
    doc.setTextColor(120);
    const pageNumberY =
      attributionFirstBaseline !== null
        ? attributionFirstBaseline - pageNumberGap
        : pageHeight - margin + 8;
    doc.text(
      `Page ${p} of ${pageCount}`,
      pageWidth - margin,
      pageNumberY,
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
