import { Router } from "express";
import { BridgeController } from "../controllers/bridge.controller";
import {
  requireBridgeAuth,
  requireBridgeEnabled,
  requireBridgeMainnetEnabled,
} from "../middlewares/bridge-mainnet.middleware";

const router = Router();

// All bridge routes require auth + bridge enabled
router.use(requireBridgeAuth);
router.use(requireBridgeEnabled);

// ── Customers ───────────────────────────────────────────
router.post("/customers", BridgeController.createCustomer);
router.get("/customers/:id", BridgeController.getCustomer);
router.post("/customers/:id/sync", BridgeController.syncCustomer);
router.get("/customers/:id/kyc-link", BridgeController.getKycLink);
router.get(
  "/customers/:id/readiness",
  BridgeController.getCustomerReadiness,
);

// ── External Accounts ───────────────────────────────────
router.post(
  "/customers/:id/external-accounts/pix-key",
  BridgeController.createPixKeyExternalAccount,
);
router.get(
  "/customers/:id/external-accounts",
  BridgeController.listExternalAccounts,
);
router.get(
  "/external-accounts/:externalAccountId",
  BridgeController.getExternalAccount,
);
router.delete(
  "/external-accounts/:externalAccountId",
  BridgeController.deleteExternalAccount,
);

// ── Liquidation Addresses ───────────────────────────────
router.post(
  "/customers/:id/liquidation-addresses/pix",
  requireBridgeMainnetEnabled,
  BridgeController.createPixLiquidationAddress,
);
router.get(
  "/customers/:id/liquidation-addresses",
  BridgeController.listLiquidationAddresses,
);
router.get(
  "/customers/:id/liquidation-addresses/:liquidationAddressId",
  BridgeController.getLiquidationAddress,
);

// ── Transfers ───────────────────────────────────────────
router.post(
  "/transfers/crypto-to-pix",
  requireBridgeMainnetEnabled,
  BridgeController.createCryptoToPixTransfer,
);
router.get(
  "/transfers/:transferId",
  BridgeController.getTransfer,
);
router.post(
  "/transfers/:transferId/sync",
  BridgeController.syncTransfer,
);

// ── Exchange Rates ─────────────────────────────────────
router.get("/exchange-rates", BridgeController.getExchangeRate);
router.post("/estimate", BridgeController.estimatePayout);

// ── Virtual Accounts ───────────────────────────────────
router.post(
  "/customers/:id/virtual-accounts/brl",
  requireBridgeMainnetEnabled,
  BridgeController.createBrlVirtualAccount,
);
router.get(
  "/customers/:id/virtual-accounts",
  BridgeController.listVirtualAccounts,
);
router.get(
  "/virtual-accounts/:virtualAccountId",
  BridgeController.getVirtualAccount,
);

export default router;
