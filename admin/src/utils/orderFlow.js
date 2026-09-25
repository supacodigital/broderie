/* Parcours d'une commande, pour la page commande de l'admin : où en est-elle,
   et que reste-t-il à faire ? Le statut est un seul champ, mais le paiement
   se lit à part (entrée « payée » de l'historique → order.paid_at) : une
   facture peut être expédiée avant d'être réglée. */

const UNPAID_ONLINE = ['pending', 'awaiting_payment', 'payment_failed']
const SHIPPED_OR_AFTER = ['shipped', 'delivered']

export const isPickupOrder = (order) =>
  order.payment_method === 'pickup' || ['pending_pickup', 'ready_for_pickup'].includes(order.status)

/* Étapes affichées dans la frise. État : done, current, waiting (en attente
   alors que la suite a avancé — une facture expédiée avant paiement) ou todo. */
export function buildSteps(order) {
  const { status } = order
  const paid = !!order.paid_at

  if (isPickupOrder(order)) {
    return [
      { key: 'received', label: 'Reçue', state: 'done' },
      {
        key: 'ready', label: 'Prête pour le retrait',
        state: status === 'pending_pickup' ? 'current' : 'done',
      },
      {
        key: 'collected', label: 'Payée et retirée',
        state: paid || ['paid', 'delivered'].includes(status) ? 'done'
          : status === 'ready_for_pickup' ? 'current' : 'todo',
      },
    ]
  }

  const preparing = status === 'processing'
  return [
    { key: 'received', label: 'Reçue', state: 'done' },
    {
      key: 'paid', label: 'Payée',
      state: paid ? 'done'
        : ['processing', ...SHIPPED_OR_AFTER].includes(status) ? 'waiting'
        : 'current',
    },
    {
      key: 'processing', label: 'En préparation',
      state: SHIPPED_OR_AFTER.includes(status) ? 'done'
        : preparing || status === 'paid' ? 'current'
        : 'todo',
    },
    {
      key: 'shipped', label: 'Expédiée',
      state: status === 'delivered' ? 'done' : status === 'shipped' ? 'current' : 'todo',
    },
    { key: 'delivered', label: 'Livrée', state: status === 'delivered' ? 'done' : 'todo' },
  ]
}

/* Étape en cours, en une phrase : titre, explication et ton du bandeau.
   `kind` indique à la page quelles actions proposer. */
export function currentStage(order) {
  const { status } = order
  const pickup = isPickupOrder(order)

  if (status === 'cancelled') return { kind: 'closed', tone: 'muted', title: 'Commande annulée' }
  if (status === 'refunded')  return { kind: 'closed', tone: 'muted', title: 'Commande remboursée' }

  if (status === 'payment_failed') {
    return {
      kind: 'online_unpaid', tone: 'danger', title: 'Paiement refusé',
      description: 'Le motif est indiqué dans « Transaction ». La cliente peut réessayer ; sans paiement, la commande est annulée automatiquement au bout de 2 heures.',
    }
  }
  if (UNPAID_ONLINE.includes(status)) {
    return {
      kind: 'online_unpaid', tone: 'warning', title: 'Paiement en ligne en attente',
      description: 'La cliente n\'a pas terminé son paiement Twint ou carte. Sans paiement, la commande est annulée automatiquement au bout de 2 heures.',
    }
  }
  if (status === 'pending_invoice') {
    return {
      kind: 'invoice_unpaid', tone: 'warning', title: 'En attente du paiement de la facture',
      description: 'Marquez la commande comme payée dès réception du paiement.',
    }
  }

  if (pickup) {
    if (status === 'pending_pickup') {
      return {
        kind: 'pickup_prepare', tone: 'action', title: 'À préparer pour le retrait',
        description: 'Préparez la commande, puis prévenez la cliente qu\'elle peut venir la chercher.',
      }
    }
    if (status === 'ready_for_pickup') {
      return {
        kind: 'pickup_ready', tone: 'action', title: 'Prête — en attente de la cliente',
        description: 'La cliente a été prévenue par e-mail. Encaissez le montant au moment du retrait.',
      }
    }
    return { kind: 'done', tone: 'success', title: 'Payée et retirée' }
  }

  if (status === 'paid') {
    return {
      kind: 'to_ship', tone: 'action', title: 'À préparer et expédier',
      description: 'Paiement reçu. Préparez le colis, choisissez le mode d\'envoi puis marquez la commande comme expédiée.',
    }
  }
  if (status === 'processing') {
    return {
      kind: 'to_ship', tone: 'action', title: 'En préparation — à expédier',
      description: 'Choisissez le mode d\'envoi puis marquez la commande comme expédiée.',
    }
  }
  if (status === 'shipped') {
    return {
      kind: 'shipped', tone: 'info', title: 'Expédiée',
      description: order.tracking_number
        ? `Colis confié à La Poste — suivi ${order.tracking_number}.`
        : 'Colis expédié, sans numéro de suivi enregistré.',
    }
  }
  if (status === 'delivered') return { kind: 'done', tone: 'success', title: 'Livrée — commande terminée' }

  return { kind: 'other', tone: 'info', title: 'Commande reçue' }
}
