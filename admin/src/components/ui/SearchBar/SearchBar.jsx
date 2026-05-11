import { Search } from 'lucide-react'
import s from './SearchBar.module.css'

export default function SearchBar({ value, onChange, placeholder = 'Rechercher…' }) {
  return (
    <div className={s.searchWrap}>
      <Search size={14} className={s.searchIcon} />
      <input
        type="search"
        className={s.searchInput}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
