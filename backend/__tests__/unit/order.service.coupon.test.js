// Tests unitaires — logique coupon + TVA dans order.service
// Tous les repositories sont mockés, aucune BDD requise

jest.mock('../../repositories/order.repository');
jest.mock('../../repositories/cart.repository');
jest.mock('../../repositories/user.repository');
jest.mock('../../repositories/payment.repository');
jest.mock('../../repositories/coupon.repository');
jest.mock('../../services/email.service');

const orderRepository   = require('../../repositories/order.repository');
const cartRepository    = require('../../repositories/cart.repository');
const userRepository    = require('../../repositories/user.repository');
const paymentRepository = require('../../repositories/payment.repository');
const couponRepository  = require('../../repositories/coupon.repository');
const emailService      = require('../../services/email.service');
const orderService      = require('../../services/order.service');
const { roundCHF }      = require('../../utils/chf.utils');

const SHIPPING = 8.50;

// Article standard : CHF 49.90 TTC, TVA 8.1%
function makeCartItem(price = '49.90', qty = 1, taxRate = '8.1') {
  return {
    id: 1, product_id: 1, variant_id: null,
    quantity: qty,
    /* unit_price = prix courant renvoyé par cart.repository (promotion prise en
       compte) ; price_snapshot reste la trace de la saisie initiale. C'est
       unit_price que order.service facture. */
    unit_price: price,
    price_snapshot: price,
    tax_rate_snapshot: taxRate,
    is_active: 1, deleted_at: null,
  };
}

function setupMocks({ items, couponResult = null }) {
  cartRepository.findCart.mockResolvedValue({ id: 1 });
  cartRepository.findCartItems.mockResolvedValue(items);
  cartRepository.clearCart.mockResolvedValue();

  couponRepository.validate.mockResolvedValue(
    couponResult ?? { valid: false, error: 'Code invalide.' }
  );
  couponRepository.incrementUsage.mockResolvedValue();

  paymentRepository.create.mockResolvedValue();
  userRepository.findById.mockResolvedValue(null);
  emailService.sendOrderConfirmation.mockResolvedValue();
}

beforeEach(() => jest.clearAllMocks());

describe('order.service — méthode de paiement invalide', () => {
  test('lève AppError 400 si paymentMethod hors liste', async () => {
    cartRepository.findCart.mockResolvedValue({ id: 1 });
    cartRepository.findCartItems.mockResolvedValue([makeCartItem()]);

    await expect(
      orderService.createOrder({ userId: 1, paymentMethod: 'bitcoin' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('order.service — panier vide', () => {
  test('lève AppError 400 si cart null', async () => {
    cartRepository.findCart.mockResolvedValue(null);
    await expect(
      orderService.createOrder({ userId: 1, paymentMethod: 'twint' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('lève AppError 400 si aucun article actif', async () => {
    cartRepository.findCart.mockResolvedValue({ id: 1 });
    cartRepository.findCartItems.mockResolvedValue([
      { ...makeCartItem(), is_active: 0 },
    ]);
    await expect(
      orderService.createOrder({ userId: 1, paymentMethod: 'twint' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('order.service — calcul sans coupon', () => {
  test('total = subtotal + CHF 8.50 frais de port', async () => {
    const items = [makeCartItem('49.90', 1)];
    const subtotal = roundCHF(49.90);

    setupMocks({ items });
    orderRepository.createOrder.mockResolvedValue(1);
    orderRepository.findById.mockResolvedValue({
      id: 1,
      subtotal: subtotal.toFixed(2),
      shipping_cost: SHIPPING.toFixed(2),
      total: roundCHF(subtotal + SHIPPING).toFixed(2),
      discount: '0.00',
      items: [],
    });

    const order = await orderService.createOrder({ userId: 1, paymentMethod: 'twint' });

    expect(orderRepository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: subtotal,
        shippingCost: SHIPPING,
        discount: 0,
        couponCode: null,
      })
    );
    expect(couponRepository.incrementUsage).not.toHaveBeenCalled();
  });
});

describe('order.service — calcul avec coupon percent', () => {
  test('10% sur CHF 49.90 → discount CHF 5.00, total = CHF 53.40', async () => {
    const items = [makeCartItem('49.90', 1)];
    const subtotal = roundCHF(49.90);   // 49.90
    const discount = roundCHF(subtotal * 0.10); // 5.00 (arrondi 0.05)
    const discounted = roundCHF(subtotal - discount); // 44.90
    const total = roundCHF(discounted + SHIPPING);    // 53.40

    setupMocks({
      items,
      couponResult: {
        valid: true,
        discount,
        coupon: { id: 7, code: 'BIENVENUE10' },
      },
    });
    orderRepository.createOrder.mockResolvedValue(1);
    orderRepository.findById.mockResolvedValue({
      id: 1,
      subtotal: discounted.toFixed(2),
      shipping_cost: SHIPPING.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2),
      items: [],
    });

    await orderService.createOrder({
      userId: 1, paymentMethod: 'twint', couponCode: 'BIENVENUE10',
    });

    expect(orderRepository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: discounted,
        discount,
        couponCode: 'BIENVENUE10',
        total,
      })
    );
    /* incrementUsage est déclenché à la confirmation du paiement (webhook Stripe),
       pas à la création de la commande */
    expect(couponRepository.incrementUsage).not.toHaveBeenCalled();
  });
});

describe('order.service — calcul avec coupon fixed', () => {
  test('CHF 5 fixe sur CHF 49.90 → total = CHF 53.40', async () => {
    const items = [makeCartItem('49.90', 1)];
    const subtotal = roundCHF(49.90);
    const discount = 5;
    const discounted = roundCHF(subtotal - discount); // 44.90
    const total = roundCHF(discounted + SHIPPING);    // 53.40

    setupMocks({
      items,
      couponResult: {
        valid: true,
        discount,
        coupon: { id: 9, code: 'FIDELE5' },
      },
    });
    orderRepository.createOrder.mockResolvedValue(1);
    orderRepository.findById.mockResolvedValue({
      id: 1,
      subtotal: discounted.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2),
      items: [],
    });

    await orderService.createOrder({
      userId: 1, paymentMethod: 'card', couponCode: 'FIDELE5',
    });

    expect(orderRepository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ discount, couponCode: 'FIDELE5' })
    );
  });
});

describe('order.service — coupon invalide', () => {
  test('lève AppError 400 si le coupon est rejeté', async () => {
    const items = [makeCartItem('49.90', 1)];
    setupMocks({
      items,
      couponResult: { valid: false, error: 'Ce code promo est expiré.' },
    });
    couponRepository.validate.mockResolvedValue({ valid: false, error: 'Ce code promo est expiré.' });

    await expect(
      orderService.createOrder({ userId: 1, paymentMethod: 'twint', couponCode: 'ANCIEN' })
    ).rejects.toMatchObject({ statusCode: 400, message: 'Ce code promo est expiré.' });

    expect(couponRepository.incrementUsage).not.toHaveBeenCalled();
    expect(orderRepository.createOrder).not.toHaveBeenCalled();
  });
});

describe('order.service — TVA recalculée après remise', () => {
  test('taxAmount basé sur le montant remisé, frais de port compris', async () => {
    // Article à CHF 100 TTC, TVA 8.1%, coupon 10% = discount CHF 10
    const items = [makeCartItem('100.00', 1, '8.1')];
    const discount = 10;

    /* TVA attendue = (90 remisés + 8.50 de port) × 8.1 / 108.1 = 7.38 au centime.
       Le port suit le taux de la marchandise livrée (ADM-14). */
    const expectedTax = Math.round((90 + SHIPPING) * 8.1 / 108.1 * 100) / 100;

    setupMocks({
      items,
      couponResult: {
        valid: true, discount,
        coupon: { id: 7, code: 'PROMO10' },
      },
    });
    orderRepository.createOrder.mockResolvedValue(1);
    orderRepository.findById.mockResolvedValue({ id: 1, items: [] });

    await orderService.createOrder({ userId: 1, paymentMethod: 'twint', couponCode: 'PROMO10' });

    const callArg = orderRepository.createOrder.mock.calls[0][0];
    expect(callArg.taxAmount).toBe(expectedTax);
    // La TVA sur le total remisé doit être inférieure à celle sur le total brut
    const taxBrut = Math.round((100 + SHIPPING) * 8.1 / 108.1 * 100) / 100;
    expect(callArg.taxAmount).toBeLessThan(taxBrut);
  });

  test('retrait en boutique : TVA sur les seuls articles (pas de port)', async () => {
    const items = [makeCartItem('100.00', 1, '8.1')];
    setupMocks({ items });
    orderRepository.createOrder.mockResolvedValue(1);
    orderRepository.findById.mockResolvedValue({ id: 1, items: [] });

    await orderService.createOrder({ userId: 1, paymentMethod: 'pickup' });

    const callArg = orderRepository.createOrder.mock.calls[0][0];
    expect(callArg.shippingCost).toBe(0);
    expect(callArg.taxAmount).toBe(7.49); // 100 × 8.1 / 108.1
  });
});
