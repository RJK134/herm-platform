import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './ai-assistant';

describe('buildSystemPrompt', () => {
  it('includes the active framework name verbatim', () => {
    const prompt = buildSystemPrompt('UCISA HERM v3.1');
    expect(prompt).toContain('"UCISA HERM v3.1"');
  });

  it('uses the non-HERM name when FHE is active (regression for Bugbot "HERM coverage" finding)', () => {
    const prompt = buildSystemPrompt('FHE Capability Framework');
    expect(prompt).toContain('"FHE Capability Framework"');
    // The product branding line is fixed ("FH Procure Assistant" — the
    // Phase 15.1 rebrand from "HERM Procurement Assistant"); what must
    // be dynamic is the *active framework* label.
    expect(prompt).toContain('FH Procure Assistant');
  });

  it('keeps the "never recommend a specific vendor" guardrail regardless of framework', () => {
    const prompt = buildSystemPrompt('Any Framework');
    expect(prompt).toMatch(/never recommend a specific vendor/i);
  });
});
