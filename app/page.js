import { HarborExperience } from "@/src/components/HarborExperience";

export default function LandingPage() {
  return (
    <main className="landing" aria-labelledby="landing-title">
      <HarborExperience className="landing-harbor" interactive navigation />
      <div className="harbor-identity">
        <h1 id="landing-title">Crimson Wheeler</h1>
        <p>Systems · gameplay · XR</p>
        <p className="harbor-value">I turn ambitious ideas into working, playable experiences.</p>
      </div>
      <p className="harbor-instruction">Drag to explore <span aria-hidden="true">·</span> Catch a star <span aria-hidden="true">·</span> Sail somewhere</p>
    </main>
  );
}
