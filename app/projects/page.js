import { SiteHeader } from "@/src/components/SiteHeader";
import { projects } from "@/src/models/portfolio-model";

export const metadata = { title: "Selected Work" };

export default function ProjectsPage() {
  return (
    <div className="site-page">
      <SiteHeader />
      <main className="inner-page">
        <header className="page-heading">
          <p className="eyebrow">Selected work</p>
          <h1>Systems with a pulse.</h1>
          <p>Engineering, interactive worlds, and delivery systems designed to remain useful after the first impressive moment.</p>
        </header>
        <section className="project-list" aria-label="Projects">
          {projects.map((project, index) => (
            <article className="project-row" key={project.title}>
              <div className="project-number">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <p className="project-kind">{project.kind}</p>
                <h2>{project.title}</h2>
              </div>
              <div>
                <p>{project.description}</p>
                <ul aria-label="Technologies">
                  {project.technologies.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
