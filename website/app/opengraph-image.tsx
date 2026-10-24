import { createOpenGraphImage, openGraphSize } from "@/lib/open-graph-image";

export const alt =
  "PluginsX — seu servidor, suas regras. Plugins, licenças e ferramentas PaperMC.";
export const size = openGraphSize;
export const contentType = "image/png";

export default function Image() {
  return createOpenGraphImage();
}
