import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { errorLogMessage } from '../../utils/error-log';
import { logger } from '../../utils/logger';

function validationLogSummary(error: unknown): string {
  if (!(error instanceof ZodError)) return errorLogMessage(error);
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'request'}:${issue.code}`)
    .join(', ');
}

export const validate = (schema: ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error: unknown) {
      logger.warn(`[validation] request rejected: ${validationLogSummary(error)}`);

      const formattedErrors = error instanceof ZodError
        ? error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          }))
        : [{
            path: 'validation',
            message: 'Validation failed. Check request format.',
          }];

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formattedErrors,
      });
    }
  };
