import Link from "next/link";
import { HarborExperience } from "@/src/components/HarborExperience";

export default function LandingPage() {
  return (
    <main className="landing">
      <HarborExperience className="landing-harbor" interactive />

      <section className="landing-copy" aria-labelledby="landing-title">
        <p className="eyebrow">A quiet harbor of systems and play</p>
        <h1 id="landing-title"><span>Crimson</span><span>Wheeler</span></h1>
      </section>

      <div className="landing-footer">
        <p>Cast toward a star, or continue ashore.</p>
        <Link className="enter-link" href="/home/">Enter portfolio <span aria-hidden="true">→</span></Link>
      </div>
    </main>
  );
}
