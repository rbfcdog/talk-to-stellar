import type { Request, Response, NextFunction } from "express";
import { getBridgeService } from "../../integrations/bridge";

function readBearerToken(req: Request): string {
  const header = String(req.headers.authorization || "").trim();
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return "";
}

export function requireBridgeEnabled(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const service = getBridgeService();
  if (!service.enabled) {
    res.status(503).json({
      success: false,
      message: "Bridge integration is not enabled.",
    });
    return;
  }
  next();
}

export function requireBridgeMainnetEnabled(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const service = getBridgeService();
  if (!service.config.enableMainnetMoneyMovement) {
    res.status(403).json({
      success: false,
      message:
        "Mainnet money movement is disabled. Set BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=true.",
    });
    return;
  }

  const body = req.body || {};
  const manualConfirmationRequired = service.config.requireManualConfirmation;
  const confirmed =
    body.confirm_mainnet === true ||
    String(body.confirm_mainnet || "").trim().toLowerCase() === "true";

  if (manualConfirmationRequired && !confirmed) {
    res.status(400).json({
      success: false,
      message:
        "Manual confirmation required. Set confirm_mainnet: true in the request body.",
    });
    return;
  }

  next();
}

export function requireBridgeAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = readBearerToken(req);
  const opsSecret = String(
    req.headers["x-international-transfer-ops-secret"] ||
      req.headers["x-ops-token"] ||
      "",
  ).trim();

  const expectedOps = String(
    process.env.INTERNATIONAL_TRANSFER_OPS_SECRET ||
      process.env.OPS_DASHBOARD_TOKEN ||
      "",
  ).trim();

  if (token && expectedOps && token === expectedOps) {
    next();
    return;
  }

  if (opsSecret && expectedOps && opsSecret === expectedOps) {
    next();
    return;
  }

  res.status(401).json({
    success: false,
    message: "Bridge API requires operator authorization.",
  });
}

export function assertBridgeAmountInRange(
  amountStr: string,
  minStr: string,
  maxStr: string,
  label: string,
): void {
  const amount = parseFloat(amountStr);
  const min = parseFloat(minStr);
  const max = parseFloat(maxStr);

  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error(`Invalid ${label} amount: ${amountStr}`);
  }
  if (amount < min) {
    throw new Error(`${label} amount ${amountStr} is below minimum ${minStr}`);
  }
  if (amount > max) {
    throw new Error(`${label} amount ${amountStr} exceeds maximum ${maxStr}`);
  }
}
