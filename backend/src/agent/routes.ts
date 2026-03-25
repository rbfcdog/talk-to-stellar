/**
 * Agent service: orchestrates agent logic and Stellar operations
 */

import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import { v4 as uuidv4 } from "uuid";
import { AgentState, IntentType, ActionType, SessionData } from "./types";
import { AgentGraph } from "./graph";
import { AgentRepository } from "../repositories/agent.repository";
import { logger } from "../utils/logger";
import { getStellarService } from "../services/stellar.service";

/**
 * Validate if a string is a valid UUID
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    id?: string;
    email?: string;
  };
}

export function createAgentRoutes(
  repository: AgentRepository,
  openaiApiKey: string
): Router {
  const router = Router();
  const agentGraph = new AgentGraph(repository, openaiApiKey);

  /**
   * POST /api/agent/query
   * Main endpoint for agent queries
   */
  router.post('/query', (async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { query, session_id } = req.body;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      // Generate or validate session ID
      let sessionId: string;
      if (session_id) {
        if (!isValidUUID(session_id)) {
          return res.status(400).json({ 
            error: "Invalid session_id format. Must be a valid UUID (e.g., 550e8400-e29b-41d4-a716-446655440000)" 
          });
        }
        sessionId = session_id;
      } else {
        sessionId = uuidv4();
      }

      let sessionData = await repository.getSession(sessionId);

      // Initialize session if not exists
      if (!sessionData) {
        sessionData = {
          session_token: uuidv4(),
          user_id: req.user?.userId || req.user?.id || `user_${Date.now()}`,
          email: req.user?.email || 'unknown@example.com',
          created_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        };
        await repository.saveSession(sessionId, sessionData);
      }

      // On every new user message, remove previous assistant messages containing private keys.
      // This ensures secret keys are only visible once and are not kept in conversation history.
      await repository.deletePrivateKeyMessages(sessionId);

      // Get previous state
      const previousState = await repository.getState(sessionId);
      const previousMessages = await repository.getMessages(sessionId, 10);

      // Initialize state
      const state: AgentState = {
        session_id: sessionId,
        session_data: sessionData,
        messages: previousMessages,
        current_input: query,
        detected_intent: IntentType.GENERAL,
        action_type: ActionType.NONE,
        action_params: previousState?.action_params || {},
        pending_payment: previousState?.pending_payment,
        wallet_info: (previousState?.action_params as any)?.wallet_info,
        waiting_for_wallet_input: Boolean((previousState?.action_params as any)?.waiting_for_wallet_input),
        response_message: "",
        success: false,
      };

      // Process through agent graph
      const resultState = await agentGraph.processInput(state);

      logger.info(`Query processed for session: ${sessionId}`);

      return res.status(200).json({
        session_id: sessionId,
        message: resultState.response_message,
        intent: resultState.detected_intent,
        action: resultState.action_type,
        success: resultState.success,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in /query endpoint: ${errorMessage}`);
      next(error);
    }
  }) as RequestHandler);

  /**
   * GET /api/agent/session/:session_id
   * Retrieve session information
   */
  router.get('/session/:session_id', (async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { session_id } = req.params;

      if (!isValidUUID(session_id)) {
        return res.status(400).json({ 
          error: "Invalid session_id format. Must be a valid UUID." 
        });
      }

      const sessionData = await repository.getSession(session_id);
      if (!sessionData) {
        return res.status(404).json({ error: "Session not found" });
      }

      const messages = await repository.getMessages(session_id);

      return res.status(200).json({
        session_id,
        user_id: sessionData.user_id,
        email: sessionData.email,
        public_key: sessionData.public_key,
        created_at: sessionData.created_at,
        last_activity: sessionData.last_activity,
        message_count: messages.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in /session endpoint: ${errorMessage}`);
      next(error);
    }
  }) as RequestHandler);

  /**
   * POST /api/agent/logout
   * Logout and clear session
   */
  router.post('/logout', (async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { session_id } = req.body;

      if (!session_id) {
        return res.status(400).json({ error: "Session ID is required" });
      }
      if (!isValidUUID(session_id)) {
        return res.status(400).json({ 
          error: "Invalid session_id format. Must be a valid UUID." 
        });
      }
      if (!isValidUUID(session_id)) {
        return res.status(400).json({ 
          error: "Invalid session_id format. Must be a valid UUID." 
        });
      }

      await repository.clearSession(session_id);
      logger.info(`Session cleared: ${session_id}`);

      return res.status(200).json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in /logout endpoint: ${errorMessage}`);
      next(error);
    }
  }) as RequestHandler);

  /**
   * POST /api/agent/login
   * Handle user login through agent
   */
  router.post('/login', (async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { email, password, session_id } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const sessionId = session_id || uuidv4();

      // Query user from auth service (same endpoint used by frontend)
      // For now, this is a placeholder. In production, call the user service.
      logger.info(`Login attempt for: ${email}`);

      const sessionData: SessionData = {
        session_token: uuidv4(),
        user_id: `user_${Date.now()}`, // In production, get from auth service
        email,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
      };

      await repository.saveSession(sessionId, sessionData);

      return res.status(200).json({
        session_id: sessionId,
        message: `Bem-vindo, ${email}!`,
        success: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in /login endpoint: ${errorMessage}`);
      next(error);
    }
  }) as RequestHandler);

  /**
   * GET /api/agent/balance/:session_id
   * Get account balance for session
   */
  router.get('/balance/:session_id', (async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { session_id } = req.params;

      if (!isValidUUID(session_id)) {
        return res.status(400).json({ 
          error: "Invalid session_id format. Must be a valid UUID." 
        });
      }

      const sessionData = await repository.getSession(session_id);

      if (!sessionData || !sessionData.public_key) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const stellarService = getStellarService();
      const balance = await stellarService.getBalance(sessionData.public_key);

      return res.status(200).json({ balance });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in /balance endpoint: ${errorMessage}`);
      next(error);
    }
  }) as RequestHandler);

  return router;
}
