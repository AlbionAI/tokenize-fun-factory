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
  authorities: {
    freezeAuthority: boolean;
    mintAuthority: boolean;
    updateAuthority: boolean;
  };
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
            className="bg-[#131B2E]/50 border-[#1C2539] text-white mt-2"
          />
        </div>

        <div>
          <Label htmlFor="twitter">Twitter</Label>
          <Input
            id="twitter"
            placeholder="https://twitter.com/yourmemecoin"
            value={tokenData.twitter}
            onChange={(e) => updateTokenData({ twitter: e.target.value })}
            className="bg-[#131B2E]/50 border-[#1C2539] text-white mt-2"
          />
        </div>

        <div>
          <Label htmlFor="telegram">Telegram</Label>
          <Input
            id="telegram"
            placeholder="https://t.me/yourchannel"
            value={tokenData.telegram}
            onChange={(e) => updateTokenData({ telegram: e.target.value })}
            className="bg-[#131B2E]/50 border-[#1C2539] text-white mt-2"
          />
        </div>

        <div>
          <Label htmlFor="discord">Discord</Label>
          <Input
            id="discord"
            placeholder="https://discord.gg/your-server"
            value={tokenData.discord}
            onChange={(e) => updateTokenData({ discord: e.target.value })}
            className="bg-[#131B2E]/50 border-[#1C2539] text-white mt-2"
          />
        </div>

        <div className="pt-6 border-t border-[#1C2539]">
          <div className="flex items-center justify-between mb-4">
            <Label>Modify Creator Information</Label>
            <Switch className="data-[state=checked]:bg-[#00B679]" />
          </div>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="creatorName">Creator Name</Label>
              <Input
                id="creatorName"
                placeholder="MemeMint"
                value={tokenData.creatorName}
                onChange={(e) => updateTokenData({ creatorName: e.target.value })}
                className="bg-[#131B2E]/50 border-[#1C2539] text-white mt-2"
              />
            </div>

            <div>
              <Label htmlFor="creatorWebsite">Creator Website</Label>
              <Input
                id="creatorWebsite"
                placeholder="https://mememint.co"
                value={tokenData.creatorWebsite}
                onChange={(e) => updateTokenData({ creatorWebsite: e.target.value })}
                className="bg-[#131B2E]/50 border-[#1C2539] text-white mt-2"
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-[#1C2539]">
          <h3 className="text-lg font-semibold mb-4">Revoke Authorities</h3>
          <p className="text-[#8B96A5] text-sm mb-6">
            Enhance trust and decentralization by revoking token authorities. This prevents future changes to your token's supply, transfers, and metadata - making it more appealing to investors who value security and immutability.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-[#131B2E]/30 border-[#1C2539] p-4">
              <div className="flex items-center justify-between mb-2">
                <Label>Revoke Freeze</Label>
                <Switch 
                  checked={tokenData.authorities.freezeAuthority}
                  onCheckedChange={(checked) => 
                    updateTokenData({ 
                      authorities: { 
                        ...tokenData.authorities, 
                        freezeAuthority: checked 
                      } 
                    })
                  }
                  className="data-[state=checked]:bg-[#00B679]"
                />
              </div>
              <p className="text-xs text-[#8B96A5]">Freeze Authority allows you to freeze token accounts of your holders.</p>
              <div className="mt-2 text-[#00B679] text-right">+0.1 SOL</div>
            </Card>

            <Card className="bg-[#131B2E]/30 border-[#1C2539] p-4">
              <div className="flex items-center justify-between mb-2">
                <Label>Revoke Mint</Label>
                <Switch 
                  checked={tokenData.authorities.mintAuthority}
                  onCheckedChange={(checked) => 
                    updateTokenData({ 
                      authorities: { 
                        ...tokenData.authorities, 
                        mintAuthority: checked 
                      } 
                    })
                  }
                  className="data-[state=checked]:bg-[#00B679]"
                />
              </div>
              <p className="text-xs text-[#8B96A5]">Mint Authority allows you to mint more supply of your token.</p>
              <div className="mt-2 text-[#00B679] text-right">+0.1 SOL</div>
            </Card>

            <Card className="bg-[#131B2E]/30 border-[#1C2539] p-4">
              <div className="flex items-center justify-between mb-2">
                <Label>Revoke Update</Label>
                <Switch 
                  checked={tokenData.authorities.updateAuthority}
                  onCheckedChange={(checked) => 
                    updateTokenData({ 
                      authorities: { 
                        ...tokenData.authorities, 
                        updateAuthority: checked 
                      } 
                    })
                  }
                  className="data-[state=checked]:bg-[#00B679]"
                />
              </div>
              <p className="text-xs text-[#8B96A5]">Update Authority allows you to update the token metadata.</p>
              <div className="mt-2 text-[#00B679] text-right">+0.1 SOL</div>
            </Card>
          </div>

          <Card className="bg-[#131B2E]/30 border-[#1C2539] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[#8B96A5]">Total Cost</span>
              <span className="text-[#00B679]">0.05 SOL</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TokenCreationStep3;
