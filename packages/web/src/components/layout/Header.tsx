import { ConnectKitButton } from "connectkit";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <span className="text-lg font-bold text-primary">$</span>
        </div>
        <span className="text-lg font-semibold tracking-tight">Stablecoin Relay</span>
      </div>
      <ConnectKitButton />
    </header>
  );
}
