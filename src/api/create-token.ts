
import { Connection, clusterApiUrl, PublicKey, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

// The public key of the wallet that will collect fees
const FEE_COLLECTOR_WALLET = process.env.FEE_COLLECTOR_WALLET || "YOUR_WALLET_ADDRESS_HERE";

export async function createToken(data: {
  name: string;
  symbol: string;
  supply: string;
  decimals: number;
  walletAddress: string;
}) {
  try {
    // Initialize connection to Solana
    const endpoint = process.env.QUICKNODE_ENDPOINT || clusterApiUrl('devnet');
    console.log("Using endpoint:", endpoint);
    
    const connection = new Connection(endpoint, 'confirmed');

    // Create token mint with fee collector as mint authority
    const fromWallet = Keypair.generate();
    console.log("Generated wallet public key:", fromWallet.publicKey.toString());
    console.log("Fee collector wallet:", FEE_COLLECTOR_WALLET);

    const mint = await createMint(
      connection,
      fromWallet, // payer
      new PublicKey(FEE_COLLECTOR_WALLET), // mint authority
      new PublicKey(FEE_COLLECTOR_WALLET), // freeze authority
      data.decimals
    );

    console.log("Created mint:", mint.toBase58());

    // Get the token account of the fromWallet address, and if it does not exist, create it
    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      fromWallet,
      mint,
      new PublicKey(data.walletAddress)
    );

    console.log("Created token account:", fromTokenAccount.address.toBase58());

    // Convert supply string to number and mint tokens
    const supplyNumber = parseInt(data.supply.replace(/,/g, ''));
    await mintTo(
      connection,
      fromWallet,
      mint,
      fromTokenAccount.address,
      fromWallet.publicKey,
      supplyNumber
    );

    console.log("Minted tokens successfully");

    return {
      success: true,
      tokenAddress: mint.toBase58(),
      ownerAddress: fromWallet.publicKey.toBase58(),
      mintAuthority: FEE_COLLECTOR_WALLET
    };
  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}
