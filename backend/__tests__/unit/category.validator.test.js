const { categoryShapeSchema, imageUrlSchema } = require('../../validators/category.validator');

describe('category.validator — imageUrlSchema', () => {
  test.each([
    ['/uploads/categories/abc.webp', true],
    ['https://cdn.example.ch/img.png', true],
    ['http://x.test/a.jpg', true],
    ['', true],
  ])('accepte %s', (url, ok) => {
    expect(imageUrlSchema.safeParse(url).success).toBe(ok);
  });

  test.each([
    'javascript:alert(1)',
    'data:text/html,<script>',
    'vbscript:msgbox',
    '  javascript:alert(1)  ',
  ])('rejette %s', (url) => {
    expect(imageUrlSchema.safeParse(url).success).toBe(false);
  });

  test('rejette une URL de plus de 500 caractères', () => {
    expect(imageUrlSchema.safeParse('https://x.test/' + 'a'.repeat(600)).success).toBe(false);
  });
});

describe('category.validator — categoryShapeSchema', () => {
  test('accepte un payload valide', () => {
    const r = categoryShapeSchema.safeParse({
      slug: 'fils-a-broder',
      imageUrl: '/uploads/x.webp',
      sortOrder: 3,
      parentId: 2,
      translations: { fr: { name: 'Fils à broder', description: 'desc' } },
    });
    expect(r.success).toBe(true);
  });

  test('rejette un slug avec espaces / majuscules', () => {
    expect(categoryShapeSchema.safeParse({ slug: 'Fils A Broder' }).success).toBe(false);
  });

  test('rejette un nom de traduction de plus de 120 caractères', () => {
    const r = categoryShapeSchema.safeParse({ translations: { fr: { name: 'x'.repeat(121) } } });
    expect(r.success).toBe(false);
  });

  test('laisse passer parentId (passthrough) pour le controller', () => {
    const r = categoryShapeSchema.safeParse({ parentId: 5 });
    expect(r.success).toBe(true);
  });
});
