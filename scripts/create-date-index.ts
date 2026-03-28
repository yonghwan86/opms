import { pool } from "../server/db";

async function createDateIndex() {
  const client = await pool.connect();
  try {
    console.log("[create-date-index] Starting index creation...");

    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS oil_price_raw_date_idx
      ON oil_price_raw (date)
    `);

    console.log("[create-date-index] Index creation command sent. Verifying...");

    const result = await client.query(`
      SELECT indexrelid::regclass AS index_name, indisvalid
      FROM pg_index
      WHERE indexrelid = 'oil_price_raw_date_idx'::regclass
    `);

    if (result.rows.length === 0) {
      console.error("[create-date-index] Index not found after creation!");
      process.exit(1);
    }

    const { index_name, indisvalid } = result.rows[0];
    if (!indisvalid) {
      console.error(`[create-date-index] Index ${index_name} is INVALID. Dropping and retry manually.`);
      await client.query(`DROP INDEX oil_price_raw_date_idx`);
      process.exit(1);
    }

    console.log(`[create-date-index] Index ${index_name} is VALID. Done!`);
  } catch (err) {
    console.error("[create-date-index] Error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createDateIndex();
