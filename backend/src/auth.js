import crypto from 'node:crypto';
import argon2 from 'argon2';
import { query } from './db.js';

const sessions = new Map();

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  };
}

export async function login(req, res) {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });

  const { rows } = await query(
    `SELECT id,name,username,email,password_hash,role,active FROM users WHERE username=$1`,
    [String(username).trim()]
  );
  const user = rows[0];

  if (!user || !user.active || !(await argon2.verify(user.password_hash, String(password)))) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, expires: Date.now() + 8 * 60 * 60 * 1000 });

  await query(`UPDATE users SET last_login_at=now() WHERE id=$1`, [user.id]);
  res.cookie('implantapro_session', token, cookieOptions());
  res.json({ user: sanitizeUser(user) });
}

export function logout(req, res) {
  const token = req.cookies.implantapro_session;
  if (token) sessions.delete(token);
  res.clearCookie('implantapro_session');
  res.json({ ok: true });
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.implantapro_session;
    const session = token && sessions.get(token);
    if (!session || session.expires < Date.now()) {
      if (token) sessions.delete(token);
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const { rows } = await query(
      `SELECT id,name,username,email,role,active FROM users WHERE id=$1`,
      [session.userId]
    );
    if (!rows[0]?.active) return res.status(401).json({ error: 'Usuário inativo.' });

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para esta ação.' });
    }
    next();
  };
}

function sanitizeUser(user) {
  return {
    id: user.id, name: user.name, username: user.username,
    email: user.email, role: user.role, active: user.active
  };
}
