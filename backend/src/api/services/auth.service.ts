import jwt from 'jsonwebtoken';
import { getRequiredJwtSecret } from '../../config/secrets';

export class AuthService {
  static generateTokenForUser(userId: string): string {
    const payload = { userId };
    return jwt.sign(payload, getRequiredJwtSecret(), { expiresIn: '1h' });
  }
}
