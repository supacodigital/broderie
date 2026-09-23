/* Lecture / écriture des filtres du catalogue dans l'URL — seule source de vérité */

export const PAGE_SIZE = 20

/* Filtres du catalogue déduits de l'URL (chemin + query string) */
export function readFilters(searchParams, categorySlug) {
  const get = (key) => searchParams.get(key) ?? undefined
  return {
    page:          parseInt(searchParams.get('page')) || 1,
    limit:         PAGE_SIZE,
    // Ancien format ?category=slug conservé pour les liens existants
    category:      categorySlug ?? searchParams.get('category') ?? '',
    brand:         get('brand'),
    q:             get('q'),
    min_price:     get('min_price'),
    max_price:     get('max_price'),
    in_stock:      searchParams.get('in_stock') === 'true' ? true : undefined,
    made_to_order: searchParams.get('made_to_order') === 'true' ? true : undefined,
    sort:          searchParams.get('sort')  ?? 'created_at',
    order:         searchParams.get('order') ?? 'desc',
    featured:      searchParams.get('featured') === 'true' ? true : undefined,
    badge:         get('badge'),
    min_rating:    searchParams.get('min_rating') ? parseInt(searchParams.get('min_rating')) : undefined,
  }
}

/* Query string correspondant aux filtres. La catégorie en est exclue (elle vit
   dans le chemin), ainsi que les valeurs par défaut, pour garder des URLs courtes. */
export function writeSearch(filters) {
  const next = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'category' || key === 'limit') return
    if (value === undefined || value === null || value === '' || value === false) return
    if (key === 'page'  && Number(value) === 1) return
    if (key === 'sort'  && value === 'created_at') return
    if (key === 'order' && value === 'desc') return
    next.set(key, String(value))
  })
  return next.toString()
}
