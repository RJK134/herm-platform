import { describe, it, expect } from 'vitest';
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isProjectStatus,
  nextStates,
  normaliseStatus,
  PROJECT_STATUSES,
} from './project-status';

describe('project-status state machine', () => {
  describe('isProjectStatus', () => {
    it('accepts every published state', () => {
      for (const s of PROJECT_STATUSES) {
        expect(isProjectStatus(s)).toBe(true);
      }
    });

    it('rejects unknown strings', () => {
      expect(isProjectStatus('foo')).toBe(false);
      expect(isProjectStatus('')).toBe(false);
      expect(isProjectStatus(null)).toBe(false);
      expect(isProjectStatus(undefined)).toBe(false);
      expect(isProjectStatus(42)).toBe(false);
    });
  });

  describe('normaliseStatus', () => {
    it('passes published states through unchanged', () => {
      expect(normaliseStatus('draft')).toBe('draft');
      expect(normaliseStatus('recommendation_issued')).toBe('recommendation_issued');
    });

    it('maps legacy active → active_review', () => {
      expect(normaliseStatus('active')).toBe('active_review');
    });

    it('maps legacy planning → draft', () => {
      expect(normaliseStatus('planning')).toBe('draft');
    });

    it('maps legacy complete/completed → recommendation_issued', () => {
      expect(normaliseStatus('complete')).toBe('recommendation_issued');
      expect(normaliseStatus('completed')).toBe('recommendation_issued');
    });

    it('maps legacy cancelled → archived', () => {
      expect(normaliseStatus('cancelled')).toBe('archived');
    });

    it('falls back to draft for null / unknown', () => {
      expect(normaliseStatus(null)).toBe('draft');
      expect(normaliseStatus(undefined)).toBe('draft');
      expect(normaliseStatus('')).toBe('draft');
      expect(normaliseStatus('totally_made_up')).toBe('draft');
    });
  });

  describe('canTransition / nextStates', () => {
    it('allows the forward happy path', () => {
      expect(canTransition('draft', 'active_review')).toBe(true);
      expect(canTransition('active_review', 'shortlist_proposed')).toBe(true);
      expect(canTransition('shortlist_proposed', 'shortlist_approved')).toBe(true);
      expect(canTransition('shortlist_approved', 'recommendation_issued')).toBe(true);
      expect(canTransition('recommendation_issued', 'archived')).toBe(true);
    });

    it('allows revising back to the prior shortlist state', () => {
      expect(canTransition('shortlist_proposed', 'active_review')).toBe(true);
      expect(canTransition('shortlist_approved', 'shortlist_proposed')).toBe(true);
    });

    it('allows archiving from any non-terminal state', () => {
      expect(canTransition('draft', 'archived')).toBe(true);
      expect(canTransition('active_review', 'archived')).toBe(true);
      expect(canTransition('shortlist_proposed', 'archived')).toBe(true);
      expect(canTransition('shortlist_approved', 'archived')).toBe(true);
      expect(canTransition('recommendation_issued', 'archived')).toBe(true);
    });

    it('forbids skipping forward', () => {
      expect(canTransition('draft', 'shortlist_proposed')).toBe(false);
      expect(canTransition('draft', 'recommendation_issued')).toBe(false);
      expect(canTransition('active_review', 'recommendation_issued')).toBe(false);
    });

    it('forbids self-transitions', () => {
      for (const s of PROJECT_STATUSES) {
        expect(canTransition(s, s)).toBe(false);
      }
    });

    it('treats archived as terminal', () => {
      expect(nextStates('archived')).toEqual([]);
      expect(canTransition('archived', 'draft')).toBe(false);
      expect(canTransition('archived', 'active_review')).toBe(false);
    });

    it('recommendation_issued can only archive', () => {
      expect(nextStates('recommendation_issued')).toEqual(['archived']);
    });
  });

  describe('assertTransition', () => {
    it('returns the typed pair for a valid move', () => {
      const result = assertTransition('draft', 'active_review');
      expect(result).toEqual({ from: 'draft', to: 'active_review' });
    });

    it('normalises a legacy from-status before checking', () => {
      // legacy 'active' → 'active_review' → 'shortlist_proposed' is valid
      const result = assertTransition('active', 'shortlist_proposed');
      expect(result).toEqual({ from: 'active_review', to: 'shortlist_proposed' });
    });

    it('throws InvalidTransitionError on a forbidden move', () => {
      expect(() => assertTransition('draft', 'recommendation_issued')).toThrow(
        InvalidTransitionError,
      );
    });

    it('throws InvalidTransitionError on an unknown target state', () => {
      expect(() => assertTransition('draft', 'banana')).toThrow(InvalidTransitionError);
    });

    it('carries from/to on the error for the 409 envelope', () => {
      try {
        assertTransition('archived', 'draft');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidTransitionError);
        const e = err as InvalidTransitionError;
        expect(e.from).toBe('archived');
        expect(e.to).toBe('draft');
      }
    });
  });
});
