import { describe, it, expect } from 'vitest';
import {
  buildRadarComparisonPdf,
  buildRadarComparisonPdfBytes,
  type RadarComparisonEntry,
} from '../radar-comparison-pdf';

const HERM_NOTICE =
  'Capability data licensed by CAUDIT under CC BY-NC-SA 4.0. Source: UCISA HERM v3.1.';

// The full canonical notice as persisted in Framework.licenceNotice
// (see prisma/seed.ts). At 8pt this wraps to ~3 lines — the test for
// footer/body overlap uses this to catch regression of the original
// BugBot finding on PR #21.
const HERM_NOTICE_FULL =
  'This work is based on the UCISA Higher Education Reference Model (HERM) v3.1, ' +
  'published by the Council of Australasian University Directors of Information ' +
  'Technology (CAUDIT) and licensed under the Creative Commons Attribution-' +
  'NonCommercial-ShareAlike 4.0 International License.';

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

  it('wraps the attribution at the footer font size, not the default', () => {
    // Regression for PR #21 BugBot finding: `splitTextToSize` uses the
    // current font size to measure widths. If called before
    // `setFontSize(8)` it wraps at default ~16pt width → ~half the
    // chars per line → double the footer height → too few body pages.
    //
    // Two passes of the same 180-row body, one with `attribution: null`
    // (zero-line footer) and one with the 277-char HERM notice
    // (wraps to 2–3 lines at 8pt). The page difference should be
    // tight — 1 extra page for a real-world footer, NOT 2–3 extra
    // pages that the old default-size-wrap bug would produce.
    const bigEntry: RadarComparisonEntry = {
      system: { id: 's1', name: 'Large', vendor: 'Acme' },
      percentage: 70,
      domainScores: Array.from({ length: 180 }, (_, i) => ({
        domainCode: `D${i}`,
        domainName: `Domain ${i}`,
        percentage: (i * 1.3) % 100,
      })),
    };

    const countPages = (bytes: Uint8Array): number => {
      const text = new TextDecoder('latin1').decode(bytes);
      return (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    };
    const none = countPages(
      buildRadarComparisonPdfBytes([bigEntry], {
        frameworkName: 'X',
        attribution: null,
      }),
    );
    const full = countPages(
      buildRadarComparisonPdfBytes([bigEntry], {
        frameworkName: 'HERM',
        attribution: HERM_NOTICE_FULL,
      }),
    );
    // The delta reflects the ~3-line footer at 8pt. Under the old
    // default-size bug the attribution wrapped to ~6 lines and this
    // delta would be much larger. Cap at 2 to lock down the fix.
    expect(full - none).toBeLessThanOrEqual(2);
    expect(full - none).toBeGreaterThanOrEqual(1);
  });

  it('reserves enough vertical space for a multi-line attribution (no body/footer overlap)', () => {
    // Regression for PR #21 BugBot finding: with the real 277-char HERM
    // notice (3 lines at 8pt), body rows could previously be placed
    // within the footer band. Construct an entry list whose domain
    // rows pack tightly enough to exercise the page-break threshold,
    // then assert that a longer attribution pushes to MORE pages than
    // an empty attribution does — i.e. the geometry actually reserves
    // room for the footer.
    const bigEntry: RadarComparisonEntry = {
      system: { id: 's1', name: 'Large', vendor: 'Acme' },
      percentage: 70,
      // 180 domain rows at ~12pt each ≈ 2160pt — guaranteed to spill
      // across 3+ pages on A4 (pageHeight ~842pt) so the break
      // threshold is load-bearing and the footer-reservation effect
      // is observable in the page count.
      domainScores: Array.from({ length: 180 }, (_, i) => ({
        domainCode: `D${i}`,
        domainName: `Domain ${i}`,
        percentage: (i * 1.3) % 100,
      })),
    };

    const countPages = (bytes: Uint8Array): number => {
      const text = new TextDecoder('latin1').decode(bytes);
      return (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    };

    const withoutAttribution = countPages(
      buildRadarComparisonPdfBytes([bigEntry], {
        frameworkName: 'Proprietary',
        attribution: null,
      }),
    );
    const withFullAttribution = countPages(
      buildRadarComparisonPdfBytes([bigEntry], {
        frameworkName: 'UCISA HERM v3.1',
        attribution: HERM_NOTICE_FULL,
      }),
    );

    // With a 3-line footer reserving ~40pt at the bottom of every
    // page, the same body content must occupy at least as many pages
    // as the no-footer case — and usually more, because fewer rows
    // fit per page once the footer band is carved out. The strict
    // inequality catches the overlap regression: if the threshold
    // ignored the footer, both counts would be equal.
    expect(withoutAttribution).toBeGreaterThan(0);
    expect(withFullAttribution).toBeGreaterThan(withoutAttribution);
  });
});
