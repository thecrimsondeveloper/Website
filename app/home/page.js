import Link from "next/link";
import { LandingHeader } from "@/src/components/LandingHeader";
import { ReloadIntroOverlay } from "@/src/components/ReloadIntroOverlay";
import { SiteHeader } from "@/src/components/SiteHeader";
import { profile, projects } from "@/src/models/portfolio-model";

export const metadata = { title: "Portfolio" };

export default function HomePage() {
  return (
    <div className="site-page">
      <ReloadIntroOverlay />
      <SiteHeader />
      <main>
        <LandingHeader email={profile.email} />

        <section className="content-section" aria-labelledby="selected-work">
          <div className="section-heading">
            <p className="eyebrow">Selected work</p>
            <h2 id="selected-work">Across systems, games, and immersive tools.</h2>
          </div>
          <div className="project-grid">
            {projects.slice(0, 4).map((project, index) => (
              <article className="project-card" key={project.title}>
                <span className="project-index">0{index + 1}</span>
                <p className="project-kind">{project.kind}</p>
                <h3>{project.title}</h3>
                <p>{project.description}</p>
                <ul aria-label="Technologies">
                  {project.technologies.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>
          <Link className="section-link" href="/projects/">View all selected work <span aria-hidden="true">→</span></Link>
        </section>

        <section className="closing-section">
          <p className="eyebrow">Build with intention</p>
          <h2>Strong architecture should make the experience feel simpler.</h2>
          <a className="primary-link light" href={`mailto:${profile.email}`}>Contact Crimson</a>
        </section>
      </main>
    </div>
  );
}
