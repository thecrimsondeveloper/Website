import { SiteHeader } from "@/src/components/SiteHeader";
import { profile } from "@/src/models/portfolio-model";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="site-page">
      <SiteHeader />
      <main className="inner-page about-page">
        <header className="page-heading">
          <p className="eyebrow">About</p>
          <h1>Technical depth, human scale.</h1>
        </header>
        <section className="about-grid">
          <div className="about-statement">
            <p>I’m Crimson Wheeler, a systems architect, gameplay engineer, XR developer, and agentic engineering builder.</p>
            <p>I work where infrastructure and interaction meet: shaping the architecture beneath a product while staying close to how it feels in someone’s hands.</p>
          </div>
          <aside className="contact-block" aria-labelledby="contact-title">
            <p className="eyebrow" id="contact-title">Connect</p>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.github} rel="noreferrer" target="_blank">GitHub <span aria-hidden="true">↗</span></a>
            <a href={profile.linkedin} rel="noreferrer" target="_blank">LinkedIn <span aria-hidden="true">↗</span></a>
            <a href="https://github.com/thecrimsondeveloper/Website/blob/main/ATTRIBUTION.md" rel="noreferrer" target="_blank">Harbor credits <span aria-hidden="true">↗</span></a>
          </aside>
        </section>
      </main>
    </div>
  );
}
