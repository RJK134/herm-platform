import { describe, it, expect } from 'vitest';
import { renderBusinessCasePdf, type PdfDocumentSection } from './render-business-case';

// Phase 14.3 — render-time tests for the Business Case PDF pilot. These
// don't validate the visual layout (that requires a render-comparison
// harness, deferred to a follow-up). They DO assert the renderer:
//   1. Produces a valid PDF magic byte sequence (`%PDF-`)
//   2. Survives the markdown subset we expect (headings, bold, bullets,
//      tables) without throwing
//   3. Emits a non-trivial buffer (so a silent empty-output regression
//      surfaces immediately)
//   4. Is deterministic enough that two runs of the same input produce
//      buffers within a tight size range (catches "we accidentally added
//      time/random data into the body" regressions)

function fixture(): PdfDocumentSection[] {
  return [
    {
      id: 'exec-summary',
      order: 1,
      title: '1. Executive Summary',
      content: [
        '**Decision required:** Approval to proceed.',
        '',
        '## Background',
        'The current SIS is approaching end-of-life and **no longer meets** the operational needs of the institution.',
        '',
        '### Drivers',
        '- Legacy lifecycle',
        '- Regulatory compliance',
        '- Student experience',
      ].join('\n'),
    },
    {
      id: 'financials',
      order: 2,
      title: '2. Financials',
      content: [
        '| Cost Component | Annual (£) |',
        '|---|---|',
        '| Licence | 250,000 |',
        '| Implementation (one-off) | 400,000 |',
        '| **Total 5yr TCO** | **2,150,000** |',
      ].join('\n'),
    },
  ];
}

describe('renderBusinessCasePdf', () => {
  it('produces a valid PDF buffer with the %PDF- magic header', async () => {
    const buf = await renderBusinessCasePdf({
      title: 'SIS Replacement Business Case',
      sections: fixture(),
      metaLine: 'Demo University · 10 May 2026',
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(2000); // pdfkit overhead alone is ~1.5 KB
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    // Trailer marker is the last few hundred bytes — sanity-check that
    // the document was actually closed (`doc.end()` ran)
    expect(buf.subarray(-512).toString('utf8')).toContain('%%EOF');
  });

  it('handles sections with no markdown features', async () => {
    const buf = await renderBusinessCasePdf({
      title: 'Plain Document',
      sections: [
        {
          id: 'one',
          order: 1,
          title: '1. Plain',
          content: 'Just a paragraph of body text with no markdown features at all.',
        },
      ],
    });
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });

  it('produces a multi-page document when there are multiple sections', async () => {
    const single = await renderBusinessCasePdf({
      title: 'Single section',
      sections: [{ id: 'a', order: 1, title: '1. Only', content: 'one paragraph.' }],
    });
    const triple = await renderBusinessCasePdf({
      title: 'Three sections',
      sections: [
        { id: 'a', order: 1, title: '1. First', content: 'first body' },
        { id: 'b', order: 2, title: '2. Second', content: 'second body' },
        { id: 'c', order: 3, title: '3. Third', content: 'third body' },
      ],
    });
    // /Type /Page count is the most reliable signal that section ordering
    // produced fresh pages (each section calls addPage). Each /Page object
    // appears once per page in the PDF object graph.
    const singlePages = (single.toString('binary').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const triplePages = (triple.toString('binary').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(triplePages).toBeGreaterThan(singlePages);
  });

  it('produces broadly stable output for identical inputs', async () => {
    const a = await renderBusinessCasePdf({ title: 'X', sections: fixture() });
    const b = await renderBusinessCasePdf({ title: 'X', sections: fixture() });
    // pdfkit stamps a CreationDate metadata field per render, so the
    // buffers won't be byte-identical — but the lengths should be very
    // close (within 100 bytes covers the timestamp wobble).
    expect(Math.abs(a.length - b.length)).toBeLessThan(100);
  });

  it('renders an empty-sections document without throwing', async () => {
    const buf = await renderBusinessCasePdf({ title: 'Empty', sections: [] });
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
