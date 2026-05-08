import HeroSection          from './sections/HeroSection.jsx'
import AdvantagesSection    from './sections/AdvantagesSection.jsx'
import CategoriesSection    from './sections/CategoriesSection.jsx'
import FeaturedProductsSection from './sections/FeaturedProductsSection.jsx'
import CraftsSection        from './sections/CraftsSection.jsx'
import TestimonialsSection  from './sections/TestimonialsSection.jsx'
import NewsletterSection    from './sections/NewsletterSection.jsx'

export default function Home() {
  return (
    <>
      <HeroSection />
      <AdvantagesSection />
      <CategoriesSection />
      <FeaturedProductsSection />
      <CraftsSection />
      <TestimonialsSection />
      <NewsletterSection />
    </>
  )
}
