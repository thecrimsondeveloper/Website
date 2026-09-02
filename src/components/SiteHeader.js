import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/">Crimson Wheeler</Link>
      <nav aria-label="Primary navigation">
        <Link href="/home/">Home</Link>
        <Link href="/projects/">Work</Link>
        <Link href="/about/">About</Link>
      </nav>
    </header>
  );
}
