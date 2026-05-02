/**
 * Phase 12.2 — pin the public metrics surface.
 *
 * Tests live alongside the module so contributors who edit a counter
 * also touch the assertion that documents the closed outcome set.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetMetricsForTests,
  observeHttpRequest,
  recordAuthLogin,
  recordSsoLogin,
  renderMetrics,
} from './metrics';

beforeEach(() => {
  __resetMetricsForTests();
});

describe('renderMetrics', () => {
  it('emits text/plain Prometheus format with the herm_ prefix', async () => {
    observeHttpRequest('GET', '/api/health', 200, 0.012);
    const text = await renderMetrics();
    // Standard Prometheus text format: HELP/TYPE comments + metric lines.
    expect(text).toMatch(/^# HELP herm_http_request_duration_seconds /m);
    expect(text).toMatch(/^# TYPE herm_http_request_duration_seconds histogram/m);
    // The herm_ prefix discipline applies to defaultMetrics too.
    expect(text).toMatch(/^# HELP herm_process_cpu_/m);
  });

  it('observed request shows up in the histogram + counter for the matching label set', async () => {
    observeHttpRequest('GET', '/api/health', 200, 0.012);
    const text = await renderMetrics();
    expect(text).toMatch(
      /herm_http_requests_total\{method="GET",route="\/api\/health",status="200"\} 1/,
    );
    expect(text).toMatch(
      /herm_http_request_duration_seconds_bucket\{le="0\.025",method="GET",route="\/api\/health",status="200"\} 1/,
    );
  });
});

describe('recordAuthLogin', () => {
  it('increments the auth-login counter under the supplied outcome', async () => {
    recordAuthLogin('success');
    recordAuthLogin('success');
    recordAuthLogin('bad_credentials');
    recordAuthLogin('locked');
    recordAuthLogin('mfa_required');
    recordAuthLogin('mfa_failed');
    const text = await renderMetrics();
    expect(text).toMatch(/herm_auth_login_total\{outcome="success"\} 2/);
    expect(text).toMatch(/herm_auth_login_total\{outcome="bad_credentials"\} 1/);
    expect(text).toMatch(/herm_auth_login_total\{outcome="locked"\} 1/);
    expect(text).toMatch(/herm_auth_login_total\{outcome="mfa_required"\} 1/);
    expect(text).toMatch(/herm_auth_login_total\{outcome="mfa_failed"\} 1/);
  });
});

describe('recordSsoLogin', () => {
  it('increments the sso-login counter under (protocol, outcome)', async () => {
    recordSsoLogin('saml', 'success');
    recordSsoLogin('oidc', 'success');
    recordSsoLogin('saml', 'validation_failure');
    recordSsoLogin('oidc', 'replayed');
    recordSsoLogin('saml', 'cross_inst_blocked');
    const text = await renderMetrics();
    expect(text).toMatch(
      /herm_sso_login_total\{protocol="saml",outcome="success"\} 1/,
    );
    expect(text).toMatch(
      /herm_sso_login_total\{protocol="oidc",outcome="success"\} 1/,
    );
    expect(text).toMatch(
      /herm_sso_login_total\{protocol="saml",outcome="validation_failure"\} 1/,
    );
    expect(text).toMatch(
      /herm_sso_login_total\{protocol="oidc",outcome="replayed"\} 1/,
    );
  });

  it('does NOT include institutionSlug in any sso label (ADR-0001 invariant)', async () => {
    // Defensive: the metric definition has labelNames `['protocol', 'outcome']`
    // and prom-client rejects unknown labels at write-time. This test
    // documents the invariant explicitly so a future contributor adding
    // a label has to remove the test, prompting a review.
    recordSsoLogin('saml', 'success');
    const text = await renderMetrics();
    // The line for sso_login_total must not contain `institution`,
    // `slug`, or `tenant` anywhere in the label set.
    const ssoLines = text.split('\n').filter((l) => l.startsWith('herm_sso_login_total'));
    expect(ssoLines.length).toBeGreaterThan(0);
    for (const line of ssoLines) {
      expect(line).not.toMatch(/institution|slug|tenant/i);
    }
  });
});

describe('__resetMetricsForTests', () => {
  it('clears counter values but preserves registration', async () => {
    recordAuthLogin('success');
    recordAuthLogin('success');
    let text = await renderMetrics();
    expect(text).toMatch(/herm_auth_login_total\{outcome="success"\} 2/);

    __resetMetricsForTests();
    text = await renderMetrics();
    // After reset the counter should still be registered (so the next
    // increment works) but the value should be 0 / absent. prom-client
    // emits the zero-valued counter only after a label is observed,
    // so the post-reset text just lacks the success line.
    expect(text).not.toMatch(/herm_auth_login_total\{outcome="success"\} 2/);

    recordAuthLogin('success');
    text = await renderMetrics();
    expect(text).toMatch(/herm_auth_login_total\{outcome="success"\} 1/);
  });
});
