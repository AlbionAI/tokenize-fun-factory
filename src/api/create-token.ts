
import { Connection, PublicKey, Transaction, SystemProgram, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;

// Format endpoint without logging
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
    const connection = new Connection(getFormattedEndpoint(QUICKNODE_ENDPOINT), 'confirmed');

    // Calculate fees
    let totalFee = 0.05; // Base fee
    if (data.authorities) {
      if (data.authorities.freezeAuthority) totalFee += 0.1;
      if (data.authorities.mintAuthority) totalFee += 0.1;
      if (data.authorities.updateAuthority) totalFee += 0.1;
    }
    if (data.creatorName) totalFee += 0.1;
    
    const feeInLamports = totalFee * LAMPORTS_PER_SOL;
    
    // Get minimum rent for token account
    const mintRent = await connection.getMinimumBalanceForRentExemption(82);
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(165);
    
    // Calculate total required lamports
    const totalRequired = feeInLamports + mintRent + tokenAccountRent;

    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    if (balance < totalRequired) {
      throw new Error(`Insufficient balance. Required: ${(totalRequired / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    }

    // Create a temporary keypair for the mint
    const mintKeypair = Keypair.generate();

    // Fund mint account first
    const fundMintTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: mintKeypair.publicKey,
        lamports: mintRent + tokenAccountRent,
      })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    fundMintTx.recentBlockhash = blockhash;
    fundMintTx.feePayer = new PublicKey(data.walletAddress);

    const signedFundingTx = await data.signTransaction(fundMintTx);
    const fundingSignature = await connection.sendRawTransaction(signedFundingTx.serialize());
    
    // Use the correct confirmation strategy
    await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature: fundingSignature,
    });

    // Create and initialize the token mint
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

    // Create token account
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      mintKeypair,
      mint,
      new PublicKey(data.walletAddress)
    );

    // Convert supply and mint tokens
    const supplyNumber = parseInt(data.supply.replace(/,/g, ''));
    await mintTo(
      connection,
      mintKeypair,
      mint,
      tokenAccount.address,
      new PublicKey(data.walletAddress),
      supplyNumber
    );

    return {
      success: true,
      tokenAddress: mint.toBase58(),
      feeAmount: totalFee,
    };
  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}
