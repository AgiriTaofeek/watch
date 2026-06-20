// Locale switcher refs:
// - Paraglide docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
// - Router example: https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#switching-locale

import { m } from "#/paraglide/messages"
import { getLocale, locales, setLocale } from "#/paraglide/runtime"

export default function ParaglideLocaleSwitcher() {
  const currentLocale = getLocale()

  return (
    <fieldset className="flex items-center gap-2 border-none p-0 m-0">
      <legend className="sr-only">{m.language_label()}</legend>
      <span className="opacity-85 text-sm">
        {m.current_locale({ locale: currentLocale })}
      </span>
      <div className="flex gap-1">
        {locales.map((locale) => {
          const isActive = locale === currentLocale
          return (
            <button
              key={locale}
              type="button"
              onClick={() => setLocale(locale)}
              aria-pressed={isActive}
              className={[
                "cursor-pointer px-3 py-1.5 rounded-full border text-xs font-medium tracking-wide transition-colors",
                isActive
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent border-border hover:border-foreground/40",
              ].join(" ")}
            >
              {locale.toUpperCase()}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
