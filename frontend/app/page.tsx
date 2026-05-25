import { ApiShowcase } from '@/components/landing-v2/ApiShowcase'
import { Channels } from '@/components/landing-v2/Channels'
import { Faq } from '@/components/landing-v2/Faq'
import { Features } from '@/components/landing-v2/Features'
import { FinalCta } from '@/components/landing-v2/FinalCta'
import { Footer } from '@/components/landing-v2/Footer'
import { Hero } from '@/components/landing-v2/Hero'
import { HowItWorks } from '@/components/landing-v2/HowItWorks'
import { Navbar } from '@/components/landing-v2/Navbar'
import { Problem } from '@/components/landing-v2/Problem'

export default function HomePage() {
  return (
    <div id="top">
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Features />
        <HowItWorks />
        <Channels />
        <ApiShowcase />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
