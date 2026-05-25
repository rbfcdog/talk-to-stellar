import Navbar from './Navbar';
import Hero from './Hero';
import SimulatorSection from './SimulatorSection';
import ScrollFeatures from './ScrollFeatures';
import Pathfinding from './Pathfinding';
import ProblemSection from './ProblemSection';
import SolutionSection from './SolutionSection';
import FAQSection from './FAQSection';
import CTA from './CTA';
import Footer from './Footer';
import FloatingCTA from './FloatingCTA';

export default function App() {
  return (
    <div className="min-h-screen bg-[#0C1421] text-white selection:bg-[#00D2FF]/30 selection:text-white font-sans">

      <Navbar />
      
      <main className="relative z-10 flex flex-col items-center w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
      <FloatingCTA />
    </div>
  );
}
