import type { Metadata } from "next";
import localFont from "next/font/local";

import "@/styles/globals.css";
import { CartProvider } from "@/components/cart/CartProvider";
import { AccountNav } from "@/components/ui/AccountNav";
import { MiniFooter } from "@/components/ui/MiniFooter";
import { SiteBackground } from "@/components/ui/SiteBackground";
import { settings } from "@/lib";
import { DefaultProviders } from "@/lib/providers";
import { openGraphImageAlt, openGraphImagePath, siteOrigin } from "@/lib/seo";
import { appearanceBootstrap } from "@/lib/site-themes";

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
    "Plugins para PaperMC, versões para baixar e licenças para administrar o acesso dos seus servidores.",
  authors: [{ name: settings.author, url: settings.links.github }],
  creator: settings.author,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "PluginsX",
    title: "PluginsX — seu servidor, suas regras",
    description:
      "Plugins para PaperMC, versões para baixar e licenças para administrar o acesso dos seus servidores.",
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
      "Plugins para PaperMC, versões para baixar e licenças para administrar o acesso dos seus servidores.",
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
      data-site-theme="default"
      data-scene-motion="auto"
      suppressHydrationWarning
    >
      <head>
        <script
          id="site-appearance-init"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Static internal bootstrap validates saved preferences before applying them.
          dangerouslySetInnerHTML={{ __html: appearanceBootstrap }}
        />
      </head>
      <body className="antialiased relative isolate flex min-h-screen w-full flex-col overflow-x-hidden">
        <SiteBackground />
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
