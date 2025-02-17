
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface TokenData {
  supply: string;
  decimals: number;
}

interface TokenCreationStep2Props {
  tokenData: TokenData;
  updateTokenData: (data: Partial<TokenData>) => void;
}

const TokenCreationStep2 = ({ tokenData, updateTokenData }: TokenCreationStep2Props) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-6">Supply & Economics</h2>
      
      <div className="space-y-6">
        <div>
          <Label htmlFor="supply">Total Supply</Label>
          <Input
            id="supply"
            type="number"
            placeholder="e.g., 1000000"
            value={tokenData.supply}
            onChange={(e) => updateTokenData({ supply: e.target.value })}
            className="bg-gray-700/50 border-gray-600 text-white"
          />
        </div>

        <div>
          <Label>Decimals</Label>
          <div className="flex items-center space-x-4">
            <Slider
              value={[tokenData.decimals]}
              onValueChange={(value) => updateTokenData({ decimals: value[0] })}
              max={9}
              step={1}
              className="flex-1"
            />
            <span className="w-12 text-center">{tokenData.decimals}</span>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Recommended: 9 decimals (same as SOL)
          </p>
        </div>
      </div>
    </div>
  );
};

export default TokenCreationStep2;
