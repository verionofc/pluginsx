import { createOpenGraphImage, openGraphSize } from "@/lib/open-graph-image";

export const alt =
  "PluginsX — plugins PaperMC, downloads e gestão de licenças para servidores.";
export const size = openGraphSize;
export const contentType = "image/png";

export default function Image() {
  return createOpenGraphImage();
}
