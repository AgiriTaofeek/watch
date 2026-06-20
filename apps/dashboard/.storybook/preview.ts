import { withThemeByClassName } from "@storybook/addon-themes"
import type { Preview } from "@storybook/react-vite"
import { initialize, mswLoader } from "msw-storybook-addon"

import "./preview.css"
import "../src/styles.css"

initialize()

const preview: Preview = {
  loaders: [mswLoader],
  tags: ["autodocs"],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: "",
        dark: "dark",
      },
      defaultTheme: "dark",
    }),
  ],
}

export default preview
