import "./globals.css";

export const metadata = {
  title: {
    default: "Crimson Wheeler",
    template: "%s — Crimson Wheeler",
  },
  description: "Systems, playable experiments, and human-centered tools by Crimson Wheeler.",
};

export default function RootLayout({ children }) {
  const navigationTypeScript = `
    try {
      const entry = performance.getEntriesByType("navigation")[0];
      if (entry && entry.type === "reload") {
        document.documentElement.dataset.navigationType = "reload";
      }
    } catch (_) {}
  `;

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: navigationTypeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
