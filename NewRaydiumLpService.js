require('dotenv').config();
const { MongoClient } = require('mongodb');
const bs58 = require('bs58');
const { PublicKey, Connection } = require('@solana/web3.js');
const borsh = require('borsh');

// MongoDB connection setup
const MONGO_URI = 'mongodb+srv://joseseb400:CIeReeRiiSf74FOX@bot.2bwfk.mongodb.net/?retryWrites=true&w=majority&appName=BOT';
const client = new MongoClient(MONGO_URI);
let db;

async function connectToDatabase() {
    try {
        await client.connect();
        db = client.db('Test1');
        console.log("Connected to MongoDB.");
    } catch (error) {
        console.error("MongoDB connection error:", error.message);
    }
}

// Classes for Instructions
class AddLiquidityInstruction {
    constructor(fields) {
        this.instruction = fields.instruction;
        this.baseAmountIn = fields.baseAmountIn;
        this.quoteAmountIn = fields.quoteAmountIn;
        this.fixedSide = fields.fixedSide;
    }
}

class RemoveLiquidityInstruction {
    constructor(fields) {
        this.instruction = fields.instruction;
        this.amountIn = fields.amountIn;
    }
}

// Schema for Add Liquidity
const addLiquiditySchema = new Map([
    [
        AddLiquidityInstruction,
        {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],         // Instruction discriminator
                ['baseAmountIn', 'u64'],       // Amount of base tokens
                ['quoteAmountIn', 'u64'],      // Amount of quote tokens
                ['fixedSide', 'u8'],           // Fixed side (0 for base, 1 for quote)
            ]
        }
    ]
]);

// Schema for Remove Liquidity
const removeLiquiditySchema = new Map([
    [
        RemoveLiquidityInstruction,
        {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],   // Instruction discriminator
                ['amountIn', 'u64'],     // LP tokens being removed
            ]
        }
    ]
]);

// Function to convert little-endian hex to decimal
function hexToDecimal(hex) {
    const buffer = Buffer.from(hex, 'hex');
    const decimal = buffer.readUIntLE(0, buffer.length);
    return decimal;
}

// Decoding function for Add Liquidity
function decodeAddLiquidityInstruction(data) {
    const buffer = Buffer.from(bs58.decode(data));
    const decoded = borsh.deserialize(addLiquiditySchema, AddLiquidityInstruction, buffer);

    console.log("Decoded Add Liquidity Instruction:");
    console.log(`Instruction: ${decoded.instruction}`);
    console.log(`Base Amount In: ${hexToDecimal(decoded.baseAmountIn.toString('hex'))}`);
    console.log(`Quote Amount In: ${hexToDecimal(decoded.quoteAmountIn.toString('hex'))}`);
    console.log(`Fixed Side: ${decoded.fixedSide === 0 ? 'Base' : 'Quote'}`);

    return decoded;
}

// Decoding function for Remove Liquidity
function decodeRemoveLiquidityInstruction(data) {
    const buffer = Buffer.from(bs58.decode(data));
    const decoded = borsh.deserialize(removeLiquiditySchema, RemoveLiquidityInstruction, buffer);

    console.log("Decoded Remove Liquidity Instruction:");
    console.log(`Instruction: ${decoded.instruction}`);
    console.log(`Amount In: ${hexToDecimal(decoded.amountIn.toString('hex'))}`);

    return decoded;
}

// Process and store the transaction
async function processRaydiumLpTransaction(connection, signature) {
    try {
        const transactionDetails = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (transactionDetails) {
            const message = transactionDetails.transaction.message;
            const accounts = message.staticAccountKeys.map(key => key.toString());

            console.log("Transaction Message:", message);
            console.log("Accounts:", accounts);

            if (accounts.length >= 7) {
                const coinMintAccount = accounts[5];
                const balance = await connection.getBalance(new PublicKey(coinMintAccount));
                const liquidityAmount = balance / 1e9; // Convert lamports to SOL

                console.log(`Liquidity Pool Amount (In SOL): ${liquidityAmount}`);

                const tokenData = {
                    programId: new PublicKey(accounts[0]),
                    ammId: new PublicKey(accounts[1]),
                    ammAuthority: new PublicKey(accounts[2]),
                    ammOpenOrders: new PublicKey(accounts[3]),
                    lpMint: new PublicKey(accounts[4]),
                    coinMint: new PublicKey(accounts[5]),
                    pcMint: new PublicKey(accounts[6]),
                    coinVault: new PublicKey(accounts[7]),
                    pcVault: new PublicKey(accounts[8]),
                    withdrawQueue: new PublicKey(accounts[9]),
                    ammTargetOrders: new PublicKey(accounts[10]),
                    poolTempLp: new PublicKey(accounts[11]),
                    marketProgramId: new PublicKey(accounts[12]),
                    marketId: new PublicKey(accounts[13]),
                    userWallet: new PublicKey(accounts[14]),
                    userCoinVault: new PublicKey(accounts[15]),
                    userPcVault: new PublicKey(accounts[16]),
                    userLpVault: new PublicKey(accounts[17]),
                    ammConfigId: new PublicKey(accounts[18]),
                    feeDestinationId: new PublicKey(accounts[19])
                };

                if (Array.isArray(message.instructions)) {
                    for (const ix of message.instructions) {
                        const programId = message.staticAccountKeys[ix.programIdIndex].toString();

                        if (programId === RAYDIUM_AMM_PROGRAM_ID.toString() && ix.data.length > 0) {
                            const decodedInstruction = decodeInstructionData(ix.data);

                            const eventDetails = {
                                signature,
                                instructionType: decodedInstruction.instruction, // Instruction type (e.g., add/remove liquidity)
                                timestamp: new Date(),
                                decodedInstruction: decodedInstruction, // Store decoded instruction details
                                liquidityAmount: liquidityAmount // Store the liquidity amount
                            };

                            console.log("Event Details:", eventDetails);

                            await db.collection('Test1').insertOne(eventDetails);
                            console.log("Event inserted into MongoDB");
                            break;
                        }
                    }
                }

                return tokenData;
            }
        }
    } catch (error) {
        console.error("Error fetching/processing transaction:", error.message);
    }

    return null;
}

module.exports = {
    connectToDatabase,
    processRaydiumLpTransaction
};
