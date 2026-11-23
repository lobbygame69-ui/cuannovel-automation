import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CuanNovel Orchestrator',
  description: 'Automated novel pipeline for cuannovelkarya'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
