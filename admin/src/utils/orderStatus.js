import { Clock, Check, Package, Truck, X, RefreshCw, FileText, Store } from 'lucide-react'

/* Configuration centralisée des statuts de commande.
   Utilisée par Dashboard, Orders, Customers — importer depuis ici, jamais redéfinir localement. */
export const STATUS_CFG = {
  pending:          { label: 'En attente',     color: '#d97706', bg: '#fffbeb', dot: '#f59e0b', icon: Clock      },
  awaiting_payment: { label: 'Att. paiement',  color: '#9333ea', bg: '#faf5ff', dot: '#a855f7', icon: Clock      },
  pending_invoice:  { label: 'Facture à payer', color: '#7c3aed', bg: '#f5f3ff', dot: '#8b5cf6', icon: FileText  },
  pending_pickup:   { label: 'Retrait attente', color: '#0891b2', bg: '#ecfeff', dot: '#06b6d4', icon: Store     },
  ready_for_pickup: { label: 'Prête (retrait)',  color: '#059669', bg: '#ecfdf5', dot: '#10b981', icon: Store    },
  paid:             { label: 'Payée',           color: '#059669', bg: '#ecfdf5', dot: '#10b981', icon: Check      },
  processing:       { label: 'En préparation',  color: '#2563eb', bg: '#eff6ff', dot: '#3b82f6', icon: Package    },
  shipped:          { label: 'Expédiée',        color: '#0891b2', bg: '#ecfeff', dot: '#06b6d4', icon: Truck      },
  delivered:        { label: 'Livrée',          color: '#7c3aed', bg: '#f5f3ff', dot: '#8b5cf6', icon: Check      },
  cancelled:        { label: 'Annulée',         color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', icon: X          },
  refunded:         { label: 'Remboursée',      color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af', icon: RefreshCw  },
}
