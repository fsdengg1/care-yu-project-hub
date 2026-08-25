import crypto from 'node:crypto';

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function tokensMatch(rawToken: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  const incoming = Buffer.from(hashToken(rawToken));
  const stored = Buffer.from(storedHash);
  if (incoming.length !== stored.length) return false;
  return crypto.timingSafeEqual(incoming, stored);
}

export function normalizeInvitationCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function generateInvitationCode(): string {
  const part = (length: number) =>
    Array.from({ length }, () => INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)]).join('');
  return `CY-${part(4)}-${part(4)}`;
}

export function hashInvitationCode(code: string): string {
  return hashToken(normalizeInvitationCode(code));
}

export function invitationCodesMatch(rawCode: string, storedHash: string | undefined): boolean {
  return tokensMatch(normalizeInvitationCode(rawCode), storedHash);
}
