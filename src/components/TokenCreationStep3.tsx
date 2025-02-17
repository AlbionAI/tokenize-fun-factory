
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

interface TokenData {
  name: string;
  symbol: string;
  description: string;
  supply: string;
  decimals: number;
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  creatorName: string;
  creatorWebsite: string;
}

interface TokenCreationStep3Props {
  tokenData: TokenData;
  updateTokenData: (data: Partial<TokenData>) => void;
}

const TokenCreationStep3 = ({ tokenData, updateTokenData }: TokenCreationStep3Props) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-6">Social Links</h2>
      
      <div className="space-y-6">
        <div>
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            placeholder="https://yourmemecoin.co"
            value={tokenData.website}
            onChange={(e) => updateTokenData({ website: e.target.value })}
            className="bg-gray-900/50 border-gray-700 text-white mt-2"
          />
        </div>

        <div>
          <Label htmlFor="twitter">Twitter</Label>
          <Input
            id="twitter"
            placeholder="https://twitter.com/yourmemecoin"
            value={tokenData.twitter}
            onChange={(e) => updateTokenData({ twitter: e.target.value })}
            className="bg-gray-900/50 border-gray-700 text-white mt-2"
          />
        </div>

        <div>
          <Label htmlFor="telegram">Telegram</Label>
          <Input
            id="telegram"
            placeholder="https://t.me/yourchannel"
            value={tokenData.telegram}
            onChange={(e) => updateTokenData({ telegram: e.target.value })}
            className="bg-gray-900/50 border-gray-700 text-white mt-2"
          />
        </div>

        <div>
          <Label htmlFor="discord">Discord</Label>
          <Input
            id="discord"
            placeholder="https://discord.gg/your-server"
            value={tokenData.discord}
            onChange={(e) => updateTokenData({ discord: e.target.value })}
            className="bg-gray-900/50 border-gray-700 text-white mt-2"
          />
        </div>

        <div className="pt-6 border-t border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <Label>Modify Creator Information</Label>
            <Switch />
          </div>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="creatorName">Creator Name</Label>
              <Input
                id="creatorName"
                placeholder="MemeMint"
                value={tokenData.creatorName}
                onChange={(e) => updateTokenData({ creatorName: e.target.value })}
                className="bg-gray-900/50 border-gray-700 text-white mt-2"
              />
            </div>

            <div>
              <Label htmlFor="creatorWebsite">Creator Website</Label>
              <Input
                id="creatorWebsite"
                placeholder="https://mememint.co"
                value={tokenData.creatorWebsite}
                onChange={(e) => updateTokenData({ creatorWebsite: e.target.value })}
                className="bg-gray-900/50 border-gray-700 text-white mt-2"
              />
            </div>
          </div>
        </div>

        <Card className="bg-gray-800/30 border-gray-700 p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Revoke Freeze</span>
              <span className="text-sm text-emerald-400">+0.1 SOL</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Revoke Mint</span>
              <span className="text-sm text-emerald-400">+0.1 SOL</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Revoke Update</span>
              <span className="text-sm text-emerald-400">+0.1 SOL</span>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
              <span className="text-gray-400">Total Cost</span>
              <span className="text-emerald-400">0.05 SOL</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TokenCreationStep3;
