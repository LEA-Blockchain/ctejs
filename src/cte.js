import wasmBinary from './cte.mvp.wasm';

export const PUBLIC_KEY_SIZE = 32;
export const SIGNATURE_SIZE = 64;
export const MAX_LIST_LEN = 15;
export const MAX_INDEX = 15;
export const COMMAND_DATA_SHORT_MAX_LEN = 31;
export const COMMAND_DATA_EXTENDED_MAX_LEN = 1197;

export const CTE_SUCCESS = 0;
export const CTE_ERROR_BUFFER_OVERFLOW = -1;
export const CTE_ERROR_INVALID_ARGUMENT = -2;
export const CTE_ERROR_INVALID_FORMAT = -3;
export const CTE_ERROR_INSUFFICIENT_DATA = -4;
export const CTE_ERROR_INVALID_STATE = -5;
export const CTE_ERROR_ALLOCATION_FAILED = -6;
export const CTE_ERROR_END_OF_BUFFER = -7;

export const CTE_FIELD_TYPE_UNKNOWN = 0;
export const CTE_FIELD_TYPE_VERSION = 1;
export const CTE_FIELD_TYPE_PUBKEY_LIST = 2;
export const CTE_FIELD_TYPE_SIGNATURE_LIST = 3;
export const CTE_FIELD_TYPE_INDEX_REF = 4;
export const CTE_FIELD_TYPE_COMMAND_DATA = 5;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: false });

function checkExports(exports, required) {
    for (const exportName of required) {
        if (!(exportName in exports)) {
            throw new Error(`WASM module is missing required export: ${exportName}`);
        }
    }
}

export class CteEncoder {
    #wasmExports = null;
    #wasmMemory = null;
    #encoderHandle = 0;
    #isFinalized = false;

    constructor(wasmExports, wasmMemory, encoderHandle) {
        if (!wasmExports || !wasmMemory || !encoderHandle) {
            throw new Error('CteEncoder should be instantiated via the static async create() method.');
        }
        this.#wasmExports = wasmExports;
        this.#wasmMemory = wasmMemory;
        this.#encoderHandle = encoderHandle;
    }

    static async create() {
        const importObject = {};
        const { instance } = await WebAssembly.instantiate(wasmBinary, importObject);
        const exports = instance.exports;
        const requiredExports = [
            'memory',
            'cte_encoder_new',
            'cte_encoder_prepare_public_key_list',
            'cte_encoder_prepare_signature_list',
            'cte_encoder_write_index_reference',
            'cte_encoder_prepare_command_data',
            'cte_encoder_get_buffer_ptr',
            'cte_encoder_get_buffer_size',
        ];
        checkExports(exports, requiredExports);

        const memory = new Uint8Array(exports.memory.buffer);
        const handle = exports.cte_encoder_new();
        if (!handle) {
            throw new Error('Failed to create new CTE encoder handle in WASM.');
        }
        return new CteEncoder(exports, memory, handle);
    }

    #checkFinalized() {
        if (this.#isFinalized) {
            throw new Error('CteEncoder has already been finalized (getEncodedBuffer called).');
        }
    }

    addPublicKeyList(keys) {
        this.#checkFinalized();
        if (!Array.isArray(keys) || keys.length < 1 || keys.length > MAX_LIST_LEN) {
            throw new Error(`Invalid public key list: Must be an array with 1 to ${MAX_LIST_LEN} keys.`);
        }

        const pkCount = keys.length;
        const expectedTotalSize = pkCount * PUBLIC_KEY_SIZE;

        const writeOffset = this.#wasmExports.cte_encoder_prepare_public_key_list(this.#encoderHandle, pkCount);
        if (!writeOffset) {
            throw new Error('Failed to prepare public key list in WASM (allocation or invalid state?).');
        }

        if (writeOffset + expectedTotalSize > this.#wasmMemory.buffer.byteLength) {
            throw new Error(
                `WASM memory overflow writing PK list. Offset: ${writeOffset}, Size: ${expectedTotalSize}, Memory: ${this.#wasmMemory.buffer.byteLength}`
            );
        }

        let currentOffset = writeOffset;
        for (const key of keys) {
            if (!(key instanceof Uint8Array) || key.length !== PUBLIC_KEY_SIZE) {
                throw new Error(`Invalid public key provided: Must be a Uint8Array of size ${PUBLIC_KEY_SIZE}.`);
            }
            this.#wasmMemory.set(key, currentOffset);
            currentOffset += PUBLIC_KEY_SIZE;
        }
    }

    addSignatureList(signatures) {
        this.#checkFinalized();
        if (!Array.isArray(signatures) || signatures.length < 1 || signatures.length > MAX_LIST_LEN) {
            throw new Error(`Invalid signature list: Must be an array with 1 to ${MAX_LIST_LEN} signatures.`);
        }

        const sigCount = signatures.length;
        const expectedTotalSize = sigCount * SIGNATURE_SIZE;

        const writeOffset = this.#wasmExports.cte_encoder_prepare_signature_list(this.#encoderHandle, sigCount);
        if (!writeOffset) {
            throw new Error('Failed to prepare signature list in WASM.');
        }

        if (writeOffset + expectedTotalSize > this.#wasmMemory.buffer.byteLength) {
            throw new Error(
                `WASM memory overflow writing Signature list. Offset: ${writeOffset}, Size: ${expectedTotalSize}, Memory: ${this.#wasmMemory.buffer.byteLength}`
            );
        }

        let currentOffset = writeOffset;
        for (const sig of signatures) {
            if (!(sig instanceof Uint8Array) || sig.length !== SIGNATURE_SIZE) {
                throw new Error(`Invalid signature provided: Must be a Uint8Array of size ${SIGNATURE_SIZE}.`);
            }
            this.#wasmMemory.set(sig, currentOffset);
            currentOffset += SIGNATURE_SIZE;
        }
    }

    addIndexReference(index) {
        this.#checkFinalized();
        if (typeof index !== 'number' || index < 0 || index > MAX_INDEX || !Number.isInteger(index)) {
            throw new Error(`Invalid index: Must be an integer between 0 and ${MAX_INDEX}.`);
        }

        const result = this.#wasmExports.cte_encoder_write_index_reference(this.#encoderHandle, index);
        if (result !== CTE_SUCCESS) {
            throw new Error(`Failed to write index reference in WASM (Error code: ${result}).`);
        }
    }

    addCommandData(data) {
        this.#checkFinalized();
        let payloadBytes;
        if (typeof data === 'string') {
            payloadBytes = textEncoder.encode(data);
        } else if (data instanceof Uint8Array) {
            payloadBytes = data;
        } else {
            throw new Error('Invalid command data type: Must be a string or Uint8Array.');
        }

        const payloadLen = payloadBytes.length;

        const writeOffset = this.#wasmExports.cte_encoder_prepare_command_data(this.#encoderHandle, payloadLen);
        if (!writeOffset) {
            throw new Error('Failed to prepare command data in WASM.');
        }

        if (writeOffset + payloadLen > this.#wasmMemory.buffer.byteLength) {
            throw new Error(
                `WASM memory overflow writing Command data. Offset: ${writeOffset}, Size: ${payloadLen}, Memory: ${this.#wasmMemory.buffer.byteLength}`
            );
        }

        this.#wasmMemory.set(payloadBytes, writeOffset);
    }

    getEncodedBuffer() {
        this.#checkFinalized();

        const bufferPtr = this.#wasmExports.cte_encoder_get_buffer_ptr(this.#encoderHandle);
        const bufferSize = this.#wasmExports.cte_encoder_get_buffer_size(this.#encoderHandle);

        if (!bufferPtr && bufferSize > 0) {
            throw new Error('Failed to get final buffer pointer from WASM (pointer is null/zero).');
        }
        if (bufferSize > 0 && bufferPtr + bufferSize > this.#wasmMemory.buffer.byteLength) {
            throw new Error(
                `WASM memory error: Final buffer pointer (${bufferPtr}) + size (${bufferSize}) exceeds memory bounds (${this.#wasmMemory.buffer.byteLength})`
            );
        }

        const resultBuffer = this.#wasmMemory.slice(bufferPtr, bufferPtr + bufferSize);

        this.#isFinalized = true;

        this.#encoderHandle = 0;
        this.#wasmExports = null;
        this.#wasmMemory = null;

        return resultBuffer;
    }
}

export class CteDecoder {
    #wasmExports = null;
    #wasmMemory = null;
    #decoderHandle = 0;
    #isDestroyed = false;

    constructor(wasmExports, wasmMemory, decoderHandle) {
        if (!wasmExports || !wasmMemory || !decoderHandle) {
            throw new Error('CteDecoder should be instantiated via the static async create() method.');
        }
        this.#wasmExports = wasmExports;
        this.#wasmMemory = wasmMemory;
        this.#decoderHandle = decoderHandle;
    }

    static async create(cteBuffer) {
        if (!(cteBuffer instanceof Uint8Array)) {
            throw new Error('Input to CteDecoder.create must be a Uint8Array.');
        }
        if (cteBuffer.length === 0) {
            throw new Error('Input buffer cannot be empty.');
        }

        const importObject = {};
        const { instance } = await WebAssembly.instantiate(wasmBinary, importObject);
        const exports = instance.exports;

        const requiredExports = [
            'memory',
            'malloc',
            'cte_decoder_new',
            'cte_decoder_set_input_buffer',
            'cte_decoder_advance',
            'cte_decoder_get_data_ptr',
            'cte_decoder_get_list_count',
            'cte_decoder_get_index_value',
            'cte_decoder_get_command_len',
        ];
        checkExports(exports, requiredExports);

        const memory = new Uint8Array(exports.memory.buffer);

        const bufferLen = cteBuffer.length;
        let wasmBufferPtr = 0;

        wasmBufferPtr = exports.malloc(bufferLen);
        if (!wasmBufferPtr) {
            throw new Error('Failed to allocate memory in WASM for decoder input buffer.');
        }

        if (wasmBufferPtr + bufferLen > memory.buffer.byteLength) {
            throw new Error(
                `WASM memory overflow: Allocated pointer ${wasmBufferPtr} + buffer length ${bufferLen} exceeds memory size ${memory.buffer.byteLength}`
            );
        }

        memory.set(cteBuffer, wasmBufferPtr);

        const handle = exports.cte_decoder_new();
        if (!handle) {
            throw new Error('Failed to create new CTE decoder handle in WASM.');
        }

        const setResult = exports.cte_decoder_set_input_buffer(handle, wasmBufferPtr, bufferLen);
        if (setResult !== CTE_SUCCESS) {
            throw new Error(`Failed to set decoder input buffer in WASM (Error code: ${setResult}).`);
        }

        return new CteDecoder(exports, memory, handle);
    }

    #checkDestroyed() {
        if (this.#isDestroyed) {
            throw new Error('CteDecoder instance has been destroyed.');
        }
    }

    nextField() {
        this.#checkDestroyed();

        const fieldTypeResult = this.#wasmExports.cte_decoder_advance(this.#decoderHandle);

        if (fieldTypeResult === CTE_ERROR_END_OF_BUFFER) {
            this.destroy();
            return null;
        }

        if (fieldTypeResult < CTE_SUCCESS) {
            this.destroy();
            throw new Error(`CTE Decoder: Advance failed (Error code: ${fieldTypeResult})`);
        }

        const fieldType = fieldTypeResult;
        let decodedField = { type: fieldType, typeName: 'Unknown' };

        try {
            switch (fieldType) {
                case CTE_FIELD_TYPE_PUBKEY_LIST: {
                    decodedField.typeName = 'PublicKeyList';
                    const count = this.#wasmExports.cte_decoder_get_list_count(this.#decoderHandle);
                    const ptr = this.#wasmExports.cte_decoder_get_data_ptr(this.#decoderHandle);
                    if (count < 0) throw new Error('Decoder error getting PK list count.');
                    decodedField.count = count;
                    decodedField.keys = [];
                    if (ptr && count > 0) {
                        const expectedSize = count * PUBLIC_KEY_SIZE;
                        if (ptr + expectedSize > this.#wasmMemory.buffer.byteLength) {
                            throw new Error(
                                `WASM memory read overflow for PK List. Offset: ${ptr}, Count: ${count}, Memory: ${this.#wasmMemory.buffer.byteLength}`
                            );
                        }
                        for (let i = 0; i < count; i++) {
                            decodedField.keys.push(
                                this.#wasmMemory.slice(ptr + i * PUBLIC_KEY_SIZE, ptr + (i + 1) * PUBLIC_KEY_SIZE)
                            );
                        }
                    } else if (count > 0 && !ptr) {
                        console.warn('PK List count > 0 but data pointer is null.');
                    }
                    break;
                }
                case CTE_FIELD_TYPE_SIGNATURE_LIST: {
                    decodedField.typeName = 'SignatureList';
                    const count = this.#wasmExports.cte_decoder_get_list_count(this.#decoderHandle);
                    const ptr = this.#wasmExports.cte_decoder_get_data_ptr(this.#decoderHandle);
                    if (count < 0) throw new Error('Decoder error getting Signature list count.');
                    decodedField.count = count;
                    decodedField.signatures = [];
                    if (ptr && count > 0) {
                        const expectedSize = count * SIGNATURE_SIZE;
                        if (ptr + expectedSize > this.#wasmMemory.buffer.byteLength) {
                            throw new Error(
                                `WASM memory read overflow for Signature List. Offset: ${ptr}, Count: ${count}, Memory: ${this.#wasmMemory.buffer.byteLength}`
                            );
                        }
                        for (let i = 0; i < count; i++) {
                            decodedField.signatures.push(
                                this.#wasmMemory.slice(ptr + i * SIGNATURE_SIZE, ptr + (i + 1) * SIGNATURE_SIZE)
                            );
                        }
                    } else if (count > 0 && !ptr) {
                        console.warn('Signature List count > 0 but data pointer is null.');
                    }
                    break;
                }
                case CTE_FIELD_TYPE_INDEX_REF: {
                    decodedField.typeName = 'IndexReference';
                    const value = this.#wasmExports.cte_decoder_get_index_value(this.#decoderHandle);
                    if (value < 0) {
                        throw new Error('Decoder error getting index value.');
                    }
                    decodedField.value = value;
                    break;
                }
                case CTE_FIELD_TYPE_COMMAND_DATA: {
                    decodedField.typeName = 'CommandData';
                    const len = this.#wasmExports.cte_decoder_get_command_len(this.#decoderHandle);
                    const ptr = this.#wasmExports.cte_decoder_get_data_ptr(this.#decoderHandle);
                    if (len >= 2 ** 32 - 1) {
                        throw new Error(`Decoder error getting command length (returned ${len}).`);
                    }
                    decodedField.length = len;
                    decodedField.data = new Uint8Array(0);
                    if (ptr && len > 0) {
                        if (ptr + len > this.#wasmMemory.buffer.byteLength) {
                            throw new Error(
                                `WASM memory read overflow for Command Data. Offset: ${ptr}, Length: ${len}, Memory: ${this.#wasmMemory.buffer.byteLength}`
                            );
                        }
                        decodedField.data = this.#wasmMemory.slice(ptr, ptr + len);
                        decodedField.text = textDecoder.decode(decodedField.data);
                    } else if (len > 0 && !ptr) {
                        console.warn('Command Data length > 0 but data pointer is null.');
                    }
                    break;
                }
                default:
                    console.warn(`Encountered unknown CTE field type: ${fieldType}`);
                    decodedField.typeName = `Unknown (${fieldType})`;
                    break;
            }
            return decodedField;
        } catch (err) {
            this.destroy();
            throw err;
        }
    }

    destroy() {
        if (this.#isDestroyed) {
            return;
        }

        this.#wasmExports = null;
        this.#wasmMemory = null;
        this.#decoderHandle = 0;
        this.#isDestroyed = true;
    }
}
