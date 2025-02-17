
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { createToken } from '@/api/create-token';

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
    creatorWebsite: string;
    authorities: {
      freezeAuthority: boolean;
      mintAuthority: boolean;
      updateAuthority: boolean;
    };
  }>) => void;
}

const TokenCreationStep3 = ({ tokenData, updateTokenData }: TokenCreationStep3Props) => {
  const { publicKey } = useWallet();
  const [isCreating, setIsCreating] = useState(false);

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
    if (!publicKey) {
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
        walletAddress: publicKey.toString()
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
            {tokenData.authorities && (
              <div className="mt-2">
                <p className="font-semibold">Selected Authorities:</p>
                {tokenData.authorities.freezeAuthority && <p>• Freeze Authority</p>}
                {tokenData.authorities.mintAuthority && <p>• Mint Authority</p>}
                {tokenData.authorities.updateAuthority && <p>• Update Authority</p>}
              </div>
            )}
            {tokenData.creatorName && (
              <div className="mt-2">
                <p className="font-semibold">Creator Information:</p>
                <p>• Creator Name: {tokenData.creatorName}</p>
              </div>
            )}
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
