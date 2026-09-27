/** Простые сессии диалога в памяти процесса (хватает для одного инстанса на Render). */

const sessions = new Map();

export function getSession(userId) {
  return sessions.get(String(userId)) || null;
}

export function setSession(userId, data) {
  sessions.set(String(userId), data);
}

export function clearSession(userId) {
  sessions.delete(String(userId));
}
