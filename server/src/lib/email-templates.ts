/**
 * Email body renderers.
 *
 * Phase 10.2. Small, deliberate set of templates kept in one place so we
 * can swap in a richer template engine later (handlebars, mjml) without
 * disturbing the call sites. Each renderer takes a typed input and
 * returns `{ text, html }` — both are sent so clients without HTML
 * support still get readable mail.
 *
 * Keep these functions pure. No env reads, no DB calls, no logging —
 * easy to test with a single equality assert.
 */

const APP_URL = process.env['APP_URL'] ?? 'http://localhost:5173';

/**
 * Minimal HTML escape so user-controlled strings (e.g. tier names returned
 * from the DB) can't inject markup into the rendered email body. We don't
 * accept HTML from outside — every input is treated as text.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface BillingEmailInput {
  /** Short headline; shown as the email subject and the H1. */
  title: string;
  /** Body copy — one or two sentences explaining the event. */
  message: string;
  /** Path on the platform to deep-link the recipient to. Optional. */
  link?: string;
}

export interface RenderedEmail {
  text: string;
  html: string;
}

/**
 * Render a billing-event notification email. Intentionally austere — no
 * branding, no images, no colours. Looks the same whether the recipient
 * opens it in Gmail, Outlook, or a terminal mail client.
 */
export function renderBillingEmail(input: BillingEmailInput): RenderedEmail {
  const link = input.link ? `${APP_URL}${input.link}` : null;

  const textParts = [
    input.title,
    '',
    input.message,
  ];
  if (link) {
    textParts.push('', `View details: ${link}`);
  }
  textParts.push('', '— HERM Platform');
  const text = textParts.join('\n');

  const linkBlock = link
    ? `<p><a href="${escapeHtml(link)}">View details</a></p>`
    : '';
  const html = [
    '<!doctype html>',
    '<html><body style="font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">',
    `<h1 style="font-size: 18px; margin: 0 0 16px;">${escapeHtml(input.title)}</h1>`,
    `<p>${escapeHtml(input.message)}</p>`,
    linkBlock,
    '<hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">',
    '<p style="color: #6b7280; font-size: 12px;">— HERM Platform</p>',
    '</body></html>',
  ].join('\n');

  return { text, html };
}
