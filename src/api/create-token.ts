import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Buffer } from 'buffer';

// Your fee collector wallet address
const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;

// QuickNode Endpoint (using dedicated mainnet endpoint)
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;

// Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Ensure the endpoint starts with https://
const getFormattedEndpoint = (endpoint: string | undefined) => {
  if (!endpoint) {
    throw new Error('QuickNode endpoint is not configured');
  }
  
  return !endpoint.startsWith('http://') && !endpoint.startsWith('https://')
    ? `https://${endpoint}`
    : endpoint;
};

// Function to derive metadata PDA
const getMetadataPDA = (mint: PublicKey): PublicKey => {
  const [publicKey] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return publicKey;
};

// Function to create metadata instruction
const createMetadataInstruction = (
  metadata: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  creatorAddress?: string
) => {
  const data = {
    name,
    symbol,
    uri: '',
    sellerFeeBasisPoints: 0,
    creators: creatorAddress ? [{
      address: creatorAddress,
      verified: false,
      share: 100,
    }] : null,
    collection: null,
    uses: null,
  };

  const keys = [
    {
      pubkey: metadata,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: mint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: mintAuthority,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: payer,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: updateAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new Transaction().add({
    keys,
    programId: TOKEN_METADATA_PROGRAM_ID,
    data: Buffer.from([
      0, // Create Metadata instruction
      ...Buffer.from(JSON.stringify(data)),
    ]),
  });
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
    const formattedEndpoint = getFormattedEndpoint(QUICKNODE_ENDPOINT);
    const connection = new Connection(formattedEndpoint, 'confirmed');

    try {
      await connection.getVersion();
    } catch (error) {
      throw new Error('Failed to connect to Solana network');
    }

    // Calculate all required costs
    const MINT_SPACE = 82;
    const TOKEN_ACCOUNT_SPACE = 165;
    const METADATA_SPACE = 679;
    
    // Calculate metadata rent exemption directly from connection
    const metadataRentExemption = await connection.getMinimumBalanceForRentExemption(METADATA_SPACE);
    
    // Get other rent exemptions
    const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SPACE);
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE);
    
    // Calculate service fee
    let serviceFee = 0.05;
    if (data.authorities) {
      if (data.authorities.freezeAuthority) serviceFee += 0.1;
      if (data.authorities.mintAuthority) serviceFee += 0.1;
      if (data.authorities.updateAuthority) serviceFee += 0.1;
    }
    if (data.creatorName) serviceFee += 0.1;
    
    const serviceFeeInLamports = serviceFee * 1e9;

    // Calculate transaction fees
    const TX_FEE = 5000;
    const NUM_TRANSACTIONS = 4;
    const estimatedTxFees = TX_FEE * NUM_TRANSACTIONS;

    // Calculate total required balance using dynamically calculated metadata rent
    const totalRequired = serviceFeeInLamports + 
                         mintRent + 
                         tokenAccountRent + 
                         metadataRentExemption +
                         estimatedTxFees;

    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    
    if (balance < totalRequired) {
      const requiredSOL = (totalRequired / 1e9).toFixed(4);
      throw new Error(
        `Insufficient balance. Required ${requiredSOL} SOL for:\n` +
        `- Service fee: ${(serviceFee).toFixed(4)} SOL\n` +
        `- Mint account rent: ${(mintRent / 1e9).toFixed(4)} SOL\n` +
        `- Token account rent: ${(tokenAccountRent / 1e9).toFixed(4)} SOL\n` +
        `- Metadata rent: ${(metadataRentExemption / 1e9).toFixed(4)} SOL\n` +
        `- Transaction fees: ${(estimatedTxFees / 1e9).toFixed(4)} SOL`
      );
    }

    console.log("Step 1: Paying service fee...");
    
    // Create a fee transfer transaction
    const feeTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: serviceFeeInLamports,
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
    
    // Get metadata PDA before creating transactions
    const metadataAddress = getMetadataPDA(mintKeypair.publicKey);

    // Fund the metadata account with dynamically calculated rent exemption
    const fundMetadataAccountTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: metadataAddress,
        lamports: metadataRentExemption, // Use dynamically calculated value
      })
    );

    fundMetadataAccountTx.recentBlockhash = blockhash;
    fundMetadataAccountTx.feePayer = new PublicKey(data.walletAddress);
    
    const signedMetadataFundingTx = await data.signTransaction(fundMetadataAccountTx);
    const metadataFundingSignature = await connection.sendRawTransaction(signedMetadataFundingTx.serialize());
    await connection.confirmTransaction({
      signature: metadataFundingSignature,
      blockhash,
      lastValidBlockHeight
    });

    console.log("Metadata account funded:", metadataFundingSignature);

    console.log("Step 2: Funding mint account...");
    
    // Fund the mint keypair with the minimum rent exemption
    const fundMintAccountTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: mintKeypair.publicKey,
        lamports: mintRent,
      })
    );
    
    fundMintAccountTx.recentBlockhash = blockhash;
    fundMintAccountTx.feePayer = new PublicKey(data.walletAddress);
    
    const signedFundingTx = await data.signTransaction(fundMintAccountTx);
    const fundingSignature = await connection.sendRawTransaction(signedFundingTx.serialize());
    await connection.confirmTransaction({
      signature: fundingSignature,
      blockhash,
      lastValidBlockHeight
    });
    
    // Create token mint with selected authorities
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
    
    // Create metadata
    const metadataInstruction = createMetadataInstruction(
      metadataAddress,
      mint,
      new PublicKey(data.walletAddress),
      new PublicKey(data.walletAddress),
      new PublicKey(data.walletAddress),
      data.name,
      data.symbol,
      data.creatorName ? data.walletAddress : undefined
    );

    metadataInstruction.recentBlockhash = blockhash;
    metadataInstruction.feePayer = new PublicKey(data.walletAddress);

    const signedMetadataTransaction = await data.signTransaction(metadataInstruction);
    const metadataSignature = await connection.sendRawTransaction(signedMetadataTransaction.serialize());
    await connection.confirmTransaction({
      signature: metadataSignature,
      blockhash,
      lastValidBlockHeight
    });
    
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
      metadataAddress: metadataAddress.toBase58(),
      feeAmount: serviceFee,
      feeTransaction: signature,
    };
  } catch (error) {
    throw error;
  }
}
