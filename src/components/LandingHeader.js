import Link from "next/link";
import styles from "./HomeArrival.module.css";

export function LandingHeader({ email }) {
  return (
    <section className={styles.landingHeader} aria-labelledby="home-title">
      <div className={styles.landingMeta}>
        <p className={styles.kicker}>Crimson Wheeler</p>
        <p className={styles.disciplines}>Systems · Gameplay · XR</p>
      </div>

      <div className={styles.landingCopy}>
        <h1 id="home-title">I build systems, gameplay, and immersive tools that turn ambitious ideas into working experiences.</h1>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/projects/">View Work</Link>
          <a className={styles.secondaryAction} href={`mailto:${email}`}>Contact</a>
        </div>
      </div>
    </section>
  );
}
