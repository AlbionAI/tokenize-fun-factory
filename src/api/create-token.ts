
import { Connection, PublicKey, Transaction, SystemProgram, Keypair, ComputeBudgetProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Metaplex, walletAdapterIdentity } from '@metaplex-foundation/js';

const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;

const getFormattedEndpoint = (endpoint: string | undefined) => {
  if (!endpoint) {
    throw new Error('QuickNode endpoint is not configured');
  }
  
  return !endpoint.startsWith('http://') && !endpoint.startsWith('https://')
    ? `https://${endpoint}`
    : endpoint;
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
      walletAddress: data.walletAddress.substring(0, 4) + '...'
    });

    const formattedEndpoint = getFormattedEndpoint(QUICKNODE_ENDPOINT);
    console.log("Initializing Solana connection with endpoint");
    const connection = new Connection(formattedEndpoint, 'confirmed');

    try {
      await connection.getVersion();
    } catch (error) {
      console.error("Failed to connect to Solana:", error);
      throw new Error('Failed to connect to Solana network');
    }

    // Initialize Metaplex with wallet adapter
    const metaplex = Metaplex.make(connection).use(
      walletAdapterIdentity({
        publicKey: new PublicKey(data.walletAddress),
        signTransaction: data.signTransaction,
        signAllTransactions: async (txs) => {
          return Promise.all(txs.map(tx => data.signTransaction(tx)));
        },
      })
    );
    
    // Calculate base fee in SOL
    let baseFee = 0.05;
    if (data.authorities) {
      if (data.authorities.freezeAuthority) baseFee += 0.1;
      if (data.authorities.mintAuthority) baseFee += 0.1;
      if (data.authorities.updateAuthority) baseFee += 0.1;
    }
    if (data.creatorName) baseFee += 0.1;
    
    baseFee = Number(baseFee.toFixed(2));
    const serviceFeeInLamports = Math.floor(baseFee * LAMPORTS_PER_SOL);

    // Get current balance
    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    
    // Estimate total cost including Metaplex operations
    const ESTIMATED_MINT_COST = 0.01 * LAMPORTS_PER_SOL;
    const ESTIMATED_METADATA_COST = 0.01 * LAMPORTS_PER_SOL;
    const TX_FEE = 5000;
    const NUM_TRANSACTIONS = 3;
    const estimatedTxFees = TX_FEE * NUM_TRANSACTIONS;

    const totalRequired = serviceFeeInLamports + 
                         ESTIMATED_MINT_COST + 
                         ESTIMATED_METADATA_COST +
                         estimatedTxFees;

    if (balance < totalRequired) {
      const requiredSOL = (totalRequired / LAMPORTS_PER_SOL).toFixed(4);
      throw new Error(
        `Insufficient balance. Required ${requiredSOL} SOL for:\n` +
        `- Service fee: ${(serviceFeeInLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL\n` +
        `- Mint cost: ${(ESTIMATED_MINT_COST / LAMPORTS_PER_SOL).toFixed(4)} SOL\n` +
        `- Metadata cost: ${(ESTIMATED_METADATA_COST / LAMPORTS_PER_SOL).toFixed(4)} SOL\n` +
        `- Transaction fees: ${(estimatedTxFees / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      );
    }

    // Pay service fee
    const latestBlockhash = await connection.getLatestBlockhash('finalized');
    console.log("Got fresh blockhash:", latestBlockhash.blockhash);

    console.log("Step 1: Paying service fee...");
    const feeTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: serviceFeeInLamports,
      })
    );

    feeTransaction.recentBlockhash = latestBlockhash.blockhash;
    feeTransaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
    feeTransaction.feePayer = new PublicKey(data.walletAddress);

    const signedTransaction = await data.signTransaction(feeTransaction);
    const feeSignature = await connection.sendRawTransaction(signedTransaction.serialize());
    
    const confirmation = await connection.confirmTransaction({
      signature: feeSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    });
    
    if (confirmation.value.err) {
      throw new Error(`Fee transaction failed: ${confirmation.value.err}`);
    }

    console.log("Fee payment confirmed:", feeSignature);

    // Create mint account
    const mintKeypair = Keypair.generate();
    
    // Create the mint account
    const mint = await createMint(
      connection,
      mintKeypair,
      new PublicKey(data.walletAddress),
      data.authorities?.freezeAuthority ? new PublicKey(data.walletAddress) : null,
      data.decimals,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Create metadata using Metaplex
    await metaplex.nfts().create({
      uri: 'https://arweave.net/',
      name: data.name,
      symbol: data.symbol,
      sellerFeeBasisPoints: 0,
      useNewMint: mint,
      creators: data.creatorName ? [{
        address: new PublicKey(data.walletAddress),
        share: 100,
      }] : undefined,
    });

    // Create token account and mint tokens
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      mintKeypair,
      mint,
      new PublicKey(data.walletAddress)
    );

    const supplyNumber = parseInt(data.supply.replace(/,/g, ''));
    await mintTo(
      connection,
      mintKeypair,
      mint,
      tokenAccount.address,
      new PublicKey(data.walletAddress),
      supplyNumber
    );

    console.log("Token creation completed successfully!");

    return {
      success: true,
      tokenAddress: mint.toBase58(),
      feeAmount: baseFee,
      feeTransaction: feeSignature,
    };
  } catch (error) {
    console.error('Error in createToken:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
