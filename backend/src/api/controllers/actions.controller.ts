import { Request, Response } from 'express';
import { StellarService } from '../services/stellar.service';
import { UserService } from '../services/user.service';
import { OperationService } from '../services/operation.service';
import { AuthService } from '../services/auth.service';
import { AnchorService } from '../services/anchor.service';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
  };
}

export class ActionsController {
  
  static async login(req: Request, res: Response) {
    try {
      const { email } = req.body;
      
      const result = await AuthService.login(email);
      
      res.status(200).json({ 
        success: true, 
        sessionToken: result.sessionToken,
        userId: result.userId,
        publicKey: result.publicKey
      });

    } catch (error: any) {
      if (error.message.includes('não foi encontrado')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }
  
  static async onboardUser(req: Request, res: Response) {
    try {
      const result = await UserService.onboardUser(req.body);
      
      res.status(201).json({ 
        success: true, 
        ...result,
        message: "User onboarded successfully"
      });

    } catch (error: any) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({ success: false, message: error.message });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async addContact(req: AuthenticatedRequest, res: Response) {
    try {
      const { contact_name, public_key } = req.body;
      const userId = (req as AuthenticatedRequest).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const newContact = await UserService.addContact({ userId, contact_name, public_key });

      res.status(201).json({ success: true, contact: newContact });

    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message.includes('already exists')) {
        return res.status(409).json({ success: false, message: error.message });
      }
      
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async lookupContactByName(req: AuthenticatedRequest, res: Response) {
    try {
      const { contact_name } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      
      const contact = await UserService.lookupContactByNameAndUserId({ userId, contact_name });

      res.status(200).json({ success: true, contact: contact });

    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      
      res.status(500).json({ success: false, message: error.message });
    }
  }
  static async listContacts(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      
      const contacts = await UserService.listContacts({ userId });

      res.status(200).json({ 
        success: true, 
        contacts: contacts,
        count: contacts.length 
      });

    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async buildPaymentXdr(req: Request, res: Response) {
    try {
      const { sourcePublicKey, destination, amount, assetCode, assetIssuer, memoText } = req.body;

      const xdr = await StellarService.buildPaymentXdr({
        sourcePublicKey,
        destination,
        amount,
        assetCode,
        assetIssuer,
        memoText
      });

      res.status(200).json({ 
        success: true, 
        xdr: xdr,
        message: 'Transaction XDR built successfully. Sign and submit externally.'
      });

    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getOperationHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      
      const history = await OperationService.getOperationHistory(userId);

      res.status(200).json({ success: true, history: history });

    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async buildPathPaymentXdr(req: Request, res: Response) {
    try {
      const { sourcePublicKey, destination, destAsset, destAmount, sourceAsset } = req.body;

      const xdr = await StellarService.buildPathPaymentXdr({
        sourcePublicKey,
        destination,
        destAsset,
        destAmount,
        sourceAsset
      });

      res.status(200).json({ 
        success: true, 
        xdr: xdr,
        message: 'Path payment XDR built successfully. Sign and submit externally.'
      });

    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAccountBalance(req: Request, res: Response) {
    try {
      const { publicKey } = req.body;
      const balances = await StellarService.getAccountBalance(publicKey);
      res.status(200).json({ success: true, balances });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async initiatePixDeposit(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { publicKey, assetCode, amount } = req.body;
      
      const result = await AnchorService.initiatePixDeposit({
        userId,
        publicKey,
        assetCode,
        amount
      });

      res.status(200).json({
        success: true,
        depositUrl: result.depositUrl,
        operationId: result.operationId,
        message: 'PIX deposit initiated successfully'
      });

    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async checkDepositStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { operationId } = req.body;
      
      const result = await AnchorService.checkDepositStatus(operationId);

      res.status(200).json({
        success: true,
        status: result.status,
        message: result.message
      });

    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async signAndSubmitXdr(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { secretKey, unsignedXdr, operationData } = req.body;
      
      const result = await StellarService.signAndSubmitXdr(
        userId,
        secretKey,
        unsignedXdr,
        operationData
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          hash: result.hash,
          message: 'Transaction signed and submitted successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

}