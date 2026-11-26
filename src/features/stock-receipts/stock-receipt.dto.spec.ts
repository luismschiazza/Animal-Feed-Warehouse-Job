import { ReceiveStockDto, canonicalReceipt, intentKey, validated } from './stock-receipt.dto';

const key = '24da8314-971a-4367-aca3-38d2fc70fcd5';
const input = {
  productId: 'abcdef101010101010101010',
  locationId: 'abcdef101010101010101011',
  quantity: 2350,
};
const parse = (raw: unknown) =>
  validated(ReceiveStockDto, raw, ['productId', 'locationId', 'quantity', 'reference']);

describe('synthetic stock input and idempotency', () => {
  it('normalizes a UUID v4 without keeping the raw key', () => {
    expect(intentKey(key)).toMatch(/^[a-f0-9]{64}$/);
    expect(intentKey(key.toUpperCase())).toEqual(intentKey(key));
    for (const bad of [null, [key], key + ', ' + key, ' ' + key, key.replace('-4367-', '-1367-')])
      expect(() => intentKey(bad)).toThrow();
  });
  it('digests exact integer quantity, normalized IDs and reference', () => {
    const a = canonicalReceipt(parse({ ...input, reference: ' DOC-12 ' }));
    expect(
      canonicalReceipt(
        parse({ ...input, productId: input.productId.toUpperCase(), reference: 'DOC-12' }),
      ),
    ).toBe(a);
    for (const changed of [
      input,
      { ...input, quantity: 2351, reference: 'DOC-12' },
      { ...input, locationId: input.productId, reference: 'DOC-12' },
    ])
      expect(canonicalReceipt(parse(changed))).not.toBe(a);
  });
  it('rejects authority fields, unsafe values and coercion also for internal callers', () => {
    for (const changed of [
      { quantity: '2350' },
      { quantity: 2.5 },
      { quantity: NaN },
      { quantity: 0 },
      { quantity: Number.MAX_SAFE_INTEGER },
      { reference: null },
      { organizationId: input.productId },
      { unit: 'g' },
      { recordedAt: new Date() },
    ])
      expect(() => parse({ ...input, ...changed })).toThrow();
  });
});
