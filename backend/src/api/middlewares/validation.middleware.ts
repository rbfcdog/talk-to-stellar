import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validate = (schema: ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error: any) {
      console.log('Validation Error:', error);
      
      let formattedErrors;
      
      if (error.errors && Array.isArray(error.errors)) {
        formattedErrors = error.errors.map((err: any) => ({
          path: err.path.join('.'),
          message: err.message,
          received: err.received,
          expected: err.expected
        }));
      } else if (Array.isArray(error)) {
        formattedErrors = error.map((err: any) => ({
          path: err.path.join('.'),
          message: err.message,
          received: err.received,
          expected: err.expected
        }));
      } else {
        formattedErrors = [{
          path: 'validation',
          message: 'Validation failed. Check request format.',
          details: error.message || 'Unknown validation error'
        }];
      }

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formattedErrors,
      });
    }
  };