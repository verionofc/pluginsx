"use client";

import { ThemeProvider } from "next-themes";
import { ViewTransition } from "react";

// import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";

function Providers({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ViewTransition>
        <div className="relative z-10 flex min-h-screen flex-col">
          {/* <Header /> */}
          {/* <main className="flex-1 pt-17.5">{children}</main> */}
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </ViewTransition>
    </ThemeProvider>
  );
}

// export function WebsiteProviders({ children }: ProvidersProps) {
//   return (
//     <Providers>
//       <Header />

//       <main className="pt-17.5">{children}</main>

//       {/* <Cookies /> */}
//     </Providers>
//   );
// }

export { Providers as DefaultProviders };
