
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Your fee collector wallet address
const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;

// QuickNode Endpoint (using dedicated mainnet endpoint)
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;

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
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    feeTransaction.recentBlockhash = blockhash;
    feeTransaction.lastValidBlockHeight = lastValidBlockHeight;
    feeTransaction.feePayer = new PublicKey(data.walletAddress);

    // Have the user sign the transaction
    const signedTransaction = await data.signTransaction(feeTransaction);

    // Send and confirm fee transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    });

    console.log("Fee payment confirmed:", signature);

    // Create a temporary keypair for the mint operation
    const mintKeypair = Keypair.generate();
    
    // Fund the mint keypair with the minimum rent exemption
    const minimumRent = await connection.getMinimumBalanceForRentExemption(82);
    const fundMintAccountTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: mintKeypair.publicKey,
        lamports: minimumRent,
      })
    );
    
    fundMintAccountTx.recentBlockhash = blockhash;
    fundMintAccountTx.feePayer = new PublicKey(data.walletAddress);
    
    const signedFundingTx = await data.signTransaction(fundMintAccountTx);
    await connection.sendRawTransaction(signedFundingTx.serialize());

    // Create token mint with selected authorities
    const mint = await createMint(
      connection,
      mintKeypair,
      new PublicKey(data.walletAddress), // The customer's wallet is the mint authority
      data.authorities?.freezeAuthority ? new PublicKey(data.walletAddress) : null,
      data.decimals,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("Created mint:", mint.toBase58());

    // Get the token account of the customer's wallet address, and if it does not exist, create it
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      mintKeypair,
      mint,
      new PublicKey(data.walletAddress),
      undefined,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("Created token account:", tokenAccount.address.toBase58());

    // Convert supply string to number and mint tokens
    const supplyNumber = parseInt(data.supply.replace(/,/g, ''));
    await mintTo(
      connection,
      mintKeypair,
      mint,
      tokenAccount.address,
      new PublicKey(data.walletAddress),
      supplyNumber,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("Minted tokens successfully");

    return {
      success: true,
      tokenAddress: mint.toBase58(),
      feeAmount: totalFee,
      feeTransaction: signature,
    };
  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}
