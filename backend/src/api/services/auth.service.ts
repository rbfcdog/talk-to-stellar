import jwt from 'jsonwebtoken';
import { UserRepository } from '../repository/user.repository';
import { getRequiredJwtSecret } from '../../config/secrets';

export class AuthService {
  static async login(email: string): Promise<{ sessionToken: string; userId: string; publicKey: string }> {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new Error('Usuário com este email não foi encontrado.');
    }

    const payload = { userId: user.id };
    const sessionToken = jwt.sign(payload, getRequiredJwtSecret(), { expiresIn: '1h' });

    return { sessionToken, userId: user.id, publicKey: user.stellar_public_key };
  }

  static generateTokenForUser(userId: string): string {
    const payload = { userId };
    return jwt.sign(payload, getRequiredJwtSecret(), { expiresIn: '1h' });
  }
}
