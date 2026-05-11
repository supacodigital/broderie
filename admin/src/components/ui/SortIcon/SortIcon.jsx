import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'

export default function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
  return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
}
