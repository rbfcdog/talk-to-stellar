import type { Request, Response } from "express";
import { getBridgeService } from "../../integrations/bridge";
import { logger } from "../../utils/logger";
import { assertBridgeAmountInRange } from "../middlewares/bridge-mainnet.middleware";

function readText(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function statusFromError(error: unknown): number {
  const message = String(
    (error as Record<string, unknown>)?.message || error || "",
  ).toLowerCase();
  if (message.includes("not found")) return 404;
  if (message.includes("unauthorized") || message.includes("auth"))
    return 401;
  if (
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("missing") ||
    message.includes("below") ||
    message.includes("exceeds")
  )
    return 400;
  if (message.includes("kyc") || message.includes("endorsement")) return 403;
  return 500;
}

export class BridgeController {
  // ── Customers ─────────────────────────────────────────────────

  static async createCustomer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customer = await service.createCustomer({
        first_name: readText(req.body?.first_name || req.body?.firstName),
        last_name: readText(req.body?.last_name || req.body?.lastName),
        email: readText(req.body?.email),
        type: "individual",
      });
      res.status(201).json({ success: true, customer });
    } catch (error: any) {
      logger.error(`[bridge] createCustomer failed: ${error.message}`);
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to create Bridge customer."),
        bridge_code: error?.code || null,
        bridge_source: error?.source || null,
      });
    }
  }

  static async getCustomer(req: Request, res: Response): Promise<void> {
    try {
      const customer = await getBridgeService().getCustomer(
        String(req.params.id),
      );
      res.json({ success: true, customer });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Customer not found."),
      });
    }
  }

  static async findCustomerByEmail(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const service = getBridgeService();
      const email = String(req.query.email || req.body?.email || "").trim().toLowerCase();
      if (!email) {
        res.status(400).json({ success: false, message: "Email is required." });
        return;
      }
      const customers = await service.listCustomers();
      const found = customers.find(
        (c: any) => (c.email || "").toLowerCase() === email,
      );
      if (!found) {
        res.status(404).json({ success: false, message: "No customer found with that email." });
        return;
      }
      res.json({ success: true, customer: found });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to search customers."),
      });
    }
  }

  static async syncCustomer(req: Request, res: Response): Promise<void> {
    try {
      const customer = await getBridgeService().getCustomer(
        String(req.params.id),
      );
      res.json({ success: true, customer });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to sync customer."),
      });
    }
  }

  static async getKycLink(req: Request, res: Response): Promise<void> {
    try {
      const kycLink = await getBridgeService().createKycLink(
        String(req.params.id),
      );
      res.json({ success: true, kyc_link: kycLink });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to create KYC link."),
      });
    }
  }

  static async getCustomerReadiness(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const customer = await getBridgeService().getCustomer(customerId);

      const endorsements: string[] = [];
      if (customer.endorsements?.length) {
        endorsements.push(
          ...customer.endorsements.map(
            (e) => `${e.name || "unknown"}:${e.status || "unknown"}`,
          ),
        );
      }

      const kycStatus = customer.kyc_status || customer.status || "not_started";
      const hasPixEndorsement = endorsements.some(
        (e) => e.startsWith("pix:") || e.startsWith("base:"),
      );

      let readiness = "ready";
      if (kycStatus === "not_started" || kycStatus === "update_required") {
        readiness = "needs_kyc";
      } else if (kycStatus === "pending") {
        readiness = "under_review";
      } else if (kycStatus === "rejected") {
        readiness = "rejected";
      } else if (!hasPixEndorsement) {
        readiness = "needs_pix_endorsement";
      }

      res.json({
        success: true,
        readiness: {
          status: readiness,
          kyc_status: kycStatus,
          endorsements,
          pix_ready: hasPixEndorsement,
        },
      });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to check customer readiness.",
      });
    }
  }

  // ── External Accounts ─────────────────────────────────────────

  static async createPixKeyExternalAccount(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const service = getBridgeService();
      const pixKey = readText(req.body?.pix_key || req.body?.pixKey);
      const ownerName = readText(
        req.body?.account_owner_name ||
          req.body?.accountOwnerName ||
          req.body?.name ||
          "",
      );

      const account = await service.addPixKey(customerId, pixKey, ownerName);

      logger.info(
        `[bridge] pix external account created for customer ${customerId}`,
      );
      res.status(201).json({ success: true, external_account: account });
    } catch (error: any) {
      logger.error(
        `[bridge] createPixKeyExternalAccount failed: ${error.message}`,
      );
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to create Pix external account.",
      });
    }
  }

  static async listExternalAccounts(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const accounts = await getBridgeService().listExternalAccounts(
        customerId,
      );
      res.json({ success: true, external_accounts: accounts });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to list external accounts.",
      });
    }
  }

  static async getExternalAccount(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const account = await getBridgeService().getExternalAccount(
        String(req.params.externalAccountId),
      );
      res.json({ success: true, external_account: account });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "External account not found.",
      });
    }
  }

  static async deleteExternalAccount(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      await getBridgeService().deleteExternalAccount(
        String(req.params.externalAccountId),
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to delete external account.",
      });
    }
  }

  // ── Liquidation Addresses ─────────────────────────────────────

  static async createPixLiquidationAddress(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const service = getBridgeService();
      const externalAccountId = readText(
        req.body?.external_account_id || req.body?.externalAccountId || "",
      );
      const feePercent = readText(
        req.body?.developer_fee_percent ||
          req.body?.developerFeePercent ||
          service.config.developerFeePercent,
      );

      const address = await service.createLiquidationAddress(customerId, {
        payment_rail: "pix",
        currency: "brl",
        external_account_id: externalAccountId || undefined,
        custom_developer_fee_percent: feePercent || undefined,
      });

      logger.info(
        `[bridge] liquidation address created for customer ${customerId}`,
      );
      res
        .status(201)
        .json({ success: true, liquidation_address: address });
    } catch (error: any) {
      logger.error(
        `[bridge] createPixLiquidationAddress failed: ${error.message}`,
      );
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to create liquidation address.",
      });
    }
  }

  static async listLiquidationAddresses(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const addresses = await getBridgeService().listLiquidationAddresses(
        String(req.params.id),
      );
      res.json({ success: true, liquidation_addresses: addresses });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to list liquidation addresses.",
      });
    }
  }

  static async getLiquidationAddress(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const address = await getBridgeService().getLiquidationAddress(
        String(req.params.id),
        String(req.params.liquidationAddressId),
      );
      res.json({ success: true, liquidation_address: address });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Liquidation address not found.",
      });
    }
  }

  // ── Transfers ─────────────────────────────────────────────────

  static async createCryptoToPixTransfer(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = readText(
        req.body?.on_behalf_of ||
          req.body?.onBehalfOf ||
          req.body?.customer_id ||
          req.body?.customerId ||
          "",
      );
      const amount = readText(req.body?.amount || req.body?.amount_brl || "0");
      const externalAccountId = readText(
        req.body?.external_account_id ||
          req.body?.externalAccountId ||
          "",
      );
      const stellarAddress = readText(
        req.body?.from_address || req.body?.fromAddress || "",
      );
      const sourceChain = readText(
        req.body?.source_chain || req.body?.sourceChain,
        service.config.defaultSourceChain,
      );

      assertBridgeAmountInRange(
        amount,
        service.config.minBrlAmount,
        service.config.maxBrlAmount,
        "BRL",
      );

      const transfer = await service.createTransfer({
        on_behalf_of: customerId,
        developer_fee_percent:
          readText(
            req.body?.developer_fee_percent ||
              req.body?.developerFeePercent ||
              "",
          ) || undefined,
        source: {
          payment_rail: sourceChain as any,
          currency: "usdc",
          from_address: stellarAddress || undefined,
        },
        destination: {
          amount,
          payment_rail: "pix",
          currency: "brl",
          external_account_id: externalAccountId || undefined,
        },
      });

      logger.info(`[bridge] crypto-to-pix transfer created: ${transfer.id}`);
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      logger.error(
        `[bridge] createCryptoToPixTransfer failed: ${error.message}`,
      );
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to create transfer."),
      });
    }
  }

  static async getTransfer(req: Request, res: Response): Promise<void> {
    try {
      const transfer = await getBridgeService().getTransfer(
        String(req.params.transferId),
      );
      res.json({ success: true, transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Transfer not found."),
      });
    }
  }

  static async syncTransfer(req: Request, res: Response): Promise<void> {
    try {
      const transfer = await getBridgeService().getTransfer(
        String(req.params.transferId),
      );
      res.json({ success: true, transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to sync transfer."),
      });
    }
  }

  // ── Exchange Rates ────────────────────────────────────────────

  static async getExchangeRate(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const from = readText(req.query.from, "usd");
      const to = readText(req.query.to, "brl");
      const rate = await getBridgeService().getExchangeRate(from, to);
      res.json({ success: true, exchange_rate: rate });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to get exchange rate.",
      });
    }
  }

  static async estimatePayout(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const amount = readText(req.body?.amount || "0");
      const from = readText(
        req.body?.source_currency || req.body?.from,
        service.config.defaultSourceCurrency,
      );
      const to = readText(
        req.body?.destination_currency || req.body?.to,
        service.config.defaultDestinationCurrency,
      );

      const rate = await service.getExchangeRate(from, to);
      const rateValue = parseFloat(
        (rate as Record<string, unknown>)?.rate?.toString() || "0",
      );
      const estimated = (parseFloat(amount) * rateValue).toFixed(2);

      res.json({
        success: true,
        estimate: {
          source_amount: amount,
          source_currency: from,
          destination_amount: estimated,
          destination_currency: to,
          rate,
          is_estimate: true,
        },
      });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to estimate payout.",
      });
    }
  }

  // ── Virtual Accounts ──────────────────────────────────────────

  static async createBrlVirtualAccount(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const service = getBridgeService();
      const destinationWallet = readText(
        req.body?.destination_wallet ||
          req.body?.destinationWallet ||
          "",
      );
      const destinationChain = readText(
        req.body?.destination_chain || req.body?.destinationChain,
        service.config.defaultSourceChain,
      );

      const virtualAccount = await service.createBrlVirtualAccount(
        customerId,
        destinationWallet,
        destinationChain,
      );

      logger.info(
        `[bridge] BRL virtual account created for customer ${customerId}`,
      );
      res
        .status(201)
        .json({ success: true, virtual_account: virtualAccount });
    } catch (error: any) {
      logger.error(
        `[bridge] createBrlVirtualAccount failed: ${error.message}`,
      );
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to create virtual account.",
      });
    }
  }

  static async listVirtualAccounts(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const accounts = await getBridgeService().listVirtualAccounts(
        String(req.params.id),
      );
      res.json({ success: true, virtual_accounts: accounts });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to list virtual accounts.",
      });
    }
  }

  static async getVirtualAccount(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const account = await getBridgeService().getVirtualAccount(
        String(req.params.virtualAccountId),
      );
      res.json({ success: true, virtual_account: account });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Virtual account not found.",
      });
    }
  }
}
