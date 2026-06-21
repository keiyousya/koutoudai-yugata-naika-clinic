import {
  defineConfig,
  minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

export default defineConfig({
  headLinkOptions: {
    preset: "2023",
  },
  preset: {
    ...minimal2023Preset,
    // favicon.svg は背景透過のため、maskable / apple アイコンに白背景を敷く
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: {
        background: "#ffffff",
      },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: {
        background: "#ffffff",
      },
    },
  },
  images: ["public/favicon.svg"],
});
