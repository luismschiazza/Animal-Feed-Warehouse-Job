export const PRODUCT_SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const trimProductText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
