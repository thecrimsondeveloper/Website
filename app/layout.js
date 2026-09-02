import "./globals.css";

export const metadata = {
  title: {
    default: "Crimson Wheeler",
    template: "%s — Crimson Wheeler",
  },
  description: "Systems, playable experiments, and human-centered tools by Crimson Wheeler.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
