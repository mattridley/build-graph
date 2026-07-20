const deliverySignals = [
  { label: 'Dependency graph', value: '42 nodes', state: 'Mapped' },
  { label: 'Baseline confidence', value: '42%', state: 'At risk' },
  { label: 'Audit export deferred', value: '81%', state: 'Candidate' },
]

export default function Home() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-6 py-6 lg:px-10">
        <header className="border-border flex items-center justify-between border-b pb-5">
          <div className="flex items-center gap-3">
            <span className="border-primary/40 bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg border font-mono text-sm">
              BG
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">BuildGraph</p>
              <p className="text-muted-foreground text-xs">
                Atlas release workspace
              </p>
            </div>
          </div>
          <span className="border-border bg-card text-muted-foreground rounded-full border px-3 py-1 font-mono text-[11px]">
            SYNTHETIC DEMO
          </span>
        </header>

        <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(460px,1.6fr)_minmax(280px,0.9fr)]">
          <aside className="border-border bg-card flex min-h-[440px] flex-col rounded-xl border p-5">
            <p className="text-primary font-mono text-xs tracking-[0.18em] uppercase">
              Investigation
            </p>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              Delivery risk, mapped and explained.
            </h1>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              Ask whether Atlas can ship, inspect the critical path, and compare
              the smallest useful scope changes.
            </p>
            <div className="border-border bg-background mt-auto rounded-lg border p-4">
              <p className="text-foreground text-sm">
                Can Atlas ship on Friday?
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                Interactive investigation arrives in the next implementation
                slice.
              </p>
            </div>
          </aside>

          <section className="border-border bg-card relative min-h-[440px] overflow-hidden rounded-xl border p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--graph-dot)_1px,transparent_1px)] bg-[size:24px_24px] opacity-60" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
                    Dependency map
                  </p>
                  <h2 className="mt-2 text-lg font-medium">
                    Atlas release graph
                  </h2>
                </div>
                <span className="border-border bg-background/80 text-muted-foreground rounded-md border px-2 py-1 font-mono text-xs">
                  READY
                </span>
              </div>
              <div className="m-auto grid max-w-md grid-cols-3 items-center gap-6 text-center">
                {['Requirements', 'Release gates', 'Ship Atlas'].map(
                  (label, index) => (
                    <div key={label} className="relative">
                      {index > 0 ? (
                        <span className="bg-border absolute top-1/2 right-full h-px w-6" />
                      ) : null}
                      <div className="border-border bg-background/90 rounded-lg border px-3 py-4 shadow-sm">
                        <span className="bg-primary mx-auto mb-2 block size-2 rounded-full" />
                        <p className="text-xs font-medium">{label}</p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>

          <aside className="border-border bg-card rounded-xl border p-5">
            <p className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
              Forecast preview
            </p>
            <div className="mt-5 space-y-3">
              {deliverySignals.map((signal) => (
                <div
                  key={signal.label}
                  className="border-border bg-background rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground text-xs">
                      {signal.label}
                    </span>
                    <span className="text-primary font-mono text-[10px] uppercase">
                      {signal.state}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xl font-medium">
                    {signal.value}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground mt-5 text-xs leading-5">
              Forecasts are dependency-and-history scenarios, not delivery
              commitments.
            </p>
          </aside>
        </section>
      </div>
    </main>
  )
}
