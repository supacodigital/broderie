/* Numéro de client (ADM-17) — même format que celui imprimé sur la facture
   (backend/services/invoice.service.js, formatCustomerNumber) : « C » suivi de
   l'identifiant du compte sur 6 chiffres. Une cliente qui le cite au téléphone
   doit pouvoir être retrouvée dans l'admin. */
export const formatCustomerNumber = (userId) => `C${String(userId ?? 0).padStart(6, '0')}`
