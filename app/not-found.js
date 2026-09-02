import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">404 — Out beyond the harbor</p>
      <h1>This page drifted away.</h1>
      <Link className="primary-link" href="/">Return to shore</Link>
    </main>
  );
}
