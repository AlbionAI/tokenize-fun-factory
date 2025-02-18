import { Connection, PublicKey, Transaction, SystemProgram, Keypair, ComputeBudgetProgram } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Buffer } from 'buffer';

const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const getFormattedEndpoint = (endpoint: string | undefined) => {
  if (!endpoint) {
    throw new Error('QuickNode endpoint is not configured');
  }
  
  return !endpoint.startsWith('http://') && !endpoint.startsWith('https://')
    ? `https://${endpoint}`
    : endpoint;
};

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
  const metadataData = {
    name,
    symbol,
    uri: '',
    sellerFeeBasisPoints: 0,
    creators: creatorAddress ? [{
      address: new PublicKey(creatorAddress),
      verified: false,
      share: 100,
    }] : null,
    collection: null,
    uses: null,
  };

  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(33, 0);  // Instruction discriminator for CreateMetadataAccountV3

  const metadataBuffer = Buffer.from(JSON.stringify(metadataData), 'utf8');
  const completeBuffer = Buffer.concat([buffer, metadataBuffer]);

  const transaction = new Transaction();
  
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 400000
    })
  );

  transaction.add({
    keys: [
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
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: TOKEN_METADATA_PROGRAM_ID,
    data: completeBuffer,
  });

  return transaction;
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

    const MINT_SPACE = 82;
    const TOKEN_ACCOUNT_SPACE = 165;
    const METADATA_SPACE = 679;
    
    const METADATA_REQUIRED_LAMPORTS = 3410880;
    const MIN_MINT_RENT_LAMPORTS = 2461600;
    
    const calculatedMintRent = await connection.getMinimumBalanceForRentExemption(MINT_SPACE);
    const mintRent = Math.max(calculatedMintRent, MIN_MINT_RENT_LAMPORTS);
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE);
    
    let serviceFee = 0.05;
    if (data.authorities) {
      if (data.authorities.freezeAuthority) serviceFee += 0.1;
      if (data.authorities.mintAuthority) serviceFee += 0.1;
      if (data.authorities.updateAuthority) serviceFee += 0.1;
    }
    if (data.creatorName) serviceFee += 0.1;
    
    const serviceFeeInLamports = serviceFee * 1e9;

    const TX_FEE = 5000;
    const NUM_TRANSACTIONS = 4;
    const estimatedTxFees = TX_FEE * NUM_TRANSACTIONS;

    const totalRequired = serviceFeeInLamports + 
                         mintRent + 
                         tokenAccountRent + 
                         METADATA_REQUIRED_LAMPORTS +
                         estimatedTxFees;

    console.log("Cost breakdown (in lamports):", {
      serviceFee: serviceFeeInLamports,
      mintRent,
      tokenAccountRent,
      metadataRent: METADATA_REQUIRED_LAMPORTS,
      estimatedTxFees,
      totalRequired
    });

    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    
    if (balance < totalRequired) {
      const requiredSOL = (totalRequired / 1e9).toFixed(4);
      throw new Error(
        `Insufficient balance. Required ${requiredSOL} SOL for:\n` +
        `- Service fee: ${(serviceFee).toFixed(4)} SOL\n` +
        `- Mint account rent: ${(mintRent / 1e9).toFixed(4)} SOL\n` +
        `- Token account rent: ${(tokenAccountRent / 1e9).toFixed(4)} SOL\n` +
        `- Metadata rent: ${(METADATA_REQUIRED_LAMPORTS / 1e9).toFixed(4)} SOL\n` +
        `- Transaction fees: ${(estimatedTxFees / 1e9).toFixed(4)} SOL`
      );
    }

    // Step 1: Send and confirm service fee
    console.log("Step 1: Paying service fee...");
    const feeBlockhash = await connection.getLatestBlockhash('finalized');
    const feeTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: serviceFeeInLamports,
      })
    );

    feeTransaction.recentBlockhash = feeBlockhash.blockhash;
    feeTransaction.feePayer = new PublicKey(data.walletAddress);
    
    const signedFeeTransaction = await data.signTransaction(feeTransaction);
    const feeSignature = await connection.sendRawTransaction(signedFeeTransaction.serialize());
    
    console.log("Waiting for fee transaction confirmation...");
    await connection.confirmTransaction({
      signature: feeSignature,
      blockhash: feeBlockhash.blockhash,
      lastValidBlockHeight: feeBlockhash.lastValidBlockHeight
    }, 'confirmed');
    
    console.log("Fee payment confirmed:", feeSignature);

    // Step 2: Create and fund mint account
    console.log("Step 2: Creating mint account...");
    const mintKeypair = Keypair.generate();
    const mintBlockhash = await connection.getLatestBlockhash('finalized');
    
    const fundMintAccountTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: new PublicKey(data.walletAddress),
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SPACE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID
      })
    );

    fundMintAccountTx.recentBlockhash = mintBlockhash.blockhash;
    fundMintAccountTx.feePayer = new PublicKey(data.walletAddress);
    fundMintAccountTx.sign(mintKeypair);
    
    const signedMintAccountTx = await data.signTransaction(fundMintAccountTx);
    const mintAccountSignature = await connection.sendRawTransaction(signedMintAccountTx.serialize());
    
    console.log("Waiting for mint account creation confirmation...");
    await connection.confirmTransaction({
      signature: mintAccountSignature,
      blockhash: mintBlockhash.blockhash,
      lastValidBlockHeight: mintBlockhash.lastValidBlockHeight
    }, 'confirmed');

    // Step 3: Initialize metadata account
    console.log("Step 3: Initializing metadata account...");
    const metadataAddress = getMetadataPDA(mintKeypair.publicKey);
    const metadataBlockhash = await connection.getLatestBlockhash('finalized');
    
    const fundMetadataAccountTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: metadataAddress,
        lamports: METADATA_REQUIRED_LAMPORTS,
      })
    );

    fundMetadataAccountTx.recentBlockhash = metadataBlockhash.blockhash;
    fundMetadataAccountTx.feePayer = new PublicKey(data.walletAddress);
    
    const signedMetadataFundingTx = await data.signTransaction(fundMetadataAccountTx);
    const metadataFundingSignature = await connection.sendRawTransaction(signedMetadataFundingTx.serialize());
    
    console.log("Waiting for metadata funding confirmation...");
    await connection.confirmTransaction({
      signature: metadataFundingSignature,
      blockhash: metadataBlockhash.blockhash,
      lastValidBlockHeight: metadataBlockhash.lastValidBlockHeight
    }, 'confirmed');

    // Step 4: Create metadata and initialize mint
    console.log("Step 4: Creating metadata and initializing mint...");
    const metadataIx = createMetadataInstruction(
      metadataAddress,
      mintKeypair.publicKey,
      new PublicKey(data.walletAddress),
      new PublicKey(data.walletAddress),
      new PublicKey(data.walletAddress),
      data.name,
      data.symbol,
      data.creatorName ? data.walletAddress : undefined
    );

    const initializeBlockhash = await connection.getLatestBlockhash('finalized');
    metadataIx.recentBlockhash = initializeBlockhash.blockhash;
    metadataIx.feePayer = new PublicKey(data.walletAddress);

    const signedMetadataTransaction = await data.signTransaction(metadataIx);
    const metadataSignature = await connection.sendRawTransaction(signedMetadataTransaction.serialize());
    
    console.log("Waiting for metadata creation confirmation...");
    await connection.confirmTransaction({
      signature: metadataSignature,
      blockhash: initializeBlockhash.blockhash,
      lastValidBlockHeight: initializeBlockhash.lastValidBlockHeight
    }, 'confirmed');

    // Step 5: Create token account and mint tokens
    console.log("Step 5: Creating token account and minting tokens...");
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      mintKeypair,
      mintKeypair.publicKey,
      new PublicKey(data.walletAddress)
    );

    const supplyNumber = parseInt(data.supply.replace(/,/g, ''));
    await mintTo(
      connection,
      mintKeypair,
      mintKeypair.publicKey,
      tokenAccount.address,
      new PublicKey(data.walletAddress),
      supplyNumber
    );

    console.log("Token creation completed successfully!");

    return {
      success: true,
      tokenAddress: mintKeypair.publicKey.toBase58(),
      metadataAddress: metadataAddress.toBase58(),
      feeAmount: serviceFee,
      feeTransaction: feeSignature,
    };
  } catch (error) {
    console.error('Error in createToken:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
