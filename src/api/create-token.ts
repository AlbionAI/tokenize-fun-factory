import { Connection, PublicKey, Transaction, SystemProgram, Keypair, ComputeBudgetProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, getMint, TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction } from '@solana/spl-token';
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
  const uri = '';
  const sellerFeeBasisPoints = 0;

  const buffer = Buffer.alloc(1 + 32 + 32 + 32 + 2 + name.length + 2 + symbol.length + 2 + uri.length + 2 + 1 + 1 + 1);
  let offset = 0;

  buffer.writeUInt8(1, offset);
  offset += 1;

  buffer.writeUInt16LE(name.length, offset);
  offset += 2;
  buffer.write(name, offset);
  offset += name.length;

  buffer.writeUInt16LE(symbol.length, offset);
  offset += 2;
  buffer.write(symbol, offset);
  offset += symbol.length;

  buffer.writeUInt16LE(uri.length, offset);
  offset += 2;
  buffer.write(uri, offset);
  offset += uri.length;

  buffer.writeUInt16LE(sellerFeeBasisPoints, offset);
  offset += 2;

  const hasCreator = creatorAddress ? 1 : 0;
  buffer.writeUInt8(hasCreator, offset);
  offset += 1;

  if (creatorAddress) {
    const creator = new PublicKey(creatorAddress);
    creator.toBuffer().copy(buffer, offset);
    offset += 32;
    buffer.writeUInt8(1, offset); // verified
    offset += 1;
    buffer.writeUInt8(100, offset); // share percentage
  }

  return {
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
        pubkey: TOKEN_METADATA_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: TOKEN_METADATA_PROGRAM_ID,
    data: buffer,
  };
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
    const connection = new Connection(formattedEndpoint, 'confirmed');

    const mintKeypair = Keypair.generate();
    const userPubkey = new PublicKey(data.walletAddress);
    const metadataAddress = getMetadataPDA(mintKeypair.publicKey);
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      userPubkey
    );

    const MINT_SPACE = 82;
    const METADATA_SPACE = 679;
    const METADATA_REQUIRED_LAMPORTS = await connection.getMinimumBalanceForRentExemption(METADATA_SPACE);
    const mintRent = await getMinimumBalanceForRentExemptMint(connection);
    const ataRent = await connection.getMinimumBalanceForRentExemption(165);

    let baseFee = 0.05;
    if (data.authorities) {
      if (data.authorities.freezeAuthority) baseFee += 0.1;
      if (data.authorities.mintAuthority) baseFee += 0.1;
      if (data.authorities.updateAuthority) baseFee += 0.1;
    }
    if (data.creatorName) baseFee += 0.1;
    
    baseFee = Number(baseFee.toFixed(2));
    const serviceFeeInLamports = Math.floor(baseFee * LAMPORTS_PER_SOL);

    const TX_FEE = 5000;
    const totalRequired = serviceFeeInLamports + 
                         mintRent + 
                         ataRent +
                         METADATA_REQUIRED_LAMPORTS +
                         TX_FEE;

    console.log("Cost breakdown (in lamports):", {
      serviceFee: serviceFeeInLamports,
      mintRent,
      ataRent,
      metadataRent: METADATA_REQUIRED_LAMPORTS,
      txFee: TX_FEE,
      totalRequired
    });

    const balance = await connection.getBalance(userPubkey);
    if (balance < totalRequired) {
      const requiredSOL = (totalRequired / LAMPORTS_PER_SOL).toFixed(4);
      throw new Error(
        `Insufficient balance. Required ${requiredSOL} SOL for:\n` +
        `- Service fee: ${(serviceFeeInLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL\n` +
        `- Mint account rent: ${(mintRent / LAMPORTS_PER_SOL).toFixed(4)} SOL\n` +
        `- Token account rent: ${(ataRent / LAMPORTS_PER_SOL).toFixed(4)} SOL\n` +
        `- Metadata rent: ${(METADATA_REQUIRED_LAMPORTS / LAMPORTS_PER_SOL).toFixed(4)} SOL\n` +
        `- Transaction fee: ${(TX_FEE / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      );
    }

    const transaction = new Transaction();

    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000
      })
    );

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: serviceFeeInLamports,
      })
    );

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: userPubkey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SPACE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    transaction.add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        data.decimals,
        userPubkey,
        data.authorities?.freezeAuthority ? userPubkey : null,
        TOKEN_PROGRAM_ID
      )
    );

    transaction.add(
      createMetadataInstruction(
        metadataAddress,
        mintKeypair.publicKey,
        userPubkey,
        userPubkey,
        userPubkey,
        data.name,
        data.symbol,
        data.creatorName ? data.walletAddress : undefined
      )
    );

    transaction.add(
      createAssociatedTokenAccountInstruction(
        userPubkey,
        associatedTokenAddress,
        userPubkey,
        mintKeypair.publicKey
      )
    );

    const supplyNumber = parseInt(data.supply.replace(/,/g, ''));
    transaction.add(
      createMintToInstruction(
        mintKeypair.publicKey,
        associatedTokenAddress,
        userPubkey,
        supplyNumber,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const latestBlockhash = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
    transaction.feePayer = userPubkey;

    transaction.partialSign(mintKeypair);

    const signedTransaction = await data.signTransaction(transaction);
    
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    });

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }

    console.log("Token creation completed successfully!");

    return {
      success: true,
      tokenAddress: mintKeypair.publicKey.toBase58(),
      metadataAddress: metadataAddress.toBase58(),
      feeAmount: baseFee,
      signature,
    };
  } catch (error) {
    console.error('Error in createToken:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
