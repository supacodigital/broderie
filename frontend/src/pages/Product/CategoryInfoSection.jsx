import s from './CategoryInfoSection.module.css'

export default function CategoryInfoSection({ categoryName, categoryDescription }) {
  if (!categoryDescription) return null

  return (
    <section className={s.section}>
      {categoryName && <p className={s.eyebrow}>{categoryName}</p>}
      <p className={s.desc}>{categoryDescription}</p>
    </section>
  )
}
