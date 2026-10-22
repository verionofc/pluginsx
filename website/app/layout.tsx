import type { Metadata } from "next";

import "@/styles/globals.css";
import { AccountNav } from "@/components/ui/AccountNav";
import { MiniFooter } from "@/components/ui/MiniFooter";
import { settings } from "@/lib";
import { DefaultProviders } from "@/lib/providers";

export const metadata: Metadata = {
  title: {
    default: "PluginsX",
    template: "PluginsX | %s",
  },
  description: "Plugins e ferramentas do projeto PluginsX.",
  authors: [{ name: settings.author, url: settings.links.github }],
  creator: settings.author,
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
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <body className="antialiased relative isolate flex min-h-screen w-full flex-col overflow-x-hidden bg-black">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('/images/minecraft-10th-5120x2880-23769.jpg')",
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
        <DefaultProviders>
          {children}
          <MiniFooter />
        </DefaultProviders>
        <AccountNav />
      </body>
    </html>
  );
}
