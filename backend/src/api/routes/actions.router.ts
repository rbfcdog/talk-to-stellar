import { Router } from 'express';
import { ActionsController } from '../controllers/actions.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import { 
  loginSchema, 
  onboardUserSchema,
  addContactSchema,
  lookupContactByNameSchema,
  listContactsSchema,
  buildPaymentXdrSchema,
  getOperationHistorySchema,
  getAccountBalanceSchema,
  buildPathPaymentXdrSchema,
  initiatePixDepositSchema,
  checkDepositStatusSchema,
  signAndSubmitXdrSchema
} from '../dtos/actions.dto';

const router = Router();

router.post('/login', validate(loginSchema), ActionsController.login);

router.post('/onboard-user', validate(onboardUserSchema), ActionsController.onboardUser);

router.use(authenticateToken);

router.post('/add-contact', validate(addContactSchema), ActionsController.addContact);
router.post('/lookup-contact-by-name', validate(lookupContactByNameSchema), ActionsController.lookupContactByName);
router.post('/list-contacts', validate(listContactsSchema), ActionsController.listContacts);

router.post('/build-payment-xdr', validate(buildPaymentXdrSchema), ActionsController.buildPaymentXdr);

router.post('/build-path-payment-xdr', validate(buildPathPaymentXdrSchema), ActionsController.buildPathPaymentXdr);

router.post('/get-operation-history', validate(getOperationHistorySchema), ActionsController.getOperationHistory);

router.post('/get-account-balance', validate(getAccountBalanceSchema), ActionsController.getAccountBalance);

router.post('/initiate-pix-deposit', validate(initiatePixDepositSchema), ActionsController.initiatePixDeposit);
router.post('/check-deposit-status', validate(checkDepositStatusSchema), ActionsController.checkDepositStatus);

router.post('/sign-and-submit-xdr', validate(signAndSubmitXdrSchema), ActionsController.signAndSubmitXdr);

export default router;