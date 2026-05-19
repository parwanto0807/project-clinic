import Header from '@/components/shared/Header'
import Footer from '@/components/shared/Footer'
import HeroSection from '@/components/home/HeroSection'
import FeaturesSection from '@/components/home/FeaturesSection'
import AboutSection from '@/components/home/AboutSection'
import ServicesSection from '@/components/home/ServicesSection'
import CircumcisionSection from '@/components/home/CircumcisionSection'
import FacilitiesSection from '@/components/home/FacilitiesSection'
import DoctorsSection from '@/components/home/DoctorsSection'
import DoctorScheduleSection from '@/components/home/DoctorScheduleSection'
import TestimonialsSection from '@/components/home/TestimonialsSection'
import FAQSection from '@/components/home/FAQSection'
import ContactSection from '@/components/home/ContactSection'
import CTASection from '@/components/home/CTASection'

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="overflow-x-hidden w-full relative">
        <HeroSection />
        <FeaturesSection />
        <AboutSection />
        <CircumcisionSection />
        <ServicesSection />
        <FacilitiesSection />
        <DoctorsSection />
        <DoctorScheduleSection />
        <TestimonialsSection />
        <FAQSection />
        <ContactSection />
        <CTASection />
      </main>
      <Footer />
    </>
  )
}
