import { describe, it, expect } from 'vitest';
import {
  buildRadarComparisonPdf,
  buildRadarComparisonPdfBytes,
  type RadarComparisonEntry,
} from '../radar-comparison-pdf';

const HERM_NOTICE =
  'Capability data licensed by CAUDIT under CC BY-NC-SA 4.0. Source: UCISA HERM v3.1.';

const baseEntries: RadarComparisonEntry[] = [
  {
    system: { id: 's1', name: 'Alpha SIS', vendor: 'Acme', category: 'SIS' },
    percentage: 82.3,
    domainScores: [
      { domainCode: 'LT', domainName: 'Learning & Teaching', percentage: 90 },
      { domainCode: 'RE', domainName: 'Research', percentage: 74.6 },
    ],
  },
  {
    system: { id: 's2', name: 'Beta LMS', vendor: 'Beta Co', category: 'LMS' },
    percentage: 61,
    domainScores: [
      { domainCode: 'LT', domainName: 'Learning & Teaching', percentage: 66 },
      { domainCode: 'RE', domainName: 'Research', percentage: 56 },
    ],
  },
];

/**
 * PDFs are mostly binary but their text content appears as plain
 * latin-1 strings in the raw stream; decode via latin1 and grep. Uses
 * the `*Bytes` variant so we don't depend on jsdom's flaky
 * `Blob.arrayBuffer()`.
 */
function pdfToText(
  entries: readonly RadarComparisonEntry[],
  opts: Parameters<typeof buildRadarComparisonPdfBytes>[1],
): string {
  const bytes = buildRadarComparisonPdfBytes(entries, opts);
  return new TextDecoder('latin1').decode(bytes);
}

describe('buildRadarComparisonPdf', () => {
  it('produces a non-empty PDF Blob', () => {
    const blob = buildRadarComparisonPdf(baseEntries, {
      frameworkName: 'UCISA HERM v3.1',
      attribution: HERM_NOTICE,
      now: new Date('2026-04-24T00:00:00Z'),
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500); // sanity: not an empty doc
  });

  it('embeds the framework name and generation date in the header', () => {
    const text = pdfToText(baseEntries, {
      frameworkName: 'UCISA HERM v3.1',
      attribution: HERM_NOTICE,
      now: new Date('2026-04-24T09:00:00Z'),
    });
    expect(text).toContain('UCISA HERM v3.1');
    expect(text).toContain('2026-04-24');
    expect(text).toContain('Radar Comparison');
  });

  it('includes every system name and the compared count', () => {
    const text = pdfToText(baseEntries, { frameworkName: 'HERM' });
    // PDF text operators escape `(` and `)` as `\(` / `\)`, so the
    // literal "(2)" appears escaped in the stream. Match the phrase
    // that doesn't depend on parentheses to avoid coupling to PDF
    // escape details.
    expect(text).toContain('Systems compared');
    // Each rendered "(2)" becomes "\\(2\\)" in the raw PDF bytes.
    expect(text).toMatch(/compared\s*\\?\(2\\?\)/);
    expect(text).toContain('Alpha SIS');
    expect(text).toContain('Beta LMS');
  });

  it('includes every domain label across the breakdown sections', () => {
    const text = pdfToText(baseEntries, { frameworkName: 'HERM' });
    expect(text).toContain('Learning & Teaching');
    expect(text).toContain('Research');
  });

  it('embeds the HERM attribution footer when provided', () => {
    const text = pdfToText(baseEntries, {
      frameworkName: 'UCISA HERM v3.1',
      attribution: HERM_NOTICE,
    });
    // Compliance guardrail: an offline derivative of HERM data must
    // carry the licence notice. If this test breaks we've silently
    // shipped an un-attributed export.
    expect(text).toContain('CC BY-NC-SA');
    expect(text).toContain('CAUDIT');
  });

  it('omits the attribution block when attribution is null (non-HERM framework)', () => {
    const text = pdfToText(baseEntries, {
      frameworkName: 'FHE Capability Framework',
      attribution: null,
    });
    // The literal CC notice must not appear when no attribution is
    // required (proprietary framework).
    expect(text).not.toContain('CC BY-NC-SA');
  });

  it('handles a single-entry comparison without error', () => {
    const text = pdfToText([baseEntries[0]!], { frameworkName: 'HERM' });
    expect(text).toContain('Systems compared');
    expect(text).toMatch(/compared\s*\\?\(1\\?\)/);
    expect(text).toContain('Alpha SIS');
  });

  it('handles an entry with no domain scores gracefully', () => {
    const bytes = buildRadarComparisonPdfBytes(
      [
        {
          system: { id: 's1', name: 'Empty', vendor: 'X' },
          percentage: 0,
          domainScores: [],
        },
      ],
      { frameworkName: 'HERM' },
    );
    expect(bytes.byteLength).toBeGreaterThan(500);
  });
});
