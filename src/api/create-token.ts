
import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import bs58 from 'bs58';

// Your fee collector wallet address
const FEE_COLLECTOR_WALLET = process.env.FEE_COLLECTOR_WALLET;

// Base58 encoded secret key (this is more secure than raw bytes)
const PAYER_SECRET_KEY = process.env.PAYER_SECRET_KEY;

// QuickNode Endpoint (using dedicated mainnet endpoint)
const QUICKNODE_ENDPOINT = process.env.QUICKNODE_ENDPOINT;

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
    // Initialize connection to Solana using QuickNode
    const connection = new Connection(QUICKNODE_ENDPOINT!, 'confirmed');
    console.log("Using QuickNode endpoint:", QUICKNODE_ENDPOINT);
    
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

    // Create keypair from Base58 encoded secret key
    const fromWallet = Keypair.fromSecretKey(bs58.decode(PAYER_SECRET_KEY));
    
    console.log("Generated wallet public key:", fromWallet.publicKey.toString());

    // Create token mint with selected authorities
    const mint = await createMint(
      connection,
      fromWallet,
      data.authorities?.mintAuthority ? new PublicKey(data.walletAddress) : fromWallet.publicKey,
      data.authorities?.freezeAuthority ? new PublicKey(data.walletAddress) : null,
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
