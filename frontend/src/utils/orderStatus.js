import {
  Clock, CreditCard, CheckCircle, Package, Truck, XCircle, RotateCcw,
} from 'lucide-react'

export const STATUS_CFG = {
  pending:          { label: 'En attente',       color: '#d97706', bg: '#fffbeb',  icon: Clock       },
  awaiting_payment: { label: 'Paiement attendu', color: '#ea580c', bg: '#fff7ed', icon: CreditCard  },
  paid:             { label: 'Payée',            color: '#059669', bg: '#ecfdf5', icon: CheckCircle },
  processing:       { label: 'En préparation',   color: '#0891b2', bg: '#ecfeff', icon: Package     },
  shipped:          { label: 'Expédiée',         color: '#2563eb', bg: '#eff6ff', icon: Truck       },
  delivered:        { label: 'Livrée',           color: '#7c3aed', bg: '#f5f3ff', icon: CheckCircle },
  cancelled:        { label: 'Annulée',          color: '#dc2626', bg: '#fef2f2', icon: XCircle     },
  refunded:         { label: 'Remboursée',       color: '#9d174d', bg: '#fdf2f8', icon: RotateCcw   },
}
