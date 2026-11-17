import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
function key() {
  const secret = process.env['B2B_CREDENTIAL_ENCRYPTION_SECRET'];
  if (!secret) throw Error('Proteção de credenciais indisponível.');
  return createHash('sha256').update(secret).digest();
}
export function encryptB2B(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decryptB2B(value: string) {
  const buffer = Buffer.from(value, 'base64'); const cipher = createDecipheriv('aes-256-gcm', key(), buffer.subarray(0, 12));
  cipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString('utf8');
}