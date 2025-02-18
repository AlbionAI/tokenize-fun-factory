
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { createToken } from '@/api/create-token';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface TokenCreationStep3Props {
  tokenData: {
    name: string;
    symbol: string;
    supply: string;
    decimals: number;
    authorities?: {
      freezeAuthority: boolean;
      mintAuthority: boolean;
      updateAuthority: boolean;
    };
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    creatorName?: string;
  };
  updateTokenData: (data: Partial<{
    name: string;
    symbol: string;
    description: string;
    supply: string;
    decimals: number;
    logo: File | null;
    website: string;
    twitter: string;
    telegram: string;
    discord: string;
    creatorName: string;
    authorities: {
      freezeAuthority: boolean;
      mintAuthority: boolean;
      updateAuthority: boolean;
    };
  }>) => void;
}

const TokenCreationStep3 = ({ tokenData, updateTokenData }: TokenCreationStep3Props) => {
  const { publicKey, signTransaction } = useWallet();
  const [isCreating, setIsCreating] = useState(false);
  const [showCreatorInfo, setShowCreatorInfo] = useState(!!tokenData.creatorName);

  const calculateFees = () => {
    let totalFee = 0.05; // Base fee for token creation

    // Add 0.1 SOL for each selected authority
    if (tokenData.authorities) {
      if (tokenData.authorities.freezeAuthority) totalFee += 0.1;
      if (tokenData.authorities.mintAuthority) totalFee += 0.1;
      if (tokenData.authorities.updateAuthority) totalFee += 0.1;
    }

    // Add 0.1 SOL if creator metadata is provided
    if (tokenData.creatorName) totalFee += 0.1;

    return totalFee;
  };

  const handleCreateToken = async () => {
    if (!publicKey || !signTransaction) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);
    try {
      const result = await createToken({
        ...tokenData,
        walletAddress: publicKey.toString(),
        signTransaction
      });

      toast({
        title: "Success!",
        description: `Token created successfully! Fee paid: ${result.feeAmount} SOL. Token address: ${result.tokenAddress}`,
      });

    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create token",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const totalFee = calculateFees();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Create Your Token</h2>
        <p className="text-muted-foreground">Review your token details and create your token</p>
      </div>

      <div className="space-y-4">
        <div className="bg-secondary/50 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">Token Details</h3>
          <div className="space-y-2">
            <p>Name: {tokenData.name}</p>
            <p>Symbol: {tokenData.symbol}</p>
            <p>Supply: {tokenData.supply}</p>
            <p>Decimals: {tokenData.decimals}</p>
          </div>
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg space-y-4">
          <h3 className="font-semibold mb-2">Social Links</h3>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="website">Website URL</Label>
              <Input
                id="website"
                placeholder="https://yourwebsite.com"
                value={tokenData.website || ''}
                onChange={(e) => updateTokenData({ website: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="twitter">Twitter</Label>
              <Input
                id="twitter"
                placeholder="@yourtwitter"
                value={tokenData.twitter || ''}
                onChange={(e) => updateTokenData({ twitter: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="telegram">Telegram</Label>
              <Input
                id="telegram"
                placeholder="t.me/yourtelegram"
                value={tokenData.telegram || ''}
                onChange={(e) => updateTokenData({ telegram: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="discord">Discord</Label>
              <Input
                id="discord"
                placeholder="discord.gg/yourdiscord"
                value={tokenData.discord || ''}
                onChange={(e) => updateTokenData({ discord: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Creator Information</h3>
              <p className="text-sm text-muted-foreground">Add your details as the creator (+0.1 SOL)</p>
            </div>
            <Switch
              checked={showCreatorInfo}
              onCheckedChange={(checked) => {
                setShowCreatorInfo(checked);
                if (!checked) {
                  updateTokenData({ creatorName: '' });
                }
              }}
            />
          </div>
          {showCreatorInfo && (
            <div className="grid gap-2">
              <Label htmlFor="creatorName">Creator Name</Label>
              <Input
                id="creatorName"
                placeholder="Your name or organization"
                value={tokenData.creatorName || ''}
                onChange={(e) => updateTokenData({ creatorName: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Authority Settings</h3>
            <p className="text-sm text-muted-foreground">Each authority costs +0.1 SOL</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Freeze Authority</Label>
                <p className="text-sm text-muted-foreground">Ability to freeze token accounts</p>
              </div>
              <Switch
                checked={tokenData.authorities?.freezeAuthority || false}
                onCheckedChange={(checked) => updateTokenData({
                  authorities: {
                    ...tokenData.authorities,
                    freezeAuthority: checked
                  }
                })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Mint Authority</Label>
                <p className="text-sm text-muted-foreground">Ability to mint new tokens</p>
              </div>
              <Switch
                checked={tokenData.authorities?.mintAuthority || false}
                onCheckedChange={(checked) => updateTokenData({
                  authorities: {
                    ...tokenData.authorities,
                    mintAuthority: checked
                  }
                })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Update Authority</Label>
                <p className="text-sm text-muted-foreground">Ability to update token metadata</p>
              </div>
              <Switch
                checked={tokenData.authorities?.updateAuthority || false}
                onCheckedChange={(checked) => updateTokenData({
                  authorities: {
                    ...tokenData.authorities,
                    updateAuthority: checked
                  }
                })}
              />
            </div>
          </div>
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">Fee Breakdown</h3>
          <div className="space-y-2">
            <p>Base Fee: 0.05 SOL</p>
            {tokenData.authorities?.freezeAuthority && <p>Freeze Authority: 0.1 SOL</p>}
            {tokenData.authorities?.mintAuthority && <p>Mint Authority: 0.1 SOL</p>}
            {tokenData.authorities?.updateAuthority && <p>Update Authority: 0.1 SOL</p>}
            {tokenData.creatorName && <p>Creator Metadata: 0.1 SOL</p>}
            <div className="border-t border-gray-600 mt-2 pt-2">
              <p className="font-bold">Total Fee: {totalFee} SOL</p>
            </div>
          </div>
        </div>

        <Button 
          onClick={handleCreateToken} 
          className="w-full"
          disabled={isCreating}
        >
          {isCreating ? "Creating Token..." : `Create Token (${totalFee} SOL)`}
        </Button>
      </div>
    </div>
  );
};

export default TokenCreationStep3;
