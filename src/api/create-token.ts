
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Your fee collector wallet address
const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;

// QuickNode Endpoint (using dedicated mainnet endpoint)
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;

// Ensure the endpoint starts with https://
const getFormattedEndpoint = (endpoint: string | undefined) => {
  console.log("Configuring endpoint with:", endpoint);
  
  if (!endpoint) {
    console.error("QuickNode endpoint is not configured in environment variables");
    throw new Error('QuickNode endpoint is not configured');
  }
  
  const formattedEndpoint = !endpoint.startsWith('http://') && !endpoint.startsWith('https://')
    ? `https://${endpoint}`
    : endpoint;
    
  console.log("Using formatted endpoint:", formattedEndpoint);
  return formattedEndpoint;
};

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
    console.log("Starting token creation with data:", {
      ...data,
      walletAddress: data.walletAddress.substring(0, 4) + '...' // truncate for privacy
    });

    // Initialize connection to Solana using QuickNode with properly formatted endpoint
    const formattedEndpoint = getFormattedEndpoint(QUICKNODE_ENDPOINT);
    console.log("Initializing Solana connection with endpoint");
    const connection = new Connection(formattedEndpoint, 'confirmed');

    // Test connection
    try {
      const version = await connection.getVersion();
      console.log("Successfully connected to Solana. Version:", version);
    } catch (error) {
      console.error("Failed to connect to Solana:", error);
      throw new Error('Failed to connect to Solana network');
    }

    // Calculate base fee in lamports (1 SOL = 1e9 lamports)
    let totalFee = 0.05; // Base fee
    if (data.authorities) {
      if (data.authorities.freezeAuthority) totalFee += 0.1;
      if (data.authorities.mintAuthority) totalFee += 0.1;
      if (data.authorities.updateAuthority) totalFee += 0.1;
    }
    if (data.creatorName) totalFee += 0.1;
    
    const feeInLamports = totalFee * 1e9;

    // Get minimum rent for token account
    const minimumRent = await connection.getMinimumBalanceForRentExemption(82);
    console.log("Minimum rent required:", minimumRent / 1e9, "SOL");

    // Estimate total transaction fees for all operations
    const estimatedTxFee = 15000; // 0.000015 SOL per transaction

    // Calculate total required balance
    const totalRequiredBalance = feeInLamports + minimumRent + (estimatedTxFee * 2); // Account for fees of both transactions

    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    if (balance < totalRequiredBalance) {
      throw new Error(`Insufficient balance. You need at least ${(totalRequiredBalance / 1e9).toFixed(4)} SOL to create this token.`);
    }

    // Create a temporary keypair for the mint operation
    const mintKeypair = Keypair.generate();
    console.log("Generated mint keypair:", mintKeypair.publicKey.toBase58());

    // Get the recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

    // First transaction: Send fee to collector
    const feeTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: feeInLamports - minimumRent - (estimatedTxFee * 2), // Account for all future transaction fees
      })
    );

    feeTransaction.recentBlockhash = blockhash;
    feeTransaction.lastValidBlockHeight = lastValidBlockHeight;
    feeTransaction.feePayer = new PublicKey(data.walletAddress);

    // Have the user sign and send the fee transaction first
    const signedFeeTransaction = await data.signTransaction(feeTransaction);
    const feeSignature = await connection.sendRawTransaction(signedFeeTransaction.serialize());
    await connection.confirmTransaction({
      signature: feeSignature,
      blockhash,
      lastValidBlockHeight
    });

    console.log("Fee payment confirmed:", feeSignature);

    // Get new blockhash for mint funding transaction
    const { blockhash: newBlockhash, lastValidBlockHeight: newLastValidBlockHeight } = 
      await connection.getLatestBlockhash('finalized');

    // Second transaction: Fund mint account
    const mintFundingTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: mintKeypair.publicKey,
        lamports: minimumRent,
      })
    );

    mintFundingTransaction.recentBlockhash = newBlockhash;
    mintFundingTransaction.lastValidBlockHeight = newLastValidBlockHeight;
    mintFundingTransaction.feePayer = new PublicKey(data.walletAddress);

    // Have the user sign and send the mint funding transaction
    const signedMintFundingTransaction = await data.signTransaction(mintFundingTransaction);
    const mintFundingSignature = await connection.sendRawTransaction(signedMintFundingTransaction.serialize());
    await connection.confirmTransaction({
      signature: mintFundingSignature,
      blockhash: newBlockhash,
      lastValidBlockHeight: newLastValidBlockHeight
    });

    console.log("Mint account funding confirmed:", mintFundingSignature);
    
    console.log("Creating mint account...");
    
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

    console.log("Token creation completed successfully!");

    return {
      success: true,
      tokenAddress: mint.toBase58(),
      feeAmount: totalFee,
      feeTransaction: feeSignature,
    };
  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}
