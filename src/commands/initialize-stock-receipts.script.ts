import { createConnection } from 'mongoose';
import {
  BALANCE_MODEL,
  RECEIPT_MODEL,
  StockBalanceSchema,
  StockReceiptSchema,
  verifyStockIndexes,
} from '@/features/stock-receipts/stock-receipt.schema';

async function main() {
  const uri = process.env.STOCK_RECEIPTS_MONGO_URL;
  if (
    process.env.STOCK_RECEIPTS_SYNTHETIC !== 'true' ||
    process.env.NODE_ENV === 'production' ||
    !uri
  )
    throw new Error('Explicit synthetic operator configuration required');
  const connection = await createConnection(uri, {
    autoIndex: false,
    autoCreate: false,
  }).asPromise();
  try {
    const hello = await connection.db.admin().command({ hello: 1 });
    if (typeof hello.setName !== 'string') throw new Error('Replica set required');
    const balances = connection.model(BALANCE_MODEL, StockBalanceSchema);
    const receipts = connection.model(RECEIPT_MODEL, StockReceiptSchema);
    for (const model of [balances, receipts]) {
      await model.createCollection();
      await model.createIndexes();
    }
    await verifyStockIndexes(balances, receipts);
    console.info('Synthetic stock storage initialized; no balances or receipts created.');
  } finally {
    await connection.close();
  }
}

if (require.main === module)
  void main().catch(() => {
    console.error('Synthetic stock initialization failed; no automatic repair performed.');
    process.exitCode = 1;
  });
