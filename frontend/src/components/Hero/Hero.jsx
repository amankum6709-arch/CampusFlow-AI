import "./Hero.css";

import HeroLeft from "./HeroLeft";
import HeroRight from "./HeroRight";

function Hero() {
  return (
    <section className="hero">
      <HeroLeft />
      <HeroRight />
    </section>
  );
}

export default Hero;