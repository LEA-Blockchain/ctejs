const { CteEncoder, CteDecoder, PUBLIC_KEY_SIZE, SIGNATURE_SIZE } = require('../dist/cte.node.cjs');

async function runExample() {
    try {
        console.log('--- Starting Test: Node.js CJS (dist/cte.node.cjs) ---');

        // --- Encoding ---
        console.log('Creating encoder...');
        const encoder = await CteEncoder.create();

        const pubKey1 = new Uint8Array(PUBLIC_KEY_SIZE).fill(0x11);
        const pubKey2 = new Uint8Array(PUBLIC_KEY_SIZE).fill(0x22);
        const signature1 = new Uint8Array(SIGNATURE_SIZE).fill(0xaa);
        const commandPayload = 'Hello from JS via WASM (Node CJS)!';

        encoder.addPublicKeyList([pubKey1, pubKey2]);
        encoder.addSignatureList([signature1]);
        encoder.addIndexReference(5);
        encoder.addCommandData(commandPayload);

        const encodedBuffer = encoder.getEncodedBuffer();
        console.log('Encoded Buffer:', encodedBuffer);

        // --- Decoding ---
        if (encodedBuffer && encodedBuffer.length > 0) {
            console.log('\nCreating decoder...');
            const decoder = await CteDecoder.create(encodedBuffer);

            try {
                let field;
                while ((field = decoder.nextField()) !== null) {
                    console.log('Decoded Field:', field);
                    if (field.typeName === 'CommandData') {
                        console.log('  Command Text:', field.text);
                        console.log('  Command Data:', field.data);
                    }
                }
                console.log('Decoding finished cleanly.');
            } catch (decodeError) {
                console.error('Error during decoding loop:', decodeError);
            }
        }
        console.log('--- Finished Test: Node.js CJS ---');
    } catch (error) {
        console.error('--- ERROR in Node.js CJS Test ---:', error);
    }
}

runExample();
