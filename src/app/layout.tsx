import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Solervia · Sales Agent",
  description: "Workspace privado de prospección comercial de Solervia",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
