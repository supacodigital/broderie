const { updateProfileSchema } = require('../../validators/user.validator');

// Validation du profil client (CLI-06) — la route n'en avait aucune
describe('user.validator — updateProfileSchema', () => {
  test('accepte camelCase et snake_case, ramenés au snake_case', () => {
    expect(updateProfileSchema.parse({ firstName: 'Marc', lastName: 'Dupont' }))
      .toEqual({ first_name: 'Marc', last_name: 'Dupont' });
    expect(updateProfileSchema.parse({ first_name: 'Marc', last_name: 'Dupont' }))
      .toEqual({ first_name: 'Marc', last_name: 'Dupont' });
  });

  test('retire les espaces superflus et ignore l\'adresse e-mail', () => {
    expect(updateProfileSchema.parse({ first_name: ' Marc ', last_name: 'Dupont', email: 'x@y.ch' }))
      .toEqual({ first_name: 'Marc', last_name: 'Dupont' });
  });

  test('refuse un prénom absent ou vide', () => {
    const missing = updateProfileSchema.safeParse({ last_name: 'Dupont' });
    expect(missing.success).toBe(false);
    expect(missing.error.issues[0]).toMatchObject({ path: ['first_name'], message: 'Le prénom est obligatoire.' });

    expect(updateProfileSchema.safeParse({ first_name: '   ', last_name: 'Dupont' }).success).toBe(false);
  });
});
