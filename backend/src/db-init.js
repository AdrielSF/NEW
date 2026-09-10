import fs from 'node:fs/promises';
import { pool } from './db.js';

const schema = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
await pool.query(schema);
console.log('Banco inicializado.');
await pool.end();
