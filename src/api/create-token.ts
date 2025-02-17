
import { Connection, clusterApiUrl, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

// Your fee collector wallet address
const FEE_COLLECTOR_WALLET = "EBTxkJvzBEfGJZMGAaFBqkw5EYsk7zRt1Z4aqHSmu8Qf";

export async function createToken(data: {
  name: string;
  symbol: string;
  supply: string;
  decimals: number;
  walletAddress: string;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  authorities?: {
    freezeAuthority: boolean;
    mintAuthority: boolean;
    updateAuthority: boolean;
  };
  creatorName?: string;
}) {
  try {
    // Initialize connection to Solana mainnet
    const endpoint = process.env.QUICKNODE_ENDPOINT || clusterApiUrl('mainnet-beta');
    console.log("Using endpoint:", endpoint);
    
    const connection = new Connection(endpoint, 'confirmed');
    
    // Calculate total fee in lamports (1 SOL = 1e9 lamports)
    let totalFee = 0.05; // Base fee
    if (data.authorities) {
      if (data.authorities.freezeAuthority) totalFee += 0.1;
      if (data.authorities.mintAuthority) totalFee += 0.1;
      if (data.authorities.updateAuthority) totalFee += 0.1;
    }
    if (data.creatorName) totalFee += 0.1;
    
    const feeInLamports = totalFee * 1e9;

    // Create a fee transfer transaction
    const feeTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: feeInLamports,
      })
    );

    // Get the recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    feeTransaction.recentBlockhash = blockhash;
    feeTransaction.feePayer = new PublicKey(data.walletAddress);

    // Have the user sign the transaction
    const signedTransaction = await data.signTransaction(feeTransaction);

    // Send and confirm fee transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    await connection.confirmTransaction(signature);

    console.log("Fee payment confirmed:", signature);

    // Create token mint with selected authorities
    const fromWallet = Keypair.generate();
    console.log("Generated wallet public key:", fromWallet.publicKey.toString());

    const mint = await createMint(
      connection,
      fromWallet, // payer
      data.authorities?.mintAuthority ? new PublicKey(data.walletAddress) : fromWallet.publicKey, // mint authority
      data.authorities?.freezeAuthority ? new PublicKey(data.walletAddress) : null, // freeze authority
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
      feeAmount: totalFee,
      feeTransaction: signature,
    };
  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}
