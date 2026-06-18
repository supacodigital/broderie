import { useTranslation } from 'react-i18next'
import Seo                       from '../../components/seo/Seo.jsx'
import HeroSection               from './sections/HeroSection.jsx'
import AdvantagesSection         from './sections/AdvantagesSection.jsx'
import FeaturedProductsSection   from './sections/FeaturedProductsSection.jsx'
import CraftsSection             from './sections/CraftsSection.jsx'
import TestimonialsSection       from './sections/TestimonialsSection.jsx'
import NewsletterSection         from './sections/NewsletterSection.jsx'

export default function Home() {
  const { t } = useTranslation()
  return (
    <>
      <Seo title={t('seo.homeTitle')} description={t('seo.homeDesc')} />
      <HeroSection />
      <AdvantagesSection />
      <FeaturedProductsSection />
      <CraftsSection />
      <TestimonialsSection />
      <NewsletterSection />
    </>
  )
}
