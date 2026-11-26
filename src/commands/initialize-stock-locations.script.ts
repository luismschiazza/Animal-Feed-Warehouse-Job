import { createConnection } from 'mongoose';
import {
  StockLocation,
  StockLocationSchema,
  verifyStockLocationIndexes,
} from '@/features/stock-locations/stock-location.schema';

// Operator-only. Never infer a URI or invoke DDL from the API runtime.
async function main() {
  const uri = process.env.STOCK_LOCATIONS_MONGO_URL;
  if (!uri) throw new Error('Explicit operator URI required');
  const connection = await createConnection(uri, {
    autoCreate: false,
    autoIndex: false,
  }).asPromise();
  try {
    const hello = await connection.db.admin().command({ hello: 1 });
    if (typeof hello.setName !== 'string') throw new Error('Replica set required');
    const model = connection.model(StockLocation.name, StockLocationSchema);
    await model.createCollection();
    await model.createIndexes();
    await verifyStockLocationIndexes(model);
    console.info('Stock location storage initialized; no locations or quantities created.');
  } finally {
    await connection.close();
  }
}

if (require.main === module)
  void main().catch(() => {
    console.error('Stock location initialization failed; no automatic repair performed.');
    process.exitCode = 1;
  });
