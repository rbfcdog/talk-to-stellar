import { ApiShowcase } from '@/components/landing-v2/ApiShowcase'
import { Channels } from '@/components/landing-v2/Channels'
import { Features } from '@/components/landing-v2/Features'
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
      </main>
      <Footer />
    </div>
  )
}
