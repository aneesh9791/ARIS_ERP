/**
 * Central permission utility — used by all pages to show/hide actions.
 *
 * VIEW permissions  → control whether a page/tab is visible
 * WRITE permissions → control whether create/edit/delete buttons appear
 * Special           → approve, refund, dispose, export etc.
 */

export function getPermissions() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    const role  = u.role || '';

    const has = (p) => {
      if (!p) return true;
      if (perms.includes('ALL_ACCESS')) return true;
      const required = Array.isArray(p) ? p : [p];
      return required.some(x => perms.includes(x));
    };

    return { perms, role, has };
  } catch {
    return { perms: [], role: '', has: () => false };
  }
}
