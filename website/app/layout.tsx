import type { Metadata } from "next";
import localFont from "next/font/local";

import "@/styles/globals.css";
import { CartProvider } from "@/components/cart/CartProvider";
import { AccountNav } from "@/components/ui/AccountNav";
import { MiniFooter } from "@/components/ui/MiniFooter";
import { settings } from "@/lib";
import { DefaultProviders } from "@/lib/providers";
import { openGraphImageAlt, openGraphImagePath, siteOrigin } from "@/lib/seo";

const monocraft = localFont({
  src: [
    { path: "./fonts/Monocraft-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Monocraft-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-minecraft",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: "PluginsX — seu servidor, suas regras",
    template: "%s | PluginsX",
  },
  description:
    "Plugins, licenças e ferramentas PaperMC para quem constrói e mantém os próprios mundos.",
  authors: [{ name: settings.author, url: settings.links.github }],
  creator: settings.author,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "PluginsX",
    title: "PluginsX — seu servidor, suas regras",
    description:
      "Plugins, licenças e ferramentas PaperMC para quem constrói e mantém os próprios mundos.",
    url: "/",
    images: [
      {
        url: openGraphImagePath,
        width: 1200,
        height: 630,
        alt: openGraphImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PluginsX — seu servidor, suas regras",
    description:
      "Plugins, licenças e ferramentas PaperMC para quem constrói e mantém os próprios mundos.",
    images: [
      {
        url: openGraphImagePath,
        width: 1200,
        height: 630,
        alt: openGraphImageAlt,
      },
    ],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${monocraft.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="antialiased relative isolate flex min-h-screen w-full flex-col overflow-x-hidden bg-black">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('/images/wallpaper_minecraft_15th-anniversary/wallpaper_minecraft_15th-anniversary_2560x1440.png')",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-black/60 backdrop-blur-[3px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(13,25,15,0.18),rgba(0,0,0,0.56)_82%)]"
        />
        <CartProvider>
          <DefaultProviders>
            {children}
            <MiniFooter />
          </DefaultProviders>
          <AccountNav />
        </CartProvider>
      </body>
    </html>
  );
}
