import { Model } from 'mongoose';

// In production schemas disable automatic DDL. An operator provisions first;
// runtime credentials need find/insert/listIndexes, not update/delete/createIndex.
export async function verifyAuditIndexes(model: Model<any>) {
  try {
    await model.init();
    const actual = await model.collection.indexes();
    if (actual.some((index) => index.expireAfterSeconds !== undefined)) throw new Error();
    for (const [key, options] of model.schema.indexes()) {
      if (
        !actual.some(
          (index) =>
            JSON.stringify(index.key) === JSON.stringify(key) &&
            !!index.unique === !!options.unique &&
            JSON.stringify(index.partialFilterExpression) ===
              JSON.stringify(options.partialFilterExpression),
        )
      )
        throw new Error();
    }
  } catch {
    throw new Error('Audit collection/indexes unavailable or unsafe; operator review required');
  }
}
