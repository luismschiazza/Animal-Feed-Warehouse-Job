import { createConnection } from 'mongoose';
import {
  Product,
  ProductSchema,
  verifyProductIndexes,
} from '@/features/products/schemas/product.schema';

// Operator-only, no dotenv/default URI/seed/accounts/automatic deduplication or repair.
async function main() {
  if (!process.env.PRODUCTS_MONGO_URL) throw new Error('Explicit operator URI required');
  const connection = await createConnection(process.env.PRODUCTS_MONGO_URL, {
    autoCreate: false,
    autoIndex: false,
  }).asPromise();
  try {
    const hello = await connection.db.admin().command({ hello: 1 });
    if (typeof hello.setName !== 'string') throw new Error('Replica set required');
    const model = connection.model(Product.name, ProductSchema);
    await model.createCollection();
    await model.createIndexes();
    await verifyProductIndexes(model);
    console.info('Product catalog storage initialized; no product, account or stock created.');
  } finally {
    await connection.close();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error('Product initialization failed; no automatic repair performed.');
    process.exitCode = 1;
  });
