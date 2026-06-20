import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Watch/Design Tokens",
  parameters: { layout: "padded" },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// ── helpers ────────────────────────────────────────────────────────────────

function Swatch({ name, variable }: { name: string; variable: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-12 w-full rounded border border-border"
        style={{ background: `var(${variable})` }}
      />
      <p className="text-xs font-medium">{name}</p>
      <p className="text-xs text-muted-foreground font-mono">{variable}</p>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

// ── stories ────────────────────────────────────────────────────────────────

export const Colors: Story = {
  name: "Colors",
  render: () => (
    <div className="flex flex-col gap-10 max-w-3xl">
      <Section title="Backgrounds">
        <div className="grid grid-cols-4 gap-4">
          <Swatch name="Background" variable="--background" />
          <Swatch name="Card" variable="--card" />
          <Swatch name="Popover" variable="--popover" />
          <Swatch name="Sidebar" variable="--sidebar" />
          <Swatch name="Muted" variable="--muted" />
        </div>
      </Section>

      <Section title="Brand">
        <div className="grid grid-cols-4 gap-4">
          <Swatch name="Primary" variable="--primary" />
          <Swatch name="Secondary" variable="--secondary" />
          <Swatch name="Accent" variable="--accent" />
          <Swatch name="Ring" variable="--ring" />
        </div>
      </Section>

      <Section title="Semantic">
        <div className="grid grid-cols-4 gap-4">
          <Swatch name="Destructive" variable="--destructive" />
          <Swatch name="Success" variable="--success" />
          <Swatch name="Warning" variable="--warning" />
          <Swatch name="Info" variable="--info" />
        </div>
      </Section>

      <Section title="Charts">
        <div className="grid grid-cols-5 gap-4">
          <Swatch name="Chart 1" variable="--chart-1" />
          <Swatch name="Chart 2" variable="--chart-2" />
          <Swatch name="Chart 3" variable="--chart-3" />
          <Swatch name="Chart 4" variable="--chart-4" />
          <Swatch name="Chart 5" variable="--chart-5" />
        </div>
      </Section>
    </div>
  ),
}

export const Typography: Story = {
  name: "Typography",
  render: () => (
    <div className="flex flex-col gap-6 max-w-xl">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground font-mono">
          text-2xl font-semibold
        </p>
        <p className="text-2xl font-semibold">Page title</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground font-mono">
          text-lg font-semibold
        </p>
        <p className="text-lg font-semibold">Section heading</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground font-mono">
          text-sm font-medium
        </p>
        <p className="text-sm font-medium">Subheading / table header</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground font-mono">text-sm</p>
        <p className="text-sm">Body text — regular prose at small scale.</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground font-mono">
          text-xs text-muted-foreground
        </p>
        <p className="text-xs text-muted-foreground">Helper / label text</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground font-mono">
          text-xs font-mono bg-muted px-1 rounded
        </p>
        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
          prj_abc123·env_xyz789
        </code>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground font-mono">
          text-2xl font-semibold tabular-nums (metric number)
        </p>
        <p className="text-2xl font-semibold tabular-nums">1,248</p>
      </div>
    </div>
  ),
}

export const Spacing: Story = {
  name: "Spacing & density",
  render: () => (
    <div className="flex flex-col gap-6 max-w-md">
      {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
        <div key={n} className="flex items-center gap-4">
          <div
            className="bg-primary/30 rounded"
            style={{ width: `${n * 4}px`, height: "24px" }}
          />
          <p className="text-xs text-muted-foreground font-mono">
            {n * 4}px — gap-{n} / p-{n}
          </p>
        </div>
      ))}
    </div>
  ),
}

export const FocusAndInteraction: Story = {
  name: "Focus & interaction states",
  render: () => (
    <div className="flex flex-col gap-6 max-w-sm">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Focus ring (matches --ring / violet-400)
        </p>
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-sm outline-none ring-ring/50 focus-visible:border-ring focus-visible:ring-[3px]"
          // biome-ignore lint/a11y/noAutofocus: demo only
          autoFocus
        >
          Focused button
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Hover state (bg-accent)</p>
        <div className="cursor-pointer rounded px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors">
          Hover me
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Disabled state</p>
        <button
          type="button"
          disabled
          className="rounded border border-border px-3 py-1.5 text-sm opacity-50 cursor-not-allowed"
        >
          Disabled button
        </button>
      </div>
    </div>
  ),
}
