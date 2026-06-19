import { Router } from "express";
import { BridgeController } from "../controllers/bridge.controller";
import {
  requireBridgeEnabled,
  requireBridgeMainnetEnabled,
} from "../middlewares/bridge-mainnet.middleware";

const router = Router();

// All bridge routes require bridge enabled
router.use(requireBridgeEnabled);

// ── Customers ───────────────────────────────────────────
router.post("/customers", BridgeController.createCustomer);
router.get("/customers/by-email", BridgeController.findCustomerByEmail);
router.get("/customers/:id", BridgeController.getCustomer);
router.post("/customers/:id/sync", BridgeController.syncCustomer);
router.post("/customers/:id/kyc-link", BridgeController.getKycLink);
router.post("/customers/:id/pix-kyc-link", BridgeController.getPixKycLink);
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
// cached must come before /:virtualAccountId
router.get(
  "/customers/:id/virtual-accounts/cached",
  BridgeController.listVirtualAccountsFromDb,
);
router.get(
  "/virtual-accounts/:virtualAccountId",
  BridgeController.getVirtualAccount,
);
router.post(
  "/virtual-accounts/:virtualAccountId/deactivate",
  BridgeController.deactivateVirtualAccount,
);
router.post(
  "/virtual-accounts/:virtualAccountId/reactivate",
  BridgeController.reactivateVirtualAccount,
);
router.get(
  "/customers/:id/virtual-accounts/:virtualAccountId/activity",
  BridgeController.getVirtualAccountActivity,
);

// USD / EUR / MXN / GBP / COP on-ramps
router.post(
  "/customers/:id/virtual-accounts/usd",
  requireBridgeMainnetEnabled,
  BridgeController.createUsdVirtualAccount,
);
router.post(
  "/customers/:id/virtual-accounts/eur",
  requireBridgeMainnetEnabled,
  BridgeController.createEurVirtualAccount,
);
router.post(
  "/customers/:id/virtual-accounts/mxn",
  requireBridgeMainnetEnabled,
  BridgeController.createMxnVirtualAccount,
);
router.post(
  "/customers/:id/virtual-accounts/gbp",
  requireBridgeMainnetEnabled,
  BridgeController.createGbpVirtualAccount,
);
router.post(
  "/customers/:id/virtual-accounts/cop",
  requireBridgeMainnetEnabled,
  BridgeController.createCopVirtualAccount,
);

// External account additional types
router.post(
  "/customers/:id/external-accounts/us-bank",
  BridgeController.createUsBankExternalAccount,
);
router.post(
  "/customers/:id/external-accounts/iban",
  BridgeController.createIbanExternalAccount,
);
router.post(
  "/customers/:id/external-accounts/clabe",
  BridgeController.createClabeExternalAccount,
);
router.post(
  "/external-accounts/:externalAccountId/deactivate",
  BridgeController.deactivateExternalAccount,
);

// Liquidation addresses (generic — any rail)
router.post(
  "/customers/:id/liquidation-addresses",
  requireBridgeMainnetEnabled,
  BridgeController.createLiquidationAddress,
);

// Transfers — additional rails (must be before /transfers/:transferId)
router.post(
  "/transfers/crypto-to-ach",
  requireBridgeMainnetEnabled,
  BridgeController.createCryptoToAchTransfer,
);
router.post(
  "/transfers/crypto-to-wire",
  requireBridgeMainnetEnabled,
  BridgeController.createCryptoToWireTransfer,
);
router.post(
  "/transfers/crypto-to-rtp",
  requireBridgeMainnetEnabled,
  BridgeController.createCryptoToRtpTransfer,
);
router.post(
  "/transfers/crypto-to-sepa",
  requireBridgeMainnetEnabled,
  BridgeController.createCryptoToSepaTransfer,
);
router.post(
  "/transfers/crypto-to-spei",
  requireBridgeMainnetEnabled,
  BridgeController.createCryptoToSpeiTransfer,
);
router.post(
  "/transfers",
  requireBridgeMainnetEnabled,
  BridgeController.createTransfer,
);
router.get("/transfers", BridgeController.listTransfers);
router.delete(
  "/transfers/:transferId",
  requireBridgeMainnetEnabled,
  BridgeController.cancelTransfer,
);
router.get("/customers/:id/transfers", BridgeController.listCustomerTransfers);

// Customer management (extended)
router.put("/customers/:id", BridgeController.updateCustomer);
router.post("/customers/business", BridgeController.createBusinessCustomer);

// Webhooks
router.get("/webhooks", BridgeController.listWebhooks);
router.post("/webhooks", BridgeController.createWebhook);
router.get("/webhooks/:webhookId", BridgeController.getWebhook);
router.put("/webhooks/:webhookId", BridgeController.updateWebhook);
router.delete("/webhooks/:webhookId", BridgeController.deleteWebhook);

// Static memos
router.get("/static-memos", BridgeController.listStaticMemos);
router.post(
  "/static-memos",
  requireBridgeMainnetEnabled,
  BridgeController.createStaticMemo,
);
router.get("/static-memos/:memoId", BridgeController.getStaticMemo);
router.delete("/static-memos/:memoId", BridgeController.deleteStaticMemo);

// Bridge Wallets (custodial wallets on base/ethereum/solana/tempo/tron — NOT Stellar)
router.post("/customers/:id/wallets", BridgeController.createWallet);
router.get("/customers/:id/wallets", BridgeController.listWallets);
router.get("/customers/:id/wallets/cached", BridgeController.listWalletsFromDb);
router.get("/customers/:id/wallets/:walletId", BridgeController.getWallet);

// Global wallet endpoints (not scoped to customer)
router.get("/wallets/balances", BridgeController.getWalletBalances);
router.get("/wallets/:walletId", BridgeController.getGlobalWallet);
router.get("/wallets/:walletId/transactions", BridgeController.getWalletTransactions);

export default router;
