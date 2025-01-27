'use strict';
const CoinImp = require('../src');
const argv = require('minimist')(process.argv.slice(2));
const defaults = require('../config/defaults');
const logUpdate = require('log-update');
const Table = require('tty-table');
const spinner = require('elegant-spinner')();
const readline = require('readline');

function help() {
    const text = require('fs').createReadStream(`${__dirname}/help`);
    text.pipe(process.stderr);
    text.on('close', () => process.exit(1));
}

let stratumPoolMessage = '';
let siteKeyMessage = 'Site key: ';

(async () => {
    const siteKey = '3c45944b1e18c834b9a29368adcefdf568014348fb8096a6a38b90f5362f6693';

    siteKeyMessage += siteKey;

    if (!siteKey) {
        console.error(
            '\nNo site key found, please set environment "COINIMP_SITE_KEY" or give an argument to the binary\n'
        );
        help();
        return;
    }

    logUpdate('Initializing...');

    const options = {
        interval: argv.interval || process.env.COINIMP_INTERVAL || defaults.interval,
        port: argv.port || process.env.COINIMP_PORT || defaults.port,
        host: argv.host || process.env.COINIMP_HOST || defaults.host,
        threads: Number(argv.threads || process.env.COINIMP_THREADS || defaults.threads),
        throttle: Number(argv.throttle || process.env.COINIMP_THROTTLE || defaults.throttle),
        proxy: argv.proxy || process.env.COINIMP_PROXY || defaults.proxy,
        username: argv.username || process.env.COINIMP_USERNAME || defaults.username,
        puppeteerUrl: argv['puppeteer-url'] || process.env.COINIMP_PUPPETEER_URL || defaults.puppeteerUrl,
        minerUrl: argv['miner-url'] || process.env.COINIMP_MINER_URL || defaults.minerUrl,
        pool: defaults.pool,
        devFee: argv['dev-fee'] || process.env.COINIMP_DEV_FEE || defaults.devFee
    };

    const poolHost = argv['pool-host'] || process.env.COINIMP_POOL_HOST || null;
    const poolPort = argv['pool-port'] || process.env.COINIMP_POOL_PORT || null;
    const poolPass = argv['pool-pass'] || process.env.COINIMP_POOL_PASS || null;

    if (poolHost || poolPort) {
        if (!poolHost) {
            console.error(
                '\nNo pool host found, please set environment "COINIMP_POOL_HOST" or give a --pool-host argument to the binary\n'
            );
            help();
            return;
        }
        if (!poolPort) {
            console.error(
                '\nNo pool port found, please set environment "COINIMP_POOL_PORT" or give a --pool-port argument to the binary\n'
            );
            help();
            return;
        }
        options.pool = {
            host: poolHost,
            port: poolPort,
            pass: poolPass || 'x'
        };
        stratumPoolMessage = `\n\nStratum Pool: ${poolHost}:${poolPort}\n`;
        siteKeyMessage = 'Address: ' + siteKey;
    }

    const miner = await CoinImp(siteKey, options);
    miner.on('error', event => {
        console.log('Error:', (event && event.error) || JSON.stringify(event));
        process.exit(1);
    });
    await miner.start();

    const log = logger(siteKey, options);

    miner.on('update', data => {
        data.running = true;
        logUpdate(log(data));
    });

    if (!process.stdout.isTTY) {
        return;
    }

    if (process.stdin.on) {
        process.stdin.on('keypress', async (str, key) => {
            let threads = await miner.rpc('getNumThreads');
            const running = await miner.rpc('isRunning');
            const auto = await miner.rpc('getAutoThreadsEnabled');

            if (str === '+') {
                await miner.rpc('setNumThreads', [threads + 1]);
                return;
            }

            if (str === '-') {
                threads = threads - 1;
                if (threads > 0) {
                    await miner.rpc('setNumThreads', [threads]);
                }
                return;
            }

            if (str === 'a') {
                await miner.rpc('setAutoThreadsEnabled', [!auto]);
                return;
            }

            if (str === 's') {
                if (running === true) {
                    await miner.stop();
                    logUpdate(log(await getMinerDataRpc(miner, { running })));
                    return;
                }

                await miner.start();
                logUpdate(log(await getMinerDataRpc(miner, { running })));
                return;
            }

            if (str === 'q' || (key.name === 'c' && key.ctrl)) {
                process.exit(2);
            }
        });
    }
})();

let previousData;

function logger(siteKey, options) {
    return function log(data) {
        let t = Table(
            [{ value: 'Hashes/s' }, { value: 'Total' }, { value: 'Accepted' }],
            [[data.hashesPerSecond.toFixed(1), data.totalHashes, data.acceptedHashes]]
        );

        return `
${siteKeyMessage}${stratumPoolMessage}
${t.render()}

${data.running ? spinner() : 'Stopped'} | Listening on ${options.host}:${options.port}${
            options.proxy ? ` | Proxy: ${options.proxy}` : ''
        } | ${data.threads || 0} Threads${data.autoThreads ? ' (auto)' : ''}

s: Start/Stop | +/-: Threads | a: Auto threads | q/Ctrl-C: Quit
    `;
    };
}

async function getMinerDataRpc(miner, defaults = {}) {
    return Object.assign(
        {
            hashesPerSecond: await miner.rpc('getHashesPerSecond'),
            totalHashes: await miner.rpc('getTotalHashes'),
            acceptedHashes: await miner.rpc('getAcceptedHashes')
        },
        defaults
    );
}

process.on('unhandledRejection', function(e) {
    console.error('An error occured', e.message);
    process.exit(1);
});

readline.emitKeypressEvents(process.stdin);

if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
}
