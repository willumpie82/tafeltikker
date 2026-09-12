import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifySecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
