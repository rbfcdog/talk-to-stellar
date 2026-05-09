import jwt from 'jsonwebtoken';
import { UserRepository } from '../repository/user.repository';

const JWT_SECRET = process.env.JWT_SECRET || ''

export class AuthService {
  static async login(email: string): Promise<{ sessionToken: string; userId: string; publicKey: string }> {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new Error('Usuário com este email não foi encontrado.');
    }

    const payload = { userId: user.id };
    const sessionToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    return { sessionToken, userId: user.id, publicKey: user.stellar_public_key };
  }

  static generateTokenForUser(userId: string): string {
    const payload = { userId };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  }
}