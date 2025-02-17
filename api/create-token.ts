
import { NextApiRequest, NextApiResponse } from 'next';
import { Connection, clusterApiUrl, PublicKey, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, symbol, supply, decimals, walletAddress } = req.body;

    // Initialize connection to Solana
    const connection = new Connection(
      process.env.QUICKNODE_ENDPOINT || clusterApiUrl('devnet'),
      'confirmed'
    );

    // Create token mint
    const fromWallet = Keypair.generate();
    const mint = await createMint(
      connection,
      fromWallet,
      fromWallet.publicKey,
      null,
      decimals
    );

    // Get the token account of the fromWallet address, and if it does not exist, create it
    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      fromWallet,
      mint,
      new PublicKey(walletAddress)
    );

    // Mint tokens to the from wallet
    await mintTo(
      connection,
      fromWallet,
      mint,
      fromTokenAccount.address,
      fromWallet.publicKey,
      supply
    );

    return res.status(200).json({
      success: true,
      tokenAddress: mint.toBase58(),
      ownerAddress: fromWallet.publicKey.toBase58()
    });
  } catch (error) {
    console.error('Error creating token:', error);
    return res.status(500).json({ error: 'Error creating token' });
  }
}
