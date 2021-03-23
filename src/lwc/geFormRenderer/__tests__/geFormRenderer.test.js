import { createElement } from 'lwc';
import GeFormRenderer from 'c/geFormRenderer';
import { mockCheckInputValidity } from 'lightning/input';
import { mockCheckComboboxValidity } from 'lightning/combobox';
import retrieveDefaultSGERenderWrapper from '@salesforce/apex/GE_GiftEntryController.retrieveDefaultSGERenderWrapper';
import getPaymentTransactionStatusValues from '@salesforce/apex/GE_PaymentServices.getPaymentTransactionStatusValues';

const mockWrapperWithNoNames = require('./data/retrieveDefaultSGERenderWrapper.json');
const mockPaymentTransactionStatusValues = JSON.stringify(require('./data/paymentTransactionStatusValues.json'));

jest.mock('@salesforce/apex/GE_GiftEntryController.retrieveDefaultSGERenderWrapper', () => {
    return { default: jest.fn() };
}, { virtual: true });

jest.mock('@salesforce/apex/GE_PaymentServices.getPaymentTransactionStatusValues', () => {
    return { default: jest.fn() };
}, { virtual: true });

describe('c-ge-form-renderer', () => {

    afterEach(() => {
        clearDOM();
        jest.clearAllMocks();
    });

    it('loads with template', () => {
        getPaymentTransactionStatusValues.mockResolvedValue(mockPaymentTransactionStatusValues);
        retrieveDefaultSGERenderWrapper.mockResolvedValue(mockWrapperWithNoNames);
        const element = createElement('c-ge-form-renderer', { is: GeFormRenderer });
        document.body.appendChild(element);
        return flushPromises().then(() => {
            expect(retrieveDefaultSGERenderWrapper).toHaveBeenCalledTimes(1);
            expect(element).toMatchSnapshot();
            const sections = element.shadowRoot.querySelectorAll('c-ge-form-section');
            expect(sections).toHaveLength(4);
        });
    });

    it('updates form state when a field is changed', () => {
        getPaymentTransactionStatusValues.mockResolvedValue(mockPaymentTransactionStatusValues);
        retrieveDefaultSGERenderWrapper.mockResolvedValue(mockWrapperWithNoNames);
        const element = createElement('c-ge-form-renderer', { is: GeFormRenderer });
        document.body.appendChild(element);
        return flushPromises().then(() => {
            const sections = element.shadowRoot.querySelectorAll('c-ge-form-section');
            const account1BillingCity = sections[1].shadowRoot.querySelectorAll('c-ge-form-field')[1];
            const changeEvent = new CustomEvent('formfieldchange', {
                detail: {
                    value: 'Gary',
                    label: 'Gary',
                    fieldMappingDevName: 'Account1_City_a992c3bb1'
                }
            });
            account1BillingCity.dispatchEvent(changeEvent);
            return flushPromises().then(() => {

            });
        });
    });


    it('saving without filling anything in should result in a page level error for missing fields', () => {
        getPaymentTransactionStatusValues.mockResolvedValue(mockPaymentTransactionStatusValues);
        retrieveDefaultSGERenderWrapper.mockResolvedValue(mockWrapperWithNoNames);
        // This error is specific to this mockRenderWrapperWithNoNames
        // Donor Type, Contact Preferred Email, Donation Date, Donation Amount, Payment Method appear as required

        mockCheckInputValidity.mockReturnValue(true); // lightning-input is always valid
        mockCheckComboboxValidity.mockReturnValue(true); // lightning-combobox is always valid

        const element = createElement('c-ge-form-renderer', { is: GeFormRenderer });
        document.body.appendChild(element);
        const mockSubmit = jest.fn();
        element.addEventListener('submit', mockSubmit);

        return flushPromises().then(() => {
            const sections = element.shadowRoot.querySelectorAll('c-ge-form-section');
            // for this template, the account1 billing city field is the second field in the second section
            const account1BillingCity = sections[1].shadowRoot.querySelectorAll('c-ge-form-field')[1];
            const changeEvent = new CustomEvent('formfieldchange', {
                detail: {
                    value: 'Gary',
                    label: 'Gary',
                    fieldMappingDevName: 'Account1_City_a992c3bb1'
                }
            });
            account1BillingCity.dispatchEvent(changeEvent);
            return flushPromises().then(() => {
                const btns = element.shadowRoot.querySelectorAll('lightning-button');
                btns[1].click();
                return flushPromises().then(() => {
                    expect(element).toMatchSnapshot();
                })
            });
        });
    });

    it('determines donor name when name fields are not in template', () => {

    });

    it('shows an error when currencies are mismatched', () => {

    });
})



