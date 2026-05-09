import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
  };
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decodedPayload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { userId: string };
    
    (req as AuthenticatedRequest).user = decodedPayload;
    
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
};