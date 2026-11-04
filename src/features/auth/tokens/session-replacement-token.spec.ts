import { generateRefreshToken } from './refresh-token';
import { generateReplacementToken, parseReplacementToken } from './session-replacement-token';

describe('replacement credential audience and canonical verifier', () => {
  it('has 256-bit random secret and separate random flow IDs; persists no clear token in parser result', () => {
    const a = generateReplacementToken(),
      b = generateReplacementToken();
    expect(a.id).not.toBe(b.id);
    expect(a.token).toHaveLength(84);
    expect(a.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parseReplacementToken(a.token)).toEqual({ id: a.id, secretHash: a.secretHash });
    expect(JSON.stringify(parseReplacementToken(a.token))).not.toContain(a.token.split('.')[2]);
  });
  it.each([
    null,
    {},
    123,
    '',
    generateRefreshToken().refreshToken,
    'eyJhbGciOiJIUzI1NiJ9.e30.invalid',
  ])('rejects non-capability credential case %#', (value) => {
    expect(parseReplacementToken(value)).toBeNull();
  });
  it('rejects audience/ID/length/noncanonical base64url tampering', () => {
    const { token } = generateReplacementToken();
    for (const bad of [
      token.replace('sr1.', 'sr2.'),
      token + 'x',
      token.toUpperCase(),
      token.slice(0, -1) + '=',
    ])
      expect(parseReplacementToken(bad)).toBeNull();
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const index = alphabet.indexOf(token[token.length - 1]);
    expect(parseReplacementToken(token.slice(0, -1) + alphabet[index + 1])).toBeNull();
  });
});
