import { useState } from 'react'

/**
 * Gère le tri d'une colonne avec alternance asc/desc.
 *
 * @param {string} defaultCol - Colonne de tri par défaut
 * @param {string} defaultDir - Direction par défaut ('asc' | 'desc')
 * @returns {{ sortCol, sortDir, handleSort }}
 */
export function useSort(defaultCol, defaultDir = 'desc') {
  const [sortCol, setSortCol] = useState(defaultCol)
  const [sortDir, setSortDir] = useState(defaultDir)

  const handleSort = (col, onReset) => {
    const newDir = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc'
    setSortCol(col)
    setSortDir(newDir)
    onReset?.()
  }

  return { sortCol, sortDir, handleSort }
}
