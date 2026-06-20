import { withThemeByClassName } from "@storybook/addon-themes"
import type { Preview } from "@storybook/react-vite"

import "./preview.css"
import "../src/styles.css"

const preview: Preview = {
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
