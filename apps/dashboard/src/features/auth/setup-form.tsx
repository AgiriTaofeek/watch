import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { setup } from "#/lib/api"

type Props = {
  onSuccess: () => void
  onAlreadySetUp: () => void
}

export function SetupForm({ onSuccess, onAlreadySetUp }: Props) {
  const [orgName, setOrgName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const result = await setup({ data: { email, password } })
      if (result.ok) {
        onSuccess()
      } else if (result.status === 409) {
        onAlreadySetUp()
      } else {
        setError(result.message || "Something went wrong. Please try again.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setup-org">Organization name</Label>
        <Input
          id="setup-org"
          type="text"
          autoComplete="organization"
          placeholder="e.g. Acme Inc"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setup-email">Email</Label>
        <Input
          id="setup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setup-password">Password</Label>
        <Input
          id="setup-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Setting up…" : "Set up Watch"}
      </Button>
    </form>
  )
}
