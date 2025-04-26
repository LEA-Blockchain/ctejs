import { spawn } from 'child_process';
import net from 'net';

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
}

function runCommand(command, name) {
    const child = spawn(command, {
        stdio: 'inherit',
        shell: true,
    });

    child.on('error', (err) => {
        console.error(`[${name}] Failed to start:`, err);
    });

    child.on('exit', (code) => {
        if (code !== 0) {
            console.warn(`[${name}] exited with code ${code}`);
        }
    });

    return child;
}

const start = async () => {
    const esmPort = await getFreePort();
    const esmUiPort = await getFreePort();
    const iifePort = await getFreePort();
    const iifeUiPort = await getFreePort();

    const commandEsm = `browser-sync start --server . --files './dist/*.js,./test/*.html' --port ${esmPort} --ui-port ${esmUiPort} --startPath /test/browser-esm.test.html`;
    const commandIife = `browser-sync start --server . --files './dist/*.js,./test/*.html' --port ${iifePort} --ui-port ${iifeUiPort} --startPath /test/browser-iife.test.html`;

    console.log('Starting dev servers...');
    runCommand(commandEsm, 'esm');
    runCommand(commandIife, 'iife');
};

start();
