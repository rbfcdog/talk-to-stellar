export function Footer() {
  return (
    <footer className="border-t bg-muted/30 py-10">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Talk To Stellar</h3>
            <p className="text-sm text-muted-foreground">Conversational payments on Stellar.</p>
          </div>
          <div className="text-sm text-muted-foreground">Built during HackMeridian</div>
        </div>
      </div>
    </footer>
  )
}
