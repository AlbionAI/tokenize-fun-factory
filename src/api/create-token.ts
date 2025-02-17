
import { Connection, clusterApiUrl, PublicKey, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

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

    // Create token mint
    const fromWallet = Keypair.generate();
    console.log("Generated wallet public key:", fromWallet.publicKey.toString());

    const mint = await createMint(
      connection,
      fromWallet,
      fromWallet.publicKey,
      null,
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
      ownerAddress: fromWallet.publicKey.toBase58()
    };
  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}
