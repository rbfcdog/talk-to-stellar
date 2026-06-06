import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../src/api/middlewares/validation.middleware';
import { logger } from '../src/utils/logger';

function responseMock() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response;
}

describe('validation middleware', () => {
  const schema = z.object({
    body: z.object({
      amount: z.number().positive(),
    }),
    query: z.record(z.string(), z.unknown()),
    params: z.record(z.string(), z.unknown()),
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  it('continues when the request matches the schema', async () => {
    const request = { body: { amount: 10 }, query: {}, params: {} } as Request;
    const response = responseMock();
    const next = jest.fn() as NextFunction;

    await validate(schema)(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns Zod v4 issues in a stable response shape', async () => {
    const request = { body: { amount: -1 }, query: {}, params: {} } as Request;
    const response = responseMock();
    const next = jest.fn() as NextFunction;

    await validate(schema)(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation failed',
      errors: [
        expect.objectContaining({
          path: 'body.amount',
          code: 'too_small',
        }),
      ],
    });
  });
});
