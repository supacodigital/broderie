require('dotenv').config();

// Tests unitaires de la logique de validation coupon — isolés sans BDD
// On extrait la logique pure de validate() pour la tester sans pool MySQL

function validateCouponLogic(coupon, orderSubtotal) {
  if (!coupon) return { valid: false, error: 'Code invalide ou inactif.' };

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, error: 'Ce code promo est expiré.' };
  }
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    return { valid: false, error: 'Ce code promo a atteint sa limite d\'utilisation.' };
  }
  const minOrder = parseFloat(coupon.min_order_chf ?? 0);
  if (orderSubtotal < minOrder) {
    return { valid: false, error: `Commande minimum de CHF ${minOrder.toFixed(2)} requise.` };
  }

  const discount = coupon.type === 'percent'
    ? Math.round(orderSubtotal * parseFloat(coupon.value)) / 100
    : Math.min(parseFloat(coupon.value), orderSubtotal);

  return { valid: true, coupon, discount: Math.round(discount * 20) / 20 };
}

describe('coupon.repository — logique validate()', () => {

  describe('coupon inexistant ou inactif', () => {
    test('retourne invalid si coupon null', () => {
      const result = validateCouponLogic(null, 50);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalide/i);
    });
  });

  describe('expiration', () => {
    test('retourne invalid si expires_at dans le passé', () => {
      const coupon = {
        type: 'percent', value: '10', min_order_chf: 0,
        usage_limit: null, used_count: 0,
        expires_at: new Date(Date.now() - 86400000), // hier
      };
      const result = validateCouponLogic(coupon, 50);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/expir/i);
    });

    test('valide si expires_at dans le futur', () => {
      const coupon = {
        type: 'percent', value: '10', min_order_chf: 0,
        usage_limit: null, used_count: 0,
        expires_at: new Date(Date.now() + 86400000), // demain
      };
      const result = validateCouponLogic(coupon, 50);
      expect(result.valid).toBe(true);
    });

    test('valide si expires_at est null (pas de date limite)', () => {
      const coupon = {
        type: 'fixed', value: '5', min_order_chf: 0,
        usage_limit: null, used_count: 0,
        expires_at: null,
      };
      const result = validateCouponLogic(coupon, 30);
      expect(result.valid).toBe(true);
    });
  });

  describe('limite d\'utilisation', () => {
    test('invalid si usage_limit atteinte', () => {
      const coupon = {
        type: 'percent', value: '10', min_order_chf: 0,
        usage_limit: 5, used_count: 5,
        expires_at: null,
      };
      const result = validateCouponLogic(coupon, 50);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/limite/i);
    });

    test('valide si used_count inférieur à usage_limit', () => {
      const coupon = {
        type: 'percent', value: '10', min_order_chf: 0,
        usage_limit: 10, used_count: 4,
        expires_at: null,
      };
      const result = validateCouponLogic(coupon, 50);
      expect(result.valid).toBe(true);
    });

    test('valide si usage_limit est null (illimité)', () => {
      const coupon = {
        type: 'percent', value: '10', min_order_chf: 0,
        usage_limit: null, used_count: 999,
        expires_at: null,
      };
      const result = validateCouponLogic(coupon, 50);
      expect(result.valid).toBe(true);
    });
  });

  describe('montant minimum commande', () => {
    test('invalid si subtotal inférieur au min_order_chf', () => {
      const coupon = {
        type: 'percent', value: '15', min_order_chf: 50,
        usage_limit: null, used_count: 0,
        expires_at: null,
      };
      const result = validateCouponLogic(coupon, 40);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('CHF 50.00');
    });

    test('valide si subtotal exactement égal au min_order_chf', () => {
      const coupon = {
        type: 'percent', value: '15', min_order_chf: 50,
        usage_limit: null, used_count: 0,
        expires_at: null,
      };
      const result = validateCouponLogic(coupon, 50);
      expect(result.valid).toBe(true);
    });

    test('valide si min_order_chf est 0', () => {
      const coupon = {
        type: 'fixed', value: '5', min_order_chf: 0,
        usage_limit: null, used_count: 0,
        expires_at: null,
      };
      const result = validateCouponLogic(coupon, 1);
      expect(result.valid).toBe(true);
    });
  });

  describe('calcul de la réduction — type percent', () => {
    test('10% sur CHF 50 = CHF 5.00', () => {
      const coupon = {
        type: 'percent', value: '10', min_order_chf: 0,
        usage_limit: null, used_count: 0, expires_at: null,
      };
      const result = validateCouponLogic(coupon, 50);
      expect(result.valid).toBe(true);
      expect(result.discount).toBe(5);
    });

    test('15% sur CHF 60 = CHF 9.00', () => {
      const coupon = {
        type: 'percent', value: '15', min_order_chf: 0,
        usage_limit: null, used_count: 0, expires_at: null,
      };
      const result = validateCouponLogic(coupon, 60);
      expect(result.valid).toBe(true);
      expect(result.discount).toBe(9);
    });

    test('résultat arrondi au 0.05 CHF', () => {
      const coupon = {
        type: 'percent', value: '7', min_order_chf: 0,
        usage_limit: null, used_count: 0, expires_at: null,
      };
      // 7% de 49.90 = 3.493 → arrondi à 3.50
      const result = validateCouponLogic(coupon, 49.90);
      // Vérifie que la valeur est bien un multiple de 0.05 (arrondi en cents)
      expect(Math.round(result.discount * 100) % 5).toBe(0);
    });
  });

  describe('calcul de la réduction — type fixed', () => {
    test('CHF 5 fixe sur CHF 30 = CHF 5.00', () => {
      const coupon = {
        type: 'fixed', value: '5', min_order_chf: 0,
        usage_limit: null, used_count: 0, expires_at: null,
      };
      const result = validateCouponLogic(coupon, 30);
      expect(result.valid).toBe(true);
      expect(result.discount).toBe(5);
    });

    test('réduction fixe ne peut pas dépasser le sous-total', () => {
      const coupon = {
        type: 'fixed', value: '20', min_order_chf: 0,
        usage_limit: null, used_count: 0, expires_at: null,
      };
      // Subtotal = 10, réduction plafonnée à 10
      const result = validateCouponLogic(coupon, 10);
      expect(result.valid).toBe(true);
      expect(result.discount).toBeLessThanOrEqual(10);
    });
  });
});
