/**
 * Helpers for site-wide content managed in src/data/site.json (via the CMS).
 *
 * Link model: every button / footer / contact link is { kind, target }.
 *   kind "internal" → target is a site path like "/about", "/#work" or "#work"
 *   kind "url"      → target is a full external URL
 *   kind "email"    → target is an address (optional `subject`)
 *   kind "phone"    → target is a phone number
 */

export type SiteLink = {
  label?: string;
  kind: 'internal' | 'url' | 'email' | 'phone';
  target: string;
  subject?: string;
  style?: string;
  arrow?: string;
  visible?: boolean;
};

/** Build a concrete href for a { kind, target } link. `base` = import.meta.env.BASE_URL */
export function linkHref(link: { kind?: string; target?: string; subject?: string }, base: string): string {
  const t = (link.target || '').trim();
  switch (link.kind) {
    case 'email':
      return 'mailto:' + t + (link.subject ? '?subject=' + encodeURIComponent(link.subject) : '');
    case 'phone':
      return 'tel:' + t.replace(/[\s()]/g, '');
    case 'url':
      return t;
    default: {
      // internal
      if (t.startsWith('#')) return t;
      const b = base.replace(/\/+$/, '');
      return b + (t.startsWith('/') ? t : '/' + t);
    }
  }
}

/** Should the link open in a new tab? (matches previous behaviour: only web URLs) */
export const opensNewTab = (link: { kind?: string }): boolean => link.kind === 'url';

/** Escape HTML, then allow light emphasis: *em* and **strong**. */
export function emphasize(text: string): string {
  const esc = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
