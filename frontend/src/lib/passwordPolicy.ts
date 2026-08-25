export const PASSWORD_REQUIREMENT_LABELS = [
  '8+ characters',
  'Uppercase letter',
  'Lowercase letter',
  'Number',
  'Special character',
] as const;

export function passwordChecks(password: string) {
  return [
    { label: PASSWORD_REQUIREMENT_LABELS[0], ok: password.length >= 8 },
    { label: PASSWORD_REQUIREMENT_LABELS[1], ok: /[A-Z]/.test(password) },
    { label: PASSWORD_REQUIREMENT_LABELS[2], ok: /[a-z]/.test(password) },
    { label: PASSWORD_REQUIREMENT_LABELS[3], ok: /[0-9]/.test(password) },
    { label: PASSWORD_REQUIREMENT_LABELS[4], ok: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function validatePasswordPolicy(password: string): string | null {
  if (!password) return 'Password is required.';
  const failed = passwordChecks(password).find((item) => !item.ok);
  if (!failed) return null;
  return 'Please meet all password requirements.';
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
