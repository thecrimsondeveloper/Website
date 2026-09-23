import { HarborExperience } from "@/src/components/HarborExperience";

export default function LandingPage() {
  return (
    <main className="landing" aria-labelledby="landing-title">
      <HarborExperience className="landing-harbor" interactive navigation />
      <div className="harbor-identity">
        <h1 id="landing-title">Crimson Wheeler</h1>
        <p>Systems · gameplay · XR</p>
      </div>
      <p className="harbor-instruction">Drag to look around <span aria-hidden="true">·</span> Choose a destination</p>
    </main>
  );
}
