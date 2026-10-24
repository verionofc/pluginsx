import type { Metadata } from "next";

export const siteOrigin = "https://pluginsx.vercel.app";
export const openGraphImagePath = "/opengraph-image";
export const openGraphImageAlt =
  "PluginsX — seu servidor, suas regras. Plugins, licenças e ferramentas PaperMC.";

type PageMetadataOptions = {
  title: string;
  description: string;
  path?: string;
  privatePage?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path,
  privatePage = false,
}: PageMetadataOptions): Metadata {
  const shareTitle = `${title} | PluginsX`;
  const canonicalUrl = path ? new URL(path, siteOrigin).toString() : undefined;
  const imageUrl = new URL(openGraphImagePath, siteOrigin).toString();

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl ?? null },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "PluginsX",
      title: shareTitle,
      description,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: openGraphImageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: openGraphImageAlt,
        },
      ],
    },
    ...(privatePage ? { robots: { index: false, follow: false } } : {}),
  };
}
