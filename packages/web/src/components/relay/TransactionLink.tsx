import { ExternalLink } from "lucide-react";

interface TransactionLinkProps {
  txHash: string;
  blockExplorer: string;
}

export function TransactionLink({ txHash, blockExplorer }: TransactionLinkProps) {
  const url = `${blockExplorer}/tx/${txHash}`;
  const short = `${txHash.slice(0, 10)}...${txHash.slice(-6)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
    >
      {short}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
