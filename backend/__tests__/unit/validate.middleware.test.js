const { z } = require('zod');
const { validate } = require('../../middlewares/validate');

const schema = z.object({
  email: z.string().email(),
  qty:   z.number().int().min(1).optional().default(1),
});

describe('middlewares/validate', () => {
  test('body valide : remplace req.body par les données parsées et appelle next()', () => {
    const req = { body: { email: 'a@b.ch' } };
    const next = jest.fn();
    validate(schema)(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ email: 'a@b.ch', qty: 1 }); // default appliqué
  });

  test('body invalide : next(AppError 400) avec le détail des champs', () => {
    const req = { body: { email: 'pas-un-email' } };
    const next = jest.fn();
    validate(schema)(req, {}, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.errors[0].field).toBe('email');
  });

  test('source "query" : résultat dans req.validatedQuery, req.query intact', () => {
    const req = { query: { email: 'a@b.ch', qty: 3 } };
    const next = jest.fn();
    validate(schema, 'query')(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.validatedQuery).toEqual({ email: 'a@b.ch', qty: 3 });
  });
});
