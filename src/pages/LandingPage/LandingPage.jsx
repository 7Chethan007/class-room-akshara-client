import Navbar from '../../components/Navbar/Navbar';
import Hero from '../../components/Hero/Hero';
import Footer from '../../components/Footer/Footer';
import './LandingPage.css';

/**
 * LandingPage — composes Navbar, Hero, Footer
 *
 * This is the single page entry-point for the app.
 * Additional sections (e.g. Pricing, Testimonials) can
 * be inserted between Hero and Footer without modifying
 * existing components (Open/Closed Principle).
 */
function LandingPage() {
  return (
    <div className="landing-page">
      <Navbar />
      <Hero />
      <Footer />
    </div>
  );
}

export default LandingPage;
