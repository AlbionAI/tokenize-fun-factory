
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TokenData {
  name: string;
  symbol: string;
  description: string;
}

interface TokenCreationStep1Props {
  tokenData: TokenData;
  updateTokenData: (data: Partial<TokenData>) => void;
}

const TokenCreationStep1 = ({ tokenData, updateTokenData }: TokenCreationStep1Props) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-6">Token Metadata</h2>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Token Name</Label>
          <Input
            id="name"
            placeholder="e.g., My Amazing Token"
            value={tokenData.name}
            onChange={(e) => updateTokenData({ name: e.target.value })}
            className="bg-gray-700/50 border-gray-600 text-white"
          />
        </div>

        <div>
          <Label htmlFor="symbol">Token Symbol</Label>
          <Input
            id="symbol"
            placeholder="e.g., MAT"
            value={tokenData.symbol}
            onChange={(e) => updateTokenData({ symbol: e.target.value })}
            className="bg-gray-700/50 border-gray-600 text-white"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Describe your token..."
            value={tokenData.description}
            onChange={(e) => updateTokenData({ description: e.target.value })}
            className="bg-gray-700/50 border-gray-600 text-white h-32"
          />
        </div>
      </div>
    </div>
  );
};

export default TokenCreationStep1;
