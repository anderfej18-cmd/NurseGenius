/** `ada.obi@example.com` becomes `a•••@example.com`: enough to tell people apart, not to contact them. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
