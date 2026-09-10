import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { pool } from './db.js';

const username = 'admin';
const password = 'TroqueEstaSenha123!';

const hash = await argon2.hash(password, { type: argon2.argon2id });

await pool.query(
  `INSERT INTO users (id,name,username,email,password_hash,role)
   VALUES ($1,$2,$3,$4,$5,'admin')
   ON CONFLICT (username) DO NOTHING`,
  [randomUUID(), 'Administrador', username, 'admin@localhost', hash]
);

console.log(`Usuário de desenvolvimento criado/verificado: ${username}`);
console.log('Senha inicial:', password);
console.log('TROQUE-A antes de qualquer uso real.');
await pool.end();
