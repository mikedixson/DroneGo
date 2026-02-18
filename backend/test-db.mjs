import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'dronego',
  user: 'dronego',
  password: 'dronego_dev_password',
  connectionTimeoutMillis: 5000,
});

console.log('Attempting to connect to database...');

try {
  const client = await pool.connect();
  console.log('Connected successfully!');
  
  const result = await client.query('SELECT NOW()');
  console.log('Query result:', result.rows[0]);
  
  client.release();
  await pool.end();
  console.log('Pool closed');
} catch (error) {
  console.error('Connection failed:', error);
  process.exit(1);
}
