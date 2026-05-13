import React from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import SimulatorSection from './components/SimulatorSection';
import ScrollFeatures from './components/ScrollFeatures';
import Pathfinding from './components/Pathfinding';
import ProblemSection from './components/ProblemSection';
import SolutionSection from './components/SolutionSection';
import FAQSection from './components/FAQSection';
import CTA from './components/CTA';
import Footer from './components/Footer';
import FloatingCTA from './components/FloatingCTA';

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
