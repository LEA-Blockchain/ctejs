A JavaScript library providing a high-level wrapper around a WebAssembly (WASM) implementation of the Compact Transaction Encoding (CTE) specification v1.0. This library allows easy encoding and decoding of CTE data streams in both Node.js and browser environments.

It uses a WASM module compiled from the [CTE reference C code](https://github.com/LEA-Blockchain/serialization-codecs/tree/main/cte) and provides a simplified API, hiding the complexities of direct WASM memory management.

For full details, please refer to the [CTE v1.0 Specification](https://github.com/LEA-Blockchain/serialization-codecs/blob/main/cte/README.md). ## Features

* **Cross-Platform:** Bundled builds provided for Node.js (ESM, CJS) and Browsers (ESM, IIFE).

## Installation

```bash
npm install @leachain/ctejs
```

## Usage

### Encoding

Use the `CteEncoder` class to build your CTE transaction.

```javascript
import { CteEncoder, PUBLIC_KEY_SIZE, SIGNATURE_SIZE } from '@leachain/ctejs';

async function encodeData() {
    try {
        // Create an encoder instance
        const encoder = await CteEncoder.create();

        // Prepare your data
        const pubKey1 = new Uint8Array(PUBLIC_KEY_SIZE).fill(0x11);
        const pubKey2 = new Uint8Array(PUBLIC_KEY_SIZE).fill(0x22);
        const signature1 = new Uint8Array(SIGNATURE_SIZE).fill(0xAA);
        const commandPayload = "Hello from JS via WASM!"; // String or Uint8Array

        // Add fields in the desired order
        encoder.addPublicKeyList([pubKey1, pubKey2]);
        encoder.addSignatureList([signature1]);
        encoder.addIndexReference(5);
        encoder.addCommandData(commandPayload);

        // Finalize and get the encoded buffer
        const encodedBuffer = encoder.getEncodedBuffer();
        console.log('Encoded CTE Buffer:', encodedBuffer);
        // WASM VM will be garbage collected.

        return encodedBuffer;

    } catch (error) {
        console.error("Encoding Error:", error);
    }
}

encodeData();
```

### Decoding

Use the `CteDecoder` class to read fields sequentially from an encoded buffer.

```javascript
import { CteDecoder } from '@leachain/ctejs';

async function decodeData(encodedBuffer) {
    try {
        // Create a decoder instance
        const decoder = await CteDecoder.create(encodedBuffer);

        // Iterate through fields
        let field;
        while ((field = decoder.nextField()) !== null) {
            console.log("Decoded Field:", field);

            // Access specific data based on type
            switch(field.typeName) {
                case "PublicKeyList":
                    console.log(`  Got ${field.count} public keys.`);
                    // field.keys is an array of Uint8Array
                    break;
                case "SignatureList":
                    console.log(`  Got ${field.count} signatures.`);
                    // field.signatures is an array of Uint8Array
                    break;
                case "IndexReference":
                    console.log(`  Got index: ${field.value}`);
                    break;
                case "CommandData":
                    console.log(`  Got command data (${field.length} bytes).`);
                    console.log(`  Command Text: "${field.text}"`); // UTF-8 string (if possible)
                    console.log("  Command Data: ", field.data);    // Uint8Array
                    break;
                default:
                    console.log(`  Got unknown field type: ${field.type}`);
            }
        }
    } catch (error) {
        console.error("Decoding Error:", error);
    }
}

// Example assuming encodeData() returns the buffer
encodeData().then(buffer => decodeData(buffer));

```

## Building from Source

1.  Install development dependencies: `npm install`
2.  Run the build command: `npm run build`

This will generate the different distributable files in the `dist/` directory.

## Underlying Mechanism

This library wraps a WebAssembly module compiled from C reference code implementing the CTE specification.
For security and state isolation, each `CteEncoder` or `CteDecoder` object instantiates its own independent WASM virtual machine.
This VM is discarded when the corresponding JavaScript object is garbage collected.

## About

This project is part of the [LEA Project](https://getlea.org).

## Author

Developed by Allwin Ketnawang.

## License

This project is licensed under the [MIT License](LICENSE).
