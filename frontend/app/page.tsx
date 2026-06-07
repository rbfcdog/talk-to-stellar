import Navbar from "@/components/landing-reluca/Navbar"
import Hero from "@/components/landing-reluca/Hero"
import ProblemSection from "@/components/landing-reluca/ProblemSection"
import SolutionSection from "@/components/landing-reluca/SolutionSection"
import Pathfinding from "@/components/landing-reluca/Pathfinding"
import SimulatorSection from "@/components/landing-reluca/SimulatorSection"
import ScrollFeatures from "@/components/landing-reluca/ScrollFeatures"
import FAQSection from "@/components/landing-reluca/FAQSection"
import CTA from "@/components/landing-reluca/CTA"
import Footer from "@/components/landing-reluca/Footer"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#080808] text-white selection:bg-[#E59E25]/30 selection:text-white font-sans relative">
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0" />
      <div className="fixed inset-0 bg-gradient-to-b from-transparent via-[#080808]/70 to-[#080808] pointer-events-none z-0" />
      <Navbar />
      <main className="relative z-10 flex flex-col items-center w-full">
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <Pathfinding />
        <SimulatorSection />
        <ScrollFeatures />
        <FAQSection />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
