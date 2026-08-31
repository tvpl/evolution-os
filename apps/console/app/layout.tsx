import type { ReactNode } from "react";

export const metadata = {
  title: "EvolutionOS Console",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "2rem auto", maxWidth: 720 }}>
        <h1>EvolutionOS</h1>
        {children}
      </body>
    </html>
  );
}
