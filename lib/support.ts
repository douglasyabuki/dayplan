/**
 * Validates the owner-supplied support destination without inventing a contact address.
 * @param value Configured HTTPS URL or a single mailto address.
 * @returns {string | null} Safe destination, or null when absent or invalid.
 * @example supportDestination("mailto:team@example.test");
 */
export function supportDestination(value: string | undefined): string | null {
  if (!value || /[\s\r\n]/.test(value) || /%0[ad]/i.test(value)) return null;
  if (/^mailto:[A-Z0-9._+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value))
    return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
