
import { fireEvent } from 'c/pubsubNoPageRef';
import { getNamespace, isFunction, isNull, validateJSONString } from 'c/utilCommon';

import PAYMENT_AUTHORIZATION_TOKEN_FIELD from
        '@salesforce/schema/DataImport__c.Payment_Authorization_Token__c';
import tokenRequestTimedOut from '@salesforce/label/c.gePaymentRequestTimedOut';


/***
* @description Visualforce page used to handle the payment services credit card tokenization request
*/
const TOKENIZE_CARD_PAGE_NAME = 'GE_TokenizeCard';

/***
* @description Event action sent to the Visualforce page to request the token
*/
const TOKENIZE_EVENT_ACTION = 'createToken';

/***
* @description Max number of ms to wait for the response containing a token or an error
*/
const TOKENIZE_TIMEOUT_MS = 10000;

const NON_NAMESPACED_CHARACTER = 'c';


/***
* @description Payment services Elevate credit card tokenization service
*/
class psElevateTokenHandler {
    /***
    * @description Custom labels
    */
    labels = Object.freeze({
        tokenRequestTimedOut
    });

    _visualforceOriginUrls;
    _visualforceOrigin;


    /***
    * @description Returns credit card tokenization Visualforce page URL
    */
    getTokenizeCardPageURL() {
        return this.currentNamespace
            ? `/apex/${this.currentNamespace}__${TOKENIZE_CARD_PAGE_NAME}`
            : `/apex/${TOKENIZE_CARD_PAGE_NAME}`;
    }

    getVisualForceOriginURLs(domainInfo, namespace) {
        const url = `https://${domainInfo.orgDomain}--${namespace}.visualforce.com`;
        const alternateUrl = `https://${domainInfo.orgDomain}--${namespace}.${domainInfo.podName}.visual.force.com`;
        const productionEnhancedUrl = `https://${domainInfo.orgDomain}--${namespace}.vf.force.com`;
        const sandboxEnhancedUrl =  `https://${domainInfo.orgDomain}--${namespace}.sandbox.vf.force.com`;

        return [
            {value: url},
            {value: alternateUrl},
            {value: productionEnhancedUrl},
            {value: sandboxEnhancedUrl}
        ];
    }

    /***
    * @description Builds the Visualforce origin url that we need in order to
    * make sure we're only listening for messages from the correct source.
    */
    setVisualforceOriginURLs(domainInfo) {
        if (isNull(domainInfo)) {
            return;
        }
        const namespace = this.currentNamespace ?
            this.currentNamespace : NON_NAMESPACED_CHARACTER;
        this._visualforceOriginUrls =
            this.getVisualForceOriginURLs(domainInfo, namespace);

    }

    /***
    * @description Returns the NPSP namespace (if any)
    */
    get currentNamespace() {
        return getNamespace(PAYMENT_AUTHORIZATION_TOKEN_FIELD.fieldApiName);
    }

    /***
    * @description Dispatches the application event when the Elevate credit card iframe
    * is displayed or hidden
    */
    dispatchApplicationEvent(eventName, payload) {
        fireEvent(null, eventName, payload);
    }

    /***
    * @description Listens for a message from the Visualforce iframe.
    * Rejects any messages from an unknown origin.
    */
    registerPostMessageListener(component) {
        const self = this;
        window.onmessage = async function (event) {
              if (self.shouldHandleMessage(event)) {
                const message = JSON.parse(event.data);
                component.handleMessage(message);
            }
        }
    }

    shouldHandleMessage (event) {
        return this.isExpectedVisualForceOrigin(event) &&
            validateJSONString(event.data);
    }

    isExpectedVisualForceOrigin (event) {
        this._visualforceOrigin = this._visualforceOriginUrls.find(
            origin => event.origin === origin.value
        );
        this._visualforceOrigin =
            this._visualforceOrigin !== undefined ?
                this._visualforceOrigin.value : undefined;
        return this._visualforceOrigin !== undefined;
    }

    /***
    * @description Handles messages received from Visualforce page.
    * @param message Message received from the iframe
    */
    handleMessage(message) {
        if (message.error || message.token) {
            if (isFunction(this.tokenCallback)) {
                this.tokenCallback(message);
            }
        }
    }

    /***
    * @description Method sends a message to the visualforce page iframe requesting a token.
    * This request response is found and handled in the registerPostMessageListener().
    * @param iframe The payment services iframe displayed within the credit card widget LWC
    * @param cardholderName The cardholder name
    * @param handleError An error handler function
    * @param resolveToken Function (if any) called when a token is generated
    * @return Promise A token promise
    */
    requestToken(iframe, cardholderName, handleError, resolveToken) {
        if (isNull(iframe)) {
            return;
        }

        const tokenPromise = new Promise((resolve, reject) => {

            const timer = setTimeout(() =>
                reject(handleError({
                    error: this.labels.tokenRequestTimedOut,
                    isObject: false
                })),
                TOKENIZE_TIMEOUT_MS
            );

            this.tokenCallback = message => {
                clearTimeout(timer);

                if (message.error) {
                    reject(handleError(message));

                } else if (message.token) {
                    if (resolveToken) {
                        resolve(resolveToken(message.token));
                    } else {
                        resolve(message.token);
                    }
                }
            };

        });

        iframe.contentWindow.postMessage(
            {
                action: TOKENIZE_EVENT_ACTION,
                nameOnCard: cardholderName
            },
            this._visualforceOrigin
        );

        return tokenPromise;
    }
}

/**
 * A new instance of the Elevate tokenization handler
 */
export default new psElevateTokenHandler();
