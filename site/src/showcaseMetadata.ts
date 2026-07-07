export const CANONICAL_SITE_URL = "https://ui.nirs4all.org/";
export const BRAND_ASSET_BASE_PATH = "./assets/brand/nirs4all-ui";
export const REUSABLE_BRAND_BASE_PATH = "./assets/brands";
export const REUSABLE_STYLE_BASE_PATH = "./assets/styles";
export const REUSABLE_MOTION_BASE_PATH = "./assets/motion";

export interface PublicationAsset {
  name: string;
  role: string;
  path: string;
}

export const PUBLICATION_ASSETS: readonly PublicationAsset[] = [
  { name: "logo.svg", role: "Header and Open Graph identity", path: "./logo.svg" },
  { name: "favicon.ico", role: "Legacy browser and crawler icon", path: "./favicon.ico" },
  { name: "favicon.svg", role: "Browser icon and manifest icon", path: "./favicon.svg" },
  {
    name: "assets/brand/nirs4all-ui/og.png",
    role: "1200 x 630 social preview image",
    path: `${BRAND_ASSET_BASE_PATH}/og.png`,
  },
  {
    name: "assets/brand/nirs4all-ui/icon.svg",
    role: "Stable GitHub Pages icon URL",
    path: `${BRAND_ASSET_BASE_PATH}/icon.svg`,
  },
  {
    name: "assets/brand/nirs4all-ui/horizontal.svg",
    role: "Horizontal package mark",
    path: `${BRAND_ASSET_BASE_PATH}/horizontal.svg`,
  },
  {
    name: "assets/brand/nirs4all-ui/stacked.svg",
    role: "Stacked package mark",
    path: `${BRAND_ASSET_BASE_PATH}/stacked.svg`,
  },
  {
    name: "assets/brand/nirs4all-ui/icon-512.png",
    role: "Installable app icon",
    path: `${BRAND_ASSET_BASE_PATH}/icon-512.png`,
  },
  {
    name: "assets/brands/nirs4all-core/horizontal.svg",
    role: "Reusable ecosystem brand SVG",
    path: `${REUSABLE_BRAND_BASE_PATH}/nirs4all-core/horizontal.svg`,
  },
  {
    name: "assets/styles/nirs4all-default.css",
    role: "Default NIRS4ALL visual tokens and host utility classes",
    path: `${REUSABLE_STYLE_BASE_PATH}/nirs4all-default.css`,
  },
  {
    name: "assets/motion/nirs-spectra.svg",
    role: "Reusable animated NIR spectra motif",
    path: `${REUSABLE_MOTION_BASE_PATH}/nirs-spectra.svg`,
  },
  { name: "robots.txt", role: "GitHub Pages crawler policy", path: "./robots.txt" },
  { name: "sitemap.xml", role: "Canonical UI domain URL", path: "./sitemap.xml" },
  { name: "CNAME", role: "GitHub Pages custom domain", path: "./CNAME" },
  { name: "site.webmanifest", role: "Install metadata", path: "./site.webmanifest" },
] as const;
