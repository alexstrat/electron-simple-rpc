const promises = require('./promises');
const { ipcReceive, ipcSend } = require('electron-simple-ipc');
const { get } = require('lodash');

/*****************************************************************************
RPC IPC Manager.

This is used to receive and respond to RPC actions received over IPC.

@param object lib   - The function library used with rpc
@param string scope - This thread's scope (electron, main-renderer etc)
@param object options
@param boolean options.ignoreMissingFunctions if set to tru, promise won't be
reject if the function is missing in library
*****************************************************************************/


class RpcIpcManager {
    constructor(lib, scope, options = { ignoreMissingFunctions: false }) {
        // Check the lib for the functionToRun
        const getFunction = (functionName) => {
            return get(lib, functionName);
        }

        this.unsubscribeFunctions = [];

        const unsubscribeFromRPC = ipcReceive('RPC', (payload) => {
            /****************************************************************
            RPC Receive.

            If the scope is correct, we attempt to run the corresponding
            function in the function lib.
            ****************************************************************/
            if (scope === payload.scope) {
                const { promiseId, functionToRun, functionInputs } = payload;

                // Create reject/resolve functions
                const resolve = (result) => {
                    ipcSend('RPC_RESOLVED', {
                        promiseId,
                        scope,
                        result
                    })
                }

                const reject = (result) => {
                    ipcSend('RPC_REJECTED', {
                        promiseId,
                        scope,
                        result
                    });
                }

                const functionFromAlias = getFunction(functionToRun);
                // If we have a function, run it.
                if (functionFromAlias) {
                    // Run the function and get the result
                    const result = functionFromAlias.apply(null, functionInputs);
                    // We wrap the result in Promise.resolve so we can treat
                    // it like a promise (even if is not a promise);
                    Promise.resolve(result).then(resolve).catch(reject);
                }
                else {
                    if (options.ignoreMissingFunctions) return;
                    reject({ error: 'Function not found.' })
                }
            }
        });
        this.unsubscribeFunctions.push(unsubscribeFromRPC);


        /****************************************************************
        RPC Response.

        When we see RPC_RESOLVED or RPC_REJECTED events we must check
        to see if there is a corresponding RPC promise in the promise
        cache. If we find one, we resolve the promise.
        ****************************************************************/
        const unsubscribeFromRPCResolved = ipcReceive('RPC_RESOLVED', (payload) => {
            // Check the promise cache
            const promise = promises[payload.promiseId];
            if (promise) promise.resolve(payload.result);
        })
        this.unsubscribeFunctions.push(unsubscribeFromRPCResolved)

        const unsubscribeFromRPCRejected = ipcReceive('RPC_REJECTED', (payload) => {
            // Check the promise cache
            const promise = promises[payload.promiseId];
            if (promise) promise.reject(payload.result);
        })
        this.unsubscribeFunctions.push(unsubscribeFromRPCRejected)

    }

    release() {
        this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    }
};

module.exports = RpcIpcManager;
