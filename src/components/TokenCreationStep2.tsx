
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TokenData {
  supply: string;
  decimals: number;
  description: string;
}

interface TokenCreationStep2Props {
  tokenData: TokenData;
  updateTokenData: (data: Partial<TokenData>) => void;
}

const TokenCreationStep2 = ({ tokenData, updateTokenData }: TokenCreationStep2Props) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-6">Supply & Description</h2>
      
      <div className="space-y-6">
        <div>
          <Label htmlFor="decimals">Decimals</Label>
          <Input
            id="decimals"
            type="number"
            value={tokenData.decimals}
            onChange={(e) => updateTokenData({ decimals: parseInt(e.target.value) })}
            className="bg-gray-900/50 border-gray-700 text-white mt-2"
            placeholder="Enter number of decimals"
            min="0"
            max="9"
          />
          <p className="text-sm text-gray-400 mt-1">Enter a value between 0 and 9 decimals</p>
        </div>

        <div>
          <Label htmlFor="supply">Total Supply</Label>
          <Input
            id="supply"
            type="text"
            value={tokenData.supply}
            onChange={(e) => updateTokenData({ supply: e.target.value })}
            className="bg-gray-900/50 border-gray-700 text-white mt-2"
            placeholder="Enter total supply"
          />
          <div className="text-sm text-gray-400 mt-1">
            <p>Common supply is 1 billion</p>
            <p>With commas: 1,000,000,000</p>
          </div>
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={tokenData.description}
            onChange={(e) => updateTokenData({ description: e.target.value })}
            className="bg-gray-900/50 border-gray-700 text-white mt-2 h-32"
            placeholder="Enter token description"
          />
        </div>
      </div>
    </div>
  );
};

export default TokenCreationStep2;
