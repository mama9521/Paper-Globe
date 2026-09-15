import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://paper-globe.mtaxmraz.workers.dev'),
  title: 'Paper Globe — Projection Workshop',
  description:
    'Turn any 2:1 equirectangular world map into a printable paper globe, privately in your browser.',
  openGraph: {
    title: 'Paper Globe — Projection Workshop',
    description: 'Any world map. Ready to print.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Paper Globe printable projection workshop',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Paper Globe — Projection Workshop',
    description: 'Any world map. Ready to print.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
