import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, encryptSecret, decryptSecret, last4, safeEqual } from '../server/lib/crypto.ts';

test('password hashing: never stores plain text, verifies correctly', async () => {
  const h = await hashPassword('Correct horse battery staple');
  assert.ok(h.startsWith('scrypt$'));
  assert.ok(!h.includes('Correct horse'));
  assert.equal(await verifyPassword('Correct horse battery staple', h), true);
  assert.equal(await verifyPassword('wrong password', h), false);
});

test('password hashing: same password gives different hashes (salted)', async () => {
  const [a, b] = await Promise.all([hashPassword('same-pass-123'), hashPassword('same-pass-123')]);
  assert.notEqual(a, b);
});

test('password verify rejects malformed hashes', async () => {
  assert.equal(await verifyPassword('x', 'plain-text'), false);
  assert.equal(await verifyPassword('x', 'bcrypt$1$2$3$4$5'), false);
});

test('API key encryption round-trips and hides the key', () => {
  const key = randomBytes(32);
  const secret = 'sk-ant-api03-EXAMPLE-KEY-1234';
  const enc = encryptSecret(secret, key);
  assert.ok(!enc.includes('EXAMPLE'));
  assert.equal(decryptSecret(enc, key), secret);
  assert.notEqual(encryptSecret(secret, key), enc, 'random IV each time');
});

test('API key encryption detects tampering and wrong key', () => {
  const key = randomBytes(32);
  const enc = encryptSecret('secret-value', key);
  const parts = enc.split(':');
  const data = Buffer.from(parts[3]!, 'base64');
  data[0] = data[0]! ^ 0xff;
  parts[3] = data.toString('base64');
  assert.throws(() => decryptSecret(parts.join(':'), key));
  assert.throws(() => decryptSecret(enc, randomBytes(32)));
});

test('last4 and safeEqual helpers', () => {
  assert.equal(last4('sk-abcdefWXYZ'), 'WXYZ');
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});
