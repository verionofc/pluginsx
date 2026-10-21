import type { Metadata } from "next";

import "@/styles/globals.css";
import { settings } from "@/lib";
import { MiniFooter } from "@/components/ui/MiniFooter";
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
        <DefaultProviders>
          {children}
          <MiniFooter />
        </DefaultProviders>
      </body>
    </html>
  );
}
