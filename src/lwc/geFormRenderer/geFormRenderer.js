import { LightningElement, api, track, wire } from 'lwc';

import sendPurchaseRequest from '@salesforce/apex/GE_GiftEntryController.sendPurchaseRequest';
import upsertDataImport from '@salesforce/apex/GE_GiftEntryController.upsertDataImport';
import submitDataImportToBDI from '@salesforce/apex/GE_GiftEntryController.submitDataImportToBDI';
import getPaymentTransactionStatusValues from '@salesforce/apex/GE_PaymentServices.getPaymentTransactionStatusValues';
import { getCurrencyLowestCommonDenominator } from 'c/utilNumberFormatter';

import PAYMENT_AUTHORIZE_TOKEN from '@salesforce/schema/DataImport__c.Payment_Authorization_Token__c';
import PAYMENT_ELEVATE_ID from '@salesforce/schema/DataImport__c.Payment_Elevate_ID__c';
import PAYMENT_CARD_NETWORK from '@salesforce/schema/DataImport__c.Payment_Card_Network__c';
import PAYMENT_EXPIRATION_YEAR from '@salesforce/schema/DataImport__c.Payment_Card_Expiration_Year__c';
import PAYMENT_EXPIRATION_MONTH from '@salesforce/schema/DataImport__c.Payment_Card_Expiration_Month__c';
import PAYMENT_GATEWAY_ID from '@salesforce/schema/DataImport__c.Payment_Gateway_ID__c';
import PAYMENT_TRANSACTION_ID from '@salesforce/schema/DataImport__c.Payment_Gateway_Payment_ID__c';
import PAYMENT_AUTHORIZED_AT from '@salesforce/schema/DataImport__c.Payment_Authorized_UTC_Timestamp__c';
import PAYMENT_LAST_4 from '@salesforce/schema/DataImport__c.Payment_Card_Last_4__c';
import PAYMENT_STATUS from '@salesforce/schema/DataImport__c.Payment_Status__c';
import PAYMENT_DECLINED_REASON from '@salesforce/schema/DataImport__c.Payment_Declined_Reason__c';
import DONATION_CAMPAIGN_NAME from '@salesforce/schema/DataImport__c.Donation_Campaign_Name__c';


import {getObjectInfo} from 'lightning/uiObjectInfoApi';
import GeFormService from 'c/geFormService';
import { NavigationMixin } from 'lightning/navigation';
import GeLabelService from 'c/geLabelService';
import messageLoading from '@salesforce/label/c.labelMessageLoading';
import { getNumberAsLocalizedCurrency } from 'c/utilNumberFormatter';
import {
    DONATION_DONOR_FIELDS,
    DONATION_DONOR,
    handleError,
    getRecordFieldNames,
    setRecordValuesOnTemplate,
    checkPermissionErrors,
    CONTACT_FIRST_NAME_INFO,
    CONTACT_LAST_NAME_INFO
} from 'c/utilTemplateBuilder';
import { registerListener, fireEvent } from 'c/pubsubNoPageRef';
import {
    getQueryParameters,
    isEmpty,
    isObject,
    isNotEmpty,
    format,
    isUndefined,
    hasNestedProperty,
    deepClone,
    getNamespace,
    getSubsetObject,
    validateJSONString,
    relatedRecordFieldNameFor
} from 'c/utilCommon';
import { ExceptionDataError } from './exceptionDataError';
import TemplateBuilderService from 'c/geTemplateBuilderService';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import FORM_TEMPLATE_FIELD from '@salesforce/schema/DataImportBatch__c.Form_Template__c';
import BATCH_DEFAULTS_FIELD from '@salesforce/schema/DataImportBatch__c.Batch_Defaults__c';
import STATUS_FIELD from '@salesforce/schema/DataImport__c.Status__c';
import NPSP_DATA_IMPORT_BATCH_FIELD from '@salesforce/schema/DataImport__c.NPSP_Data_Import_Batch__c';

import DATA_IMPORT_ACCOUNT1_IMPORTED_FIELD from '@salesforce/schema/DataImport__c.Account1Imported__c';
import DATA_IMPORT_ACCOUNT1_NAME_FIELD from '@salesforce/schema/DataImport__c.Account1_Name__c';
import DATA_IMPORT_CONTACT1_IMPORTED_FIELD from '@salesforce/schema/DataImport__c.Contact1Imported__c';
import DATA_IMPORT_CONTACT1_FIRSTNAME_FIELD from '@salesforce/schema/DataImport__c.Contact1_Firstname__c';
import DATA_IMPORT_CONTACT1_LASTNAME_FIELD from '@salesforce/schema/DataImport__c.Contact1_Lastname__c';
import DATA_IMPORT_DONATION_IMPORTED_FIELD from '@salesforce/schema/DataImport__c.DonationImported__c';
import DATA_IMPORT_PAYMENT_IMPORTED_FIELD from '@salesforce/schema/DataImport__c.PaymentImported__c';
import DATA_IMPORT_DONATION_IMPORT_STATUS_FIELD from '@salesforce/schema/DataImport__c.DonationImportStatus__c';
import DATA_IMPORT_PAYMENT_IMPORT_STATUS_FIELD from '@salesforce/schema/DataImport__c.PaymentImportStatus__c';
import DATA_IMPORT_ADDITIONAL_OBJECT_JSON_FIELD from '@salesforce/schema/DataImport__c.Additional_Object_JSON__c';
import DATA_IMPORT_DONATION_DONOR_FIELD
    from '@salesforce/schema/DataImport__c.Donation_Donor__c';
import DONATION_AMOUNT from '@salesforce/schema/DataImport__c.Donation_Amount__c';
import DONATION_DATE from '@salesforce/schema/DataImport__c.Donation_Date__c';
import DONATION_RECORD_TYPE_NAME
    from '@salesforce/schema/DataImport__c.Donation_Record_Type_Name__c';
import OPP_PAYMENT_AMOUNT
    from '@salesforce/schema/npe01__OppPayment__c.npe01__Payment_Amount__c';
import SCHEDULED_DATE from '@salesforce/schema/npe01__OppPayment__c.npe01__Scheduled_Date__c';
import { WIDGET_TYPE_DI_FIELD_VALUE, DISABLE_TOKENIZE_WIDGET_EVENT_NAME, HTTP_CODES, LABEL_NEW_LINE } from 'c/geConstants';


import ACCOUNT_OBJECT from '@salesforce/schema/Account';
import ACCOUNT_NAME_FIELD from '@salesforce/schema/Account.Name';
import CONTACT_OBJECT from '@salesforce/schema/Contact';
import CONTACT_NAME_FIELD from '@salesforce/schema/Contact.Name';
import OPP_PAYMENT_OBJECT from '@salesforce/schema/npe01__OppPayment__c';
import OPPORTUNITY_OBJECT from '@salesforce/schema/Opportunity';
import PARENT_OPPORTUNITY_FIELD from '@salesforce/schema/npe01__OppPayment__c.npe01__Opportunity__c';


// Labels are used in BDI_MatchDonations class
import userSelectedMatch from '@salesforce/label/c.bdiMatchedByUser';
import userSelectedNewOpp from '@salesforce/label/c.bdiMatchedByUserNewOpp';
import applyNewPayment from '@salesforce/label/c.bdiMatchedApplyNewPayment';

const ADDITIONAL_OBJECT_JSON__C = DATA_IMPORT_ADDITIONAL_OBJECT_JSON_FIELD.fieldApiName;

const mode = {
    CREATE: 'create',
    UPDATE: 'update'
};
const GIFT_ENTRY_TAB_NAME = 'GE_Gift_Entry';
const DONATION_DONOR_TYPE_ENUM = Object.freeze({
    ACCOUNT1: 'Account1',
    CONTACT1: 'Contact1'
});
const CREDIT_CARD_WIDGET_NAME = 'geFormWidgetTokenizeCard';

export default class GeFormRenderer extends NavigationMixin(LightningElement) {
    @api donorRecordId;
    @api donorApiName;
    @api donorRecord;
    @api fabricatedCardholderNames;
    @api loadingText;

    fieldNames = [ ACCOUNT_NAME_FIELD, CONTACT_NAME_FIELD ];
    @api sections = [];
    @api showSpinner = false;
    @api batchId;
    @api submissions = [];
    @api hasPageLevelError = false;
    @api pageLevelErrorMessageList = [];

    @track isPermissionError = false;
    @track permissionErrorTitle;
    @track permissionErrorMessage;
    @track formTemplate;
    @track fieldMappings;
    @track ready = false;
    @track name = '';
    @track description = '';
    @track mappingSet = '';
    @track version = '';
    @track formTemplateId;
    _batchDefaults;
    _isCreditCardWidgetInDoNotChargeState = false;
    _hasCreditCardWidget = false;

    erroredFields = [];
    CUSTOM_LABELS = { ...GeLabelService.CUSTOM_LABELS, messageLoading };

    @track dataImport = {}; // Row being updated when in update mode
    @track widgetData = {}; // data that must be passed down to the allocations widget.
    @track isAccessible = true;

    @track selectedDonorId;
    @track selectedDonation;
    @track selectedDonationDataImportFieldValues = {};

    @track hasPurchaseCallTimedout = false;

    _account1Imported;
    _contact1Imported;
    _account1Name;
    _contact1LastName;
    _contact1FirstName;

    /*******************************************************************************
     * @description Object used to hold current values for all fields on the form.
     */
    @track
    _formState = {}

    /** Determines when we show payment related text above the cancel and save buttons */
    get showPaymentSaveNotice() {
        return this._hasCreditCardWidget && this._isCreditCardWidgetInDoNotChargeState === false;
    }

    get title() {
        return hasNestedProperty(this.donorRecord, 'fields', 'Name', 'value') ?
            GeLabelService.format(
                this.CUSTOM_LABELS.geHeaderMatchingGiftBy,
                [this.donorRecord.fields.Name.value]) :
            this.CUSTOM_LABELS.commonNewGift;
    }

    get isSingleGiftEntry() {
        return this.batchId ? false : true;
    }

    get cancelButtonText() {
        return this.isSingleGiftEntry ?
            this.CUSTOM_LABELS.commonCancel :
            this.CUSTOM_LABELS.geButtonCancelAndClear;
    }

    @wire(getRecord, {recordId: '$donorRecordId', optionalFields: '$fieldNames'})
    wiredGetRecordMethod({error, data}) {
        if (data) {
            this.donorRecord = data;
            this.initializeForm(this.formTemplate, this.fieldMappings);
        } else if (error) {
            console.error(JSON.stringify(error));
        }
    }

    connectedCallback() {
        getPaymentTransactionStatusValues()
            .then(response => {
                this.PAYMENT_TRANSACTION_STATUS_ENUM = Object.freeze(JSON.parse(response));
            });

        registerListener('widgetData', this.handleWidgetData, this);
        registerListener('paymentError', this.handleAsyncWidgetError, this);
        registerListener('doNotChargeState', this.handleDoNotChargeCardState, this);
        registerListener('geDonationMatchingEvent', this.handleChangeSelectedDonation, this);

        GeFormService.getFormTemplate().then(response => {
            if (this.batchId) {
                // When the form is being used for Batch Gift Entry, the Form Template JSON
                // uses the @wire service below to retrieve the Template using the Template Id
                // stored on the Batch.
                return;
            }

            // check if there is a record id in the url
            this.selectedDonorId = this.donorRecordId = getQueryParameters().c__donorRecordId;
            const donorApiName = getQueryParameters().c__apiName;
            this.initializeDonationDonorTypeInFormState(donorApiName);

            // read the template header info
            if (response !== null && typeof response !== 'undefined') {
                this.formTemplate = response.formTemplate;
                this.fieldMappings = response.fieldMappingSetWrapper.fieldMappingByDevName;

                let errorObject = checkPermissionErrors(this.formTemplate);
                if (errorObject) {
                    this.setPermissionsError(errorObject);

                    return;
                }

                // get the target field names to be used by getRecord
                let fieldNamesFromTemplate =
                    getRecordFieldNames(this.formTemplate, this.fieldMappings, donorApiName);
                this.fieldNames = [...this.fieldNames, ...fieldNamesFromTemplate];
                if (isEmpty(this.donorRecordId)) {
                    // if we don't have a donor record, it's ok to initialize the form now
                    // otherwise the form will be initialized after wiredGetRecordMethod completes
                    this.initializeForm(this.formTemplate);
                }
            }
        });
    }

    initializeDonationDonorTypeInFormState(donorApiName) {
        if (donorApiName === 'Account') {
            this.updateFormState({
                [DATA_IMPORT_DONATION_DONOR_FIELD]: DONATION_DONOR_TYPE_ENUM.ACCOUNT1
            });
        }
        if (donorApiName === 'Contact') {
            this.updateFormState({
                [DATA_IMPORT_DONATION_DONOR_FIELD]: DONATION_DONOR_TYPE_ENUM.CONTACT1
            });
        }
    }

    initializeForm(formTemplate, fieldMappings) {
        // read the template header info
        this.ready = true;
        this.name = formTemplate.name;
        this.description = formTemplate.description;
        this.version = formTemplate.layout.version;

        if (typeof formTemplate.layout !== 'undefined'
            && Array.isArray(formTemplate.layout.sections)) {
            // add record data to the template fields

            if (isNotEmpty(fieldMappings) && isNotEmpty(this.donorRecord)) {
                this.sections = setRecordValuesOnTemplate(formTemplate.layout.sections,
                    fieldMappings, this.donorRecord);
            } else {
                this.sections = formTemplate.layout.sections;
            }

            if (!this.isSingleGiftEntry) {
                this.sections = this.prepareFormForBatchMode(formTemplate.layout.sections);
                this.dispatchEvent(new CustomEvent('sectionsretrieved'));
            }
        }

        this.sections = this.appendRecordTypeLocationInfoToPicklistElements(this.sections);
        this.initializeFormState();
    }

    appendRecordTypeLocationInfoToPicklistElements(sections) {
        let updatedSections = deepClone(sections);

        updatedSections
            .forEach(section => {
                section.elements
                    .forEach(element => {
                        this.appendRecordTypeLocationInfoToElement(element);
                    })
            });

        return updatedSections;
    }

    appendRecordTypeLocationInfoToElement(element) {
        const fieldMappingDevName =
            element.dataImportFieldMappingDevNames &&
            element.dataImportFieldMappingDevNames[0];

        if (fieldMappingDevName) {
            element.siblingRecordTypeField =
                this.siblingRecordTypeFieldFor(fieldMappingDevName);
            element.parentRecordField =
                this.parentRecordFieldFor(fieldMappingDevName);
        }
    }

    setPermissionsError(errorObject) {
        if (errorObject) {
            this.isPermissionError = true;
            this.permissionErrorTitle = errorObject.errorTitle;
            this.permissionErrorMessage = errorObject.errorMessage;
        }
    }

    @wire(getRecord, {
        recordId: '$batchId',
        fields: [FORM_TEMPLATE_FIELD, BATCH_DEFAULTS_FIELD]
    })
    wiredBatch({data, error}) {
        if (data) {
            this.formTemplateId = data.fields[FORM_TEMPLATE_FIELD.fieldApiName].value;
            this._batchDefaults = data.fields[BATCH_DEFAULTS_FIELD.fieldApiName].value;
            GeFormService.getFormTemplateById(this.formTemplateId)
                .then(formTemplate => {
                    this.formTemplate = formTemplate;

                    let errorObject = checkPermissionErrors(formTemplate);
                    if (errorObject) {
                        this.dispatchEvent(new CustomEvent('permissionerror'));
                        this.setPermissionsError(errorObject)
                    }
                    this.initializeForm(formTemplate, GeFormService.fieldMappings);
                })
                .catch(err => {
                    handleError(err);
                });
        } else if (error) {
            handleError(error);
        }
    }

    handleCancel() {
        this.reset();
        this.initializeFormState();

        // if not in batch mode, go back to point of origin
        if (isEmpty(this.batchId)) {
            if (isNotEmpty(this.donorRecordId)) {
                // go back to the donor record page
                this.navigateToRecordPage(this.donorRecordId);
            } else {
                // go back to the gift entry landing page;
                this.navigateToLandingPage();
            }
        }
    }

    /*******************************************************************************
    * @description Dispatches an event to the geFormWidgetTokenizeCard component
    * to disable itself and display the provided message.
    *
    * @param {string} message: Message to display in the UI
    */
    dispatchdDisablePaymentServicesWidgetEvent(message) {
        fireEvent(this, DISABLE_TOKENIZE_WIDGET_EVENT_NAME,
            { detail: { message: message } });
    }

    /*******************************************************************************
    * @description Dispatches an event and notifies the parent component to display
    * an aura overlay library modal with a lightning web component in its body.
    *
    * @param {string} modalBodyComponentName: Name of the LWC to render in the
    * overlay library modal's body.
    */
    toggleModalByComponentName(modalBodyComponentName) {
        const detail = {
            modalProperties: {
                componentName: modalBodyComponentName,
                showCloseButton: false
            }
        };
        this.dispatchEvent(new CustomEvent('togglemodal', { detail }));
    }

    handleSaveBatchGiftEntry(dataImportRecord, formControls) {
        // reset function for callback
        const reset = () => this.reset();
        // handle error on callback from promise
        const handleCatchError = (err) => this.handleCatchOnSave(err);

        this.dispatchEvent(new CustomEvent('submit', {
            detail: {
                dataImportRecord,
                success: () => {
                    formControls.enableSaveButton();
                    formControls.toggleSpinner();
                    reset();
                },
                error: (error) => {
                    formControls.enableSaveButton();
                    formControls.toggleSpinner();
                    handleCatchError(error);
                }
            }
        }));
    }

    @api
    handleCatchOnSave( error ) {
        // var inits
        const sectionsList = this.template.querySelectorAll('c-ge-form-section');
        const exceptionWrapper = new ExceptionDataError(error);
        const allDisplayedFields = this.getDisplayedFieldsMappedByAPIName(sectionsList);
        this.hasPageLevelError = true;

        if (isNotEmpty(exceptionWrapper.exceptionType)) {

            // Check to see if there are any field level errors
            if (Object.entries(exceptionWrapper.DMLErrorFieldNameMapping).length === undefined ||
                Object.entries(exceptionWrapper.DMLErrorFieldNameMapping).length === 0) {

                // validation rules on Target Objects shows up here
                // unfortunately currently it doesnt bring field info yet
                if (isNotEmpty(exceptionWrapper.errorMessage)) {
                    let errorMessage = exceptionWrapper.errorMessage;

                    const errorMessageObject = validateJSONString(exceptionWrapper.errorMessage);
                    if (errorMessageObject) {
                        errorMessage = errorMessageObject.errorMessage;
                    }

                    this.addPageLevelErrorMessage({ errorMessage, index: this.pageLevelErrorMessageList.length });
                }

                // If there are no specific fields the error has to go to,
                // put it on the page level error message.
                for (const dmlIndex in exceptionWrapper.DMLErrorMessageMapping) {
                    const errorMessage = exceptionWrapper.DMLErrorMessageMapping[dmlIndex];
                    const index = dmlIndex + 1;
                    this.addPageLevelErrorMessage({ errorMessage, index });
                }

            } else {
                // If there is a specific field that each error is supposed to go to,
                // show it on the field on the page.
                // If it is not on the page to show, display it on the page level.
                for (const key in exceptionWrapper.DMLErrorFieldNameMapping) {

                    // List of fields with this error
                    let fieldList = exceptionWrapper.DMLErrorFieldNameMapping[key];
                    // Error message for the field.
                    let errorMessage = exceptionWrapper.DMLErrorMessageMapping[key];
                    // Errored fields that are not displayed
                    let hiddenFieldList = [];

                    fieldList.forEach(fieldWithError => {

                        // Go to the field and set the error message using setCustomValidity
                        if (fieldWithError in allDisplayedFields) {
                            let fieldInput = allDisplayedFields[fieldWithError];
                            this.erroredFields.push(fieldInput);
                            fieldInput.setCustomValidity(errorMessage);
                        } else {
                            // Keep track of errored fields that are not displayed.
                            hiddenFieldList.push(fieldWithError);
                        }

                    });

                    // If there are hidden fields, display the error message at the page level.
                    // With the fields noted.
                    if (hiddenFieldList.length > 0) {
                        let combinedFields = hiddenFieldList.join(', ');
                        this.addPageLevelErrorMessage({
                            errorMessage: `${errorMessage} [${combinedFields}]`,
                            index: key
                        });
                    }
                }
            }
        } else {
            this.addPageLevelErrorMessage({ errorMessage: exceptionWrapper.errorMessage, index: 0 });
        }

        // focus either the page level or field level error messsage somehow
        window.scrollTo(0, 0);
    }

    /*******************************************************************************
    * @description Add an error message to the overall page level error messages
    * array.
    *
    * @param {string} errorMessage: Error message to be displayed
    * @param {integer} index: Position of the corresponding row in a DML exception
    */
    addPageLevelErrorMessage(errorObject) {
        errorObject.index = errorObject.index ? errorObject.index : 0;
        this.pageLevelErrorMessageList = [
            ...this.pageLevelErrorMessageList,
            { ...errorObject }
        ];
        this.hasPageLevelError = true;
    }

    /*******************************************************************************
    * @description Handles the form save action. Builds a data import record and
    * calls handlers for Batch Gift and Single Gift depending on the form's mode.
    *
    * @param {object} event: Onclick event from the form save button
    */
    async handleSave(event) {
        const sectionsList = this.template.querySelectorAll('c-ge-form-section');
        const isFormReadyToSave = this.prepareFormForSave(sectionsList);

        if (isFormReadyToSave) {
            // Disable save button
            event.target.disable = true;
            const formControls = this.getFormControls(event);
            formControls.toggleSpinner();

            // TODO: Victor will likely remove lines 619 - 628
            let inMemoryDataImport;
            try {
                inMemoryDataImport = await this.buildDataImportFromSections(
                    sectionsList, this.selectedDonationDataImportFieldValues
                );
            } catch(ex) {
                // exceptions that we expect here are all async widget-related
                this.handleAsyncWidgetError(ex);
                return;
            }

            let dataImportFromFormState = this.saveableFormState();
            // TODO: Workaround to retrieve the token if available, purge later
            this.TEMPORARY_forceTokenOntoDataImport(dataImportFromFormState, inMemoryDataImport);

            // handle save depending mode
            if (this.batchId) {
                this.handleSaveBatchGiftEntry(dataImportFromFormState, formControls);
            } else {
                await this.submitSingleGift(dataImportFromFormState);
            }
        }
    }

    /*******************************************************************************
    * @description Clears existing errors from the form and re-validates all form
    * sections.
    *
    * @param {list} sectionsList: List of all the form sections
    *
    * @return {boolean}: True if the form is ready for a save attempt.
    */
    prepareFormForSave(sectionsList) {
        // clean errors present on form
        this.clearErrors();
        // apply custom and standard field validation
        if (!this.isFormValid(sectionsList)) {
            return false;
        }
        return true;
    }

    /*******************************************************************************
    * @description Collects form controls for toggling the spinner and enabling
    * the form save button in one object.
    *
    * @param {object} event: Onclick event from the form save button
    *
    * @return {object}: An object with methods that toggle the form lightning
    * spinner and enables the form save button.
    */
    getFormControls(event) {
        const toggleSpinner = () => this.toggleSpinner();
        const enableSaveButton = function () {
            this.disabled = false;
        }.bind(event.target);

        return { toggleSpinner, enableSaveButton };
    }

    isFormValid(sectionsList) {

        // custom donor type validation
        if (this.isDonorTypeInvalid(sectionsList)) {
            return false;
        }

        // field validations
        let invalidFields = [];
        sectionsList.forEach(section => {
            const fields = section.getInvalidFields();
            invalidFields.push(...fields);
        });

        if (invalidFields.length > 0) {
            let fieldListAsString = invalidFields.join(', ');
            this.hasPageLevelError = true;
            this.pageLevelErrorMessageList = [ {
                index: 0,
                errorMessage: `The following fields are required: ${fieldListAsString}`
            } ];
        }

        return invalidFields.length === 0;
    }

    /**
     * validates donation donor type on sectionsList
     * @param sectionsList, list of sections
     * @returns {boolean|*} - true if form invalid, false otherwise
     */
    isDonorTypeInvalid(sectionsList) {

        const DONATION_VALUES = [
            DONATION_DONOR_FIELDS.donationDonorField,
            DONATION_DONOR_FIELDS.account1ImportedField, DONATION_DONOR_FIELDS.account1NameField,
            DONATION_DONOR_FIELDS.contact1ImportedField, DONATION_DONOR_FIELDS.contact1LastNameField
        ];
        // get label and value using apiName as key from fields for each section
        let miniFieldWrapper = {};
        sectionsList.forEach(section => {
            miniFieldWrapper = { ...miniFieldWrapper, ...(section.getFieldValueAndLabel(DONATION_VALUES))};
        });

        // if no donation donor selection, nothing to validate here yet
        if ( isEmpty(miniFieldWrapper[DONATION_DONOR_FIELDS.donationDonorField].value) ) {
            return false;
        }

        // returns true when error message was generated
        return this.getDonorTypeValidationError( miniFieldWrapper, sectionsList );
    }

    /**
     * helper class for isDonorTypeInvalid, contains majority of logic
     * @param fieldWrapper - Array, field ui-label and value using field-api-name as key
     * @param sectionsList - Array, all sections
     * @returns {boolean} - true if error message was generated, false if otherwise
     */
    getDonorTypeValidationError(fieldWrapper, sectionsList) {

        // get data import record helper
        const di_record = this.getDataImportHelper(fieldWrapper);

        // donation donor validation depending on selection and field presence
        let isError = (di_record.donationDonorValue === DONATION_DONOR.isAccount1) ?
            di_record.isAccount1ImportedEmpty && di_record.isAccount1NameEmpty :
            di_record.donationDonorValue === DONATION_DONOR.isContact1 &&
            di_record.isContact1ImportedEmpty && di_record.isContact1LastNameEmpty;

        // process error notification when error
        if (isError) {
            // highlight validation fields
            this.highlightValidationErrorFields(di_record, sectionsList, ' ');
            // set page error
            this.hasPageLevelError = true;
            this.pageLevelErrorMessageList = [ {
                index: 0,
                errorMessage: this.getDonationDonorErrorLabel(di_record, fieldWrapper)
            } ];
        }

        return isError;
    }

    /**
     * Set donation donor error message using custom label depending on field presence
     * @param diRecord, Object - helper obj
     * @param fieldWrapper, Array of fields with Values and Labels
     * @returns {String}, formatted error message for donation donor validation
     */
    getDonationDonorErrorLabel(diRecord, fieldWrapper) {

        // init array replacement for custom label
        let validationErrorLabelReplacements = [diRecord.donationDonorValue, diRecord.donationDonorLabel];

        if (diRecord.donationDonorValue === DONATION_DONOR.isAccount1) {
            if (diRecord.isAccount1ImportedPresent)
                validationErrorLabelReplacements.push(fieldWrapper[DONATION_DONOR_FIELDS.account1ImportedField].label);
            if (diRecord.isAccount1NamePresent)
                validationErrorLabelReplacements.push(fieldWrapper[DONATION_DONOR_FIELDS.account1NameField].label);
        } else {
            if (diRecord.isContact1ImportedPresent)
                validationErrorLabelReplacements.push(fieldWrapper[DONATION_DONOR_FIELDS.contact1ImportedField].label);
            if (diRecord.isContact1LastNamePresent)
                validationErrorLabelReplacements.push(fieldWrapper[DONATION_DONOR_FIELDS.contact1LastNameField].label);
        }

        // set label depending fields present on template
        let label;
        switch (validationErrorLabelReplacements.length) {
            case 2:
                label = this.CUSTOM_LABELS.geErrorDonorTypeInvalid;
                break;
            case 3:
                label = this.CUSTOM_LABELS.geErrorDonorTypeValidationSingle;
                break;
            case 4:
                label = this.CUSTOM_LABELS.geErrorDonorTypeValidation;
                break;
            default:
                label = this.CUSTOM_LABELS.geErrorDonorTypeInvalid;
        }

        // set message using replacement array
        return format(label, validationErrorLabelReplacements);
    }

    /**
     * highlight geForm fields on lSections using sError as message
     * @param diRecord, Object - helper obj
     * @param lSections, Array of geFormSection
     * @param sError, String to set on setCustomValidity
     */
    highlightValidationErrorFields(diRecord, lSections, sError) {

        // prepare array to highlight fields that require attention depending on Donation_Donor
        const highlightFields = [DONATION_DONOR_FIELDS.donationDonorField,
            diRecord.donationDonorValue === DONATION_DONOR.isAccount1 ? DONATION_DONOR_FIELDS.account1ImportedField :
                DONATION_DONOR_FIELDS.contact1ImportedField,
            diRecord.donationDonorValue === DONATION_DONOR.isAccount1 ? DONATION_DONOR_FIELDS.account1NameField :
                DONATION_DONOR_FIELDS.contact1LastNameField
        ];
        lSections.forEach(section => {
            section.setCustomValidityOnFields(highlightFields, sError);
        });

    }

    /**
     * helper object to minimize length of if statements and improve code legibility
     * @param fieldWrapper, Array of fields with Values and Labels
     * @returns Object, helper object to minimize length of if statements and improve code legibility
     */
    getDataImportHelper(fieldWrapper) {

        const dataImportRecord = {
            // donation donor
            donationDonorValue: fieldWrapper[DONATION_DONOR_FIELDS.donationDonorField].value,
            donationDonorLabel: fieldWrapper[DONATION_DONOR_FIELDS.donationDonorField].label,
            // empty val checks
            isAccount1ImportedEmpty: isEmpty(fieldWrapper[DONATION_DONOR_FIELDS.account1ImportedField]) ||
                isEmpty(fieldWrapper[DONATION_DONOR_FIELDS.account1ImportedField].value),
            isContact1ImportedEmpty: isEmpty(fieldWrapper[DONATION_DONOR_FIELDS.contact1ImportedField]) ||
                isEmpty(fieldWrapper[DONATION_DONOR_FIELDS.contact1ImportedField].value),
            isContact1LastNameEmpty: isEmpty(fieldWrapper[DONATION_DONOR_FIELDS.contact1LastNameField]) ||
                isEmpty(fieldWrapper[DONATION_DONOR_FIELDS.contact1LastNameField].value),
            isAccount1NameEmpty: isEmpty(fieldWrapper[DONATION_DONOR_FIELDS.account1NameField]) ||
                isEmpty(fieldWrapper[DONATION_DONOR_FIELDS.account1NameField].value),
            // field presence
            isAccount1ImportedPresent: isNotEmpty(fieldWrapper[DONATION_DONOR_FIELDS.account1ImportedField]),
            isAccount1NamePresent: isNotEmpty(fieldWrapper[DONATION_DONOR_FIELDS.account1NameField]),
            isContact1ImportedPresent: isNotEmpty(fieldWrapper[DONATION_DONOR_FIELDS.contact1ImportedField]),
            isContact1LastNamePresent: isNotEmpty(fieldWrapper[DONATION_DONOR_FIELDS.contact1LastNameField])
        };
        return dataImportRecord;
    }

    navigateToRecordPage(recordId) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: recordId,
                actionName: 'view'
            }
        });
    }

    // change showSpinner to the opposite of its current value
    toggleSpinner() {
        this.showSpinner = !this.showSpinner;
    }

    getDisplayedFieldsMappedByAPIName(sectionsList) {
        let allFields = {};
        sectionsList.forEach(section => {
            const fields = section.getAllFieldsByAPIName();

            allFields = Object.assign(allFields, fields);
        });

        return allFields;
    }

    clearErrors() {

        // Clear the page level error
        this.hasPageLevelError = false;
        this.pageLevelErrorMessageList = [];

        // Clear the field level errors
        if (this.erroredFields.length > 0) {
            this.erroredFields.forEach(fieldToReset => {
                fieldToReset.setCustomValidity('');
            });
        }

        this.erroredFields = [];
    }

    @api
    load(dataImport, applySelectedDonationFieldValues = true) {
        this.updateFormState(dataImport);
        if (dataImport.Id) {
            this.appendNullValuesForMissingFields(dataImport);
            // Set this.dataImport when the record Id is present so
            // the form knows it is in update mode
            this.dataImport = dataImport;
        }

        // If the dataImport being loaded has Donation Donor, Contact1Imported,
        // or Account1Imported set, set the Renderer's stored property values
        this.setStoredDonationDonorProperties(dataImport);

        // If there is a currently selected Donation and the caller wants those values
        // applied to the dataImport record, add them (used during save operation)
        if (this.selectedDonation && applySelectedDonationFieldValues) {
            dataImport = {...dataImport, ...this.selectedDonationDataImportFieldValues};
        }

        if (this.selectedDonation && this.selectedDonation.Id &&
            this.selectedDonation.Id.startsWith(this.oppPaymentKeyPrefix)) {
            // If the selected donation is a Payment, set Donation Amount
            // and Donation Date to the values from the selected Payment.
            dataImport[DONATION_AMOUNT.fieldApiName] =
                this.selectedDonation[OPP_PAYMENT_AMOUNT.fieldApiName];
            dataImport[DONATION_DATE.fieldApiName] =
                this.selectedDonation[SCHEDULED_DATE.fieldApiName];
        }

        const sectionsList = this.template.querySelectorAll('c-ge-form-section');
        sectionsList.forEach(section => {
            section.load(
                getSubsetObject(
                    this.flatten(dataImport),
                    section.sourceFields));
        });

        this.handleNameOnCardFieldChange();
    }

    setStoredDonationDonorProperties(dataImport) {
        const donationDonor = dataImport[DONATION_DONOR_FIELDS.donationDonorField];
        if (donationDonor) {
            this.handleDonationDonorChange(
                dataImport[DONATION_DONOR_FIELDS.donationDonorField]
            );
        }
        if (dataImport[DATA_IMPORT_ACCOUNT1_IMPORTED_FIELD.fieldApiName]) {
            this.handleDonorAccountChange(dataImport[DATA_IMPORT_ACCOUNT1_IMPORTED_FIELD.fieldApiName]);
        }
        if (dataImport[DATA_IMPORT_CONTACT1_IMPORTED_FIELD.fieldApiName]) {
            this.handleDonorContactChange(
                dataImport[DATA_IMPORT_CONTACT1_IMPORTED_FIELD.fieldApiName]
            );
        }
        if (dataImport[DATA_IMPORT_CONTACT1_LASTNAME_FIELD.fieldApiName]) {
            this._contact1LastName = dataImport[DATA_IMPORT_CONTACT1_LASTNAME_FIELD.fieldApiName].value;
        }
        if (dataImport[DATA_IMPORT_CONTACT1_FIRSTNAME_FIELD.fieldApiName]) {
            this._contact1FirstName = dataImport[DATA_IMPORT_CONTACT1_FIRSTNAME_FIELD.fieldApiName].value;
        }
        if (dataImport[DATA_IMPORT_ACCOUNT1_NAME_FIELD.fieldApiName]) {
            this._account1Name = dataImport[DATA_IMPORT_ACCOUNT1_NAME_FIELD.fieldApiName].value;
        }
    }

    @api
    reset(applyDefaultValues = true) {
        this.resetFields(applyDefaultValues);
        this.resetFormState();
        this.widgetData = {};
    }

    resetFormState() {
        this.dataImport = null;
        this.setReviewDonationsDonorProperties(null);
        this.resetStoredDonationDonorProperties();
        this.initializeFormState();
    }

    resetFields(applyDefaultValues) {
        this.template.querySelectorAll('c-ge-form-section')
            .forEach(section => {
                section.reset(applyDefaultValues);
            });
    }

    resetFieldsForObjMappingApplyDefaults(objectMappingDeveloperName) {
        this.template.querySelectorAll('c-ge-form-section')
            .forEach(section => {
                section.resetFieldsForFieldMappingsApplyDefaults(
                    this.fieldMappingDevNamesFor(objectMappingDeveloperName));
            });

        this.setFormStateToInitialFieldValuesForObjMapping(objectMappingDeveloperName);
    }

    fieldMappingDevNamesFor(objectMappingDeveloperName) {
        return Object.values(GeFormService.fieldMappings)
            .filter(
                ({Target_Object_Mapping_Dev_Name}) =>
                    Target_Object_Mapping_Dev_Name === objectMappingDeveloperName)
            .map(({DeveloperName}) => DeveloperName);
    }

    resetStoredDonationDonorProperties() {
        this._account1Imported = null;
        this._contact1Imported = null;
        this._account1Name = null;
        this._contact1LastName = null;
        this._contact1FirstName = null;
        fireEvent(this, 'resetReviewDonationsEvent', {});
    }

    get mode() {
        return this.dataImport && this.dataImport.Id ? mode.UPDATE : mode.CREATE;
    }

    @api
    get saveActionLabel() {
        return this.isSingleGiftEntry ?
            this.CUSTOM_LABELS.commonSave :
            this.mode === mode.UPDATE ?
                this.CUSTOM_LABELS.commonUpdate :
                this.CUSTOM_LABELS.geButtonSaveNewGift;
    }

    @api
    get isUpdateActionDisabled() {
        return this.dataImport && this.dataImport[STATUS_FIELD.fieldApiName] === 'Imported';
    }

    /**
     * Combine fabricated names and lookup names, giving priority to non-empty fabricated names
     */
    @api
    getCardholderNames() {
        const names = this.fabricatedCardholderNames;
        const firstName = isNotEmpty(names.firstName) ? names.firstName : this._contact1FirstName;
        const lastName = isNotEmpty(names.lastName) ? names.lastName : this._contact1LastName;
        const accountName = isNotEmpty(names.accountName) ? names.accountName : this._account1Name;
        if (this.donorType() === DONATION_DONOR_TYPE_ENUM.ACCOUNT1) {
            return {
                firstName: accountName,
                lastName: accountName
            }
        } else {
            return { firstName, lastName };
        }

    }

    /**
     * Handle payment errors at the form level
     * @param event The paymentError event object
     */
    handleAsyncWidgetError(event) {
        let errorMessage = this.CUSTOM_LABELS.commonUnknownError;
        let errorResponse;

        if (event.error && event.error.message) {
            errorMessage = event.error.message[0];

            if (event.error.message.length > 1) {
                errorResponse = event.error.message[1];
            }
        }

        let errorObjects = [];
        if (event.error && event.error.isObject) {
            // Represents the error response returned from payment services
            let errorObject = JSON.parse(errorResponse);
            errorObject.forEach((message, index) => {
                errorObjects.push({
                    message: message,
                    index: index
                });
            });

        } else if (errorResponse) {
            let errorObject = errorResponse.message
                ? errorResponse
                : {
                    message: errorResponse,
                    index: 0
                };
            errorObjects.push(errorObject);
        }

        this.pageLevelErrorMessageList = [{
            index: 0,
            errorMessage: errorMessage,
            multilineMessages: errorObjects
        }];
        this.showSpinner = false;
        this.hasPageLevelError = true;
    }

    /**
     * @description Set variable that informs the form renderer when the
     *  credit card widget is in a 'do not charge' state
     * @param event
     */
    handleDoNotChargeCardState (event) {
        this._isCreditCardWidgetInDoNotChargeState = event.isWidgetDisabled;
    }

    /**
     * Track widget data so that our widgets can react to the overall state of the form
     * @param payload   An object to store in widgetData
     */
    handleWidgetData(payload) {
        this.widgetData = {...this.widgetData, ...payload};
    }

    /*******************************************************************************
    * @description Builds a full DataImport__c record from the provided form sections
    * and potential donor data selected from the review donations modal.
    *
    * @param {list} sections: List of all form sections
    * @param {object} dataImportWithDonorData: Object holding data import values from
    * the 'Review Donations' modal.
    */
    async buildDataImportFromSections(sections, dataImportWithDonorData) {
        let dataImportRecord = await this.buildDataImportRecord(sections, dataImportWithDonorData);

        if (!dataImportRecord[NPSP_DATA_IMPORT_BATCH_FIELD.fieldApiName]) {
            dataImportRecord[NPSP_DATA_IMPORT_BATCH_FIELD.fieldApiName] = this.batchId;
        }
        if (this.dataImport && this.dataImport.Id) {
            dataImportRecord.Id = this.dataImport.Id;
        }

        return dataImportRecord;
    }

    /**
     * Grab the data from the form fields and widgets, convert to a data import record.
     * @param sectionList   List of ge-form-sections on the form
     * @param dataImportWithDonorData        Existing account or contact record to attach to the data import record
     * @return {{widgetValues: {}, diRecord: {}}}
     */
    async buildDataImportRecord(sectionList, dataImportWithDonorData) {
        let fieldData = {};
        let widgetValues = [];

        sectionList.forEach(section => {
            fieldData = {...fieldData, ...(section.values)};
            widgetValues = widgetValues.concat(section.widgetValues);
        });

        // Build the DI Record
        let diRecord = {};

        for (let [key, value] of Object.entries(fieldData)) {
            let fieldWrapper = GeFormService.getFieldMappingWrapper(key);
            if (isNotEmpty(fieldWrapper)) {
                diRecord[fieldWrapper.Source_Field_API_Name] = value;
            }
        }

        // Include any fields from a user selected donation, if
        // those fields are not already on the diRecord
        if (dataImportWithDonorData) {
            for (const [key, value] of Object.entries(dataImportWithDonorData)) {
                if (!diRecord.hasOwnProperty(key)) {
                    diRecord[key] = value === null || value.value === null ?
                        null : value.value || value;
                }
            }
        }

        // resolve widget data to wherever it needs to go, a field on the di object or elsewhere.
        if (widgetValues) {
            let diFieldPayloads = [];

            widgetValues.forEach(widgetValue => {
                if(widgetValue.type === WIDGET_TYPE_DI_FIELD_VALUE && !isUndefined(widgetValue.payload)) {
                    diFieldPayloads.push(widgetValue.payload);
                }
            });

            // diFieldValues is an array of objects where the key is the field name
            // and the value is the value to be stored
            const diFieldValuesArray = await Promise.all(diFieldPayloads);
            let additionalObjectValues = {};

            diFieldValuesArray.forEach(fieldValues => {
                Object.entries(fieldValues).forEach(([key, value]) => {
                    if(key === ADDITIONAL_OBJECT_JSON__C) {
                        // need to accumulate these values so we can serialize them
                        // before placing them into the data import object
                        Object.assign(additionalObjectValues, value);
                    } else {
                        diRecord[key] = value;
                    }
                })
            });
            diRecord[ADDITIONAL_OBJECT_JSON__C] = JSON.stringify(additionalObjectValues);
        }
        return diRecord;
    }

    /*******************************************************************************
     * @description Navigates to Gift Entry landing page.
     */
    navigateToLandingPage() {
        const giftEntryTabName =
            TemplateBuilderService.alignSchemaNSWithEnvironment(
                GIFT_ENTRY_TAB_NAME,
                this.namespace
            );
        let url = `/lightning/n/${giftEntryTabName}`;

        this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: {
                    url: url
                }
            },
            true
        );
    }

    /*******************************************************************************
     * @description Pass through method that receives an event from geReviewDonations
     * to notify the parent component to construct a modal for reviewing donations.
     *
     * @param {object} event: Event object containing a payload for the modal.
     */
    toggleModal(event) {
        this.dispatchEvent(new CustomEvent('togglemodal', { detail: event.detail }));
    }

    getSiblingFieldsForSourceField(sourceFieldApiName) {
        const objectMapping = Object.values(GeFormService.objectMappings)
            .find(({Imported_Record_Field_Name}) =>
                Imported_Record_Field_Name === sourceFieldApiName);
        return this.getSiblingFields(objectMapping.DeveloperName);
    }

    getSiblingFields(objectMappingDeveloperName) {
        // For a given field, get the full list of fields related to its object mapping

        // 1. Get this field's object mapping
        // 2. Get the other field mappings that have the same Target_Object_Mapping_Dev_Name
        // 3. Return the list of fields from those mappings

        const objectMapping =
            GeFormService.getObjectMapping(objectMappingDeveloperName);

        const relevantFieldMappings =
            Object.values(GeFormService.fieldMappings)
                .filter(({Target_Object_Mapping_Dev_Name}) =>
                    Target_Object_Mapping_Dev_Name === objectMapping.DeveloperName);

        // Return the sibling fields used by Advanced Mapping
        return relevantFieldMappings.map(
            ({Target_Field_API_Name}) =>
                `${objectMapping.Object_API_Name}.${Target_Field_API_Name}`);
    }

    handleLookupRecordSelect(event) {
        const recordId = event.detail.value; // Reset the field if null
        const fieldApiName = event.detail.fieldApiName;

        if (!GeFormService.importedRecordFieldNames.includes(fieldApiName)) {
            return false;
        }

        if (event.detail.hasOwnProperty('value') && recordId !== null) {
            this.loadSelectedRecordFieldValues(fieldApiName, recordId);
        } else {
            // Reset all fields related to this lookup field's object mapping
            this.resetFieldsForObjMappingApplyDefaults(
                this.objectMappingDeveloperNameFor(fieldApiName));
        }

        this.handleDonorLookupFieldsChange(fieldApiName, recordId);
    }

    handleDonorLookupFieldsChange(fieldApiName, recordId) {
        if (fieldApiName === DATA_IMPORT_ACCOUNT1_IMPORTED_FIELD.fieldApiName) {
            this.handleDonorAccountChange(recordId);
        } else if (fieldApiName === DATA_IMPORT_CONTACT1_IMPORTED_FIELD.fieldApiName) {
            this.handleDonorContactChange(recordId);
        }
    }

    objectMappingDeveloperNameFor(fieldApiName) {
        const objectMapping = this.getObjectMapping(fieldApiName);
        return objectMapping && objectMapping.DeveloperName;
    }

    setReviewDonationsDonorProperties(recordId) {
        if (recordId && this.donorType()) {
            const isDonorAccount1 =
                this.donorType() === DONATION_DONOR_TYPE_ENUM.ACCOUNT1 &&
                recordId.startsWith(this.accountKeyPrefix);
            const isDonorContact1 =
                this.donorType() === DONATION_DONOR_TYPE_ENUM.CONTACT1 &&
                recordId.startsWith(this.contactKeyPrefix);

            if (isDonorAccount1 || isDonorContact1) {
                this.selectedDonorId = recordId;
                return;
            }
        }

        // If donationDonor and recordId don't align or aren't set,
        // reset all selected donation properties and form fields
        this.selectedDonorId = null;
        if (!!this.selectedDonation) {
            this.resetDonationAndPaymentImportedFields();
            // moved this below because we previously would never actually reach inside this
            // condition otherwise. Even in scenarios we're we've definitely selected a donation
            // prior to needing to reset.
            this.selectedDonation = null;
        }
    }

    handleChangeSelectedDonation(event) {
        this.selectedDonation = event.detail.payment || event.detail.opportunity;

        const donationImportStatus = DATA_IMPORT_DONATION_IMPORT_STATUS_FIELD.fieldApiName;
        const donationImported = DATA_IMPORT_DONATION_IMPORTED_FIELD.fieldApiName;
        const paymentImported = DATA_IMPORT_PAYMENT_IMPORTED_FIELD.fieldApiName;
        const paymentImportStatus = DATA_IMPORT_PAYMENT_IMPORT_STATUS_FIELD.fieldApiName;

        if (!this.selectedDonation.hasOwnProperty('Id')) {
            this.resetDonationAndPaymentImportedFields();
            if (this.selectedDonation.new === true) {
                this.selectedDonationDataImportFieldValues[donationImportStatus] =
                    userSelectedNewOpp;
            }
        } else {
            if (this.selectedDonation.Id.startsWith(this.oppPaymentKeyPrefix)) {
                this.selectedDonationDataImportFieldValues[paymentImported] =
                    {
                        value: this.selectedDonation.Id,
                        displayValue: this.selectedDonation.Name
                    };
                this.selectedDonationDataImportFieldValues[paymentImportStatus] =
                    userSelectedMatch;
                this.selectedDonationDataImportFieldValues[donationImported] =
                    {
                        value: this.selectedDonation.npe01__Opportunity__c,
                        displayValue: this.selectedDonation.npe01__Opportunity__r.Name
                    };
                this.selectedDonationDataImportFieldValues[donationImportStatus] =
                    userSelectedMatch;
            } else if (this.selectedDonation.Id.startsWith(this.opportunityKeyPrefix)) {
                this.selectedDonationDataImportFieldValues[donationImported] =
                    {
                        value: this.selectedDonation.Id,
                        displayValue: this.selectedDonation.Name
                    };

                if (this.selectedDonation.applyPayment) {
                    this.selectedDonationDataImportFieldValues[donationImportStatus] =
                        applyNewPayment;
                } else {
                    this.selectedDonationDataImportFieldValues[donationImportStatus] =
                        userSelectedMatch;
                }

                this.selectedDonationDataImportFieldValues[paymentImported] = null;
                this.selectedDonationDataImportFieldValues[paymentImportStatus] = null;
            }
        }

        // Load the "imported" and "imported status" fields in case they are on the form
        this.load(this.flatten(this.selectedDonationDataImportFieldValues));

        if (this.selectedDonation.Id) {
            // Load the sibling field values (parented by the same object mapping)
            // for the donation and payment "imported" fields
            this.loadSelectedRecordFieldValues(
                this.selectedDonation.Id.startsWith(this.oppPaymentKeyPrefix) ?
                    paymentImported :
                    donationImported,
                this.selectedDonation.Id
            );

            if (this.selectedDonation.Id.startsWith(this.opportunityKeyPrefix)) {
                // If the selected donation is an Opportunity, reset form fields that have
                // field mappings parented by PaymentImported__c
                this.resetFieldsForObjMappingApplyDefaults(
                    GeFormService.objectMappingWrapperFor(
                        DATA_IMPORT_PAYMENT_IMPORTED_FIELD.fieldApiName
                    ).DeveloperName);
            }
        }
    }

    resetDonationAndPaymentImportedFields() {
        // Reset the stored values for selected donation
        this.selectedDonationDataImportFieldValues
            [DATA_IMPORT_DONATION_IMPORTED_FIELD.fieldApiName] = null;
        this.selectedDonationDataImportFieldValues
            [DATA_IMPORT_DONATION_IMPORT_STATUS_FIELD.fieldApiName] = null;
        this.selectedDonationDataImportFieldValues
            [DATA_IMPORT_PAYMENT_IMPORTED_FIELD.fieldApiName] = null;
        this.selectedDonationDataImportFieldValues
            [DATA_IMPORT_PAYMENT_IMPORT_STATUS_FIELD.fieldApiName] = null;

        // Reset the "imported" and "imported status" donation fields if they are on the
        // form by loading the stored (now null) values for those fields
        this.load(
            this.selectedDonationDataImportFieldValues, false);

        // Reset form fields that have field mappings parented by DonationImported__c
        this.resetFieldsForObjMappingApplyDefaults(
            GeFormService.objectMappingWrapperFor(
                DATA_IMPORT_DONATION_IMPORTED_FIELD.fieldApiName
            ).DeveloperName);

        // Reset form fields that have field mappings parented by PaymentImported__c
        this.resetFieldsForObjMappingApplyDefaults(
            GeFormService.objectMappingWrapperFor(
                DATA_IMPORT_PAYMENT_IMPORTED_FIELD.fieldApiName
            ).DeveloperName);
    }

    /**
     * @description Function that prepares (sets batch defaults, remove credit card widget)
     * the gift entry form in Batch Mode
     * @param templateSections
     * @returns {sections}
     */
    prepareFormForBatchMode (templateSections) {
        let sections = deepClone(templateSections);
        if (isNotEmpty(this._batchDefaults)) {
            let batchDefaultsObject;
            try {
                batchDefaultsObject = JSON.parse(this._batchDefaults);
                sections.forEach(section => {
                    section.elements = section.elements.filter(element =>
                        element.componentName !== CREDIT_CARD_WIDGET_NAME);
                    section.elements.forEach(element => {
                        for (let key in batchDefaultsObject) {
                            if (batchDefaultsObject.hasOwnProperty(key)) {
                                const batchDefault = batchDefaultsObject[key];
                                if (batchDefault.objectApiName === element.objectApiName &&
                                    batchDefault.fieldApiName === element.fieldApiName) {
                                    if (!isUndefined(batchDefault.value)) {
                                        element.defaultValue = batchDefault.value;
                                    }
                                }
                            }
                        }
                    });
                });
            } catch (err) {
                handleError(err);
            }
        }
        return sections;
    }

    /**
     * @description Retrieves a records mapped target field values and
     *              loads them into the appropriate source fields in use
     *              on the Gift Entry form.
     * @param lookupFieldApiName Api name of the lookup field.
     * @param selectedRecordId Id of the selected record.
     */
    loadSelectedRecordFieldValues(lookupFieldApiName, selectedRecordId) {
        let selectedRecordFields =
            this.getSiblingFieldsForSourceField(lookupFieldApiName);

        if (selectedRecordId &&
            selectedRecordId.startsWith(this.oppPaymentKeyPrefix) &&
            this.selectedDonation.Id === selectedRecordId) {
            // This is the selected payment, so add in the parent opp field so
            // it can be used to populate the parent Opportunities' fields.
            selectedRecordFields.push(
                this.getQualifiedFieldName(OPP_PAYMENT_OBJECT, PARENT_OPPORTUNITY_FIELD));
        }

        this.storeSelectedRecordIdByObjectMappingName(
            this.getObjectMapping(lookupFieldApiName).DeveloperName,
            selectedRecordId
        );

        this.lookupFieldApiNameBySelectedRecordId[selectedRecordId] = lookupFieldApiName;
        this.queueSelectedRecordForRetrieval(selectedRecordId, selectedRecordFields);
    }

    lookupFieldApiNameBySelectedRecordId = {};
    
    getQualifiedFieldName(objectInfo, fieldInfo) {
        return `${objectInfo.objectApiName}.${fieldInfo.fieldApiName}`;
    }

    get oppPaymentKeyPrefix() {
        return this.oppPaymentObjectInfo.data.keyPrefix;
    }

    get opportunityKeyPrefix() {
        return this.opportunityObjectInfo.data.keyPrefix;
    }

    get accountKeyPrefix() {
        return this.accountObjectInfo.data.keyPrefix;
    }

    get contactKeyPrefix() {
        return this.contactObjectInfo.data.keyPrefix;
    }

    getObjectMapping(fieldApiName) {
        return Object.values(GeFormService.objectMappings)
            .find(({Imported_Record_Field_Name}) =>
                Imported_Record_Field_Name == fieldApiName);
    }

    // Properties used to manage retrieval of fields for selected records
    selectedRecordIdByObjectMappingDevName = {};
    selectedRecordId;
    selectedRecordFields;
    getSelectedRecordStatus = 'ready';
    selectedRecordsQueue = [];

    @wire(getRecord, {recordId: '$selectedRecordId', optionalFields: '$selectedRecordFields'})
    getSelectedRecord({error, data}) {
        if (error) {
            handleError(error);
        } else if (data) {
            const dataImport = this.mapRecordValuesToDataImportFields(data);
            this.updateFormStateForRecordIdWithRelatedRecord(data.id, data);
            this.load(dataImport, false);

            const needsParentOpportunityLoaded =
                this.oppPaymentObjectInfo.data.keyPrefix === data.id.substring(0, 3) &&
                data.id === this.selectedDonation.Id;

            if (needsParentOpportunityLoaded) {
                this.loadParentOpportunityForSelectedPayment(this.parentOpportunityIdFor(data));
            }
        }
        this.loadNextSelectedRecordFromQueue();
    }

    loadParentOpportunityForSelectedPayment(oppId) {
        this.loadSelectedRecordFieldValues(DATA_IMPORT_DONATION_IMPORTED_FIELD.fieldApiName, oppId);
    }

    loadNextSelectedRecordFromQueue() {
        if (this.selectedRecordsQueue.length > 0) {
            const nextSelectedRecord = this.selectedRecordsQueue.pop();
            this.selectedRecordId = nextSelectedRecord.selectedRecordId;
            this.selectedRecordFields = nextSelectedRecord.selectedRecordFields;
        } else {
            // If there are no records in the queue, set status back to 'ready'
            this.getSelectedRecordStatus = 'ready';
        }
    }

    parentOpportunityIdFor(oppPaymentRecord) {
        return getFieldValue(oppPaymentRecord, PARENT_OPPORTUNITY_FIELD);
    }

    @wire(getObjectInfo, {objectApiName: OPP_PAYMENT_OBJECT.objectApiName})
    oppPaymentObjectInfo;

    @wire(getObjectInfo, {objectApiName: OPPORTUNITY_OBJECT.objectApiName})
    opportunityObjectInfo;

    @wire(getObjectInfo, {objectApiName: ACCOUNT_OBJECT.objectApiName})
    accountObjectInfo;

    @wire(getObjectInfo, {objectApiName: CONTACT_OBJECT.objectApiName})
    contactObjectInfo;

    mapRecordValuesToDataImportFields(record) {
        //reverse map to create an object with relevant source field api names to values
        let dataImport = {};

        let objectMappingDevNames = this.getObjectMappingDevNamesForSelectedRecord(record);

        objectMappingDevNames.forEach(objectMappingName => {
            //relevant field mappings
            this.fieldMappingsFor(objectMappingName).forEach(fieldMapping => {
                const valueObject = record.fields[fieldMapping.Target_Field_API_Name];
                const sourceField = fieldMapping.Source_Field_API_Name;
                // If the retrieved selected lookup record has a blank value for any
                // fields that have defaults configured, apply the default value.  Otherwise
                // load the database value for that field.
                dataImport[sourceField] = valueObject.value === null ?
                    this.defaultValueFor(fieldMapping.DeveloperName) :
                    valueObject.value;
            });
        });

        return dataImport;
    }

    getObjectMappingDevNamesForSelectedRecord(record) {
        let objectMappingDevNames = [];
        for (let [key, value] of Object.entries(this.selectedRecordIdByObjectMappingDevName)) {
            if (value === record.id) {
                objectMappingDevNames.push(key);
            }
        }
        return objectMappingDevNames;
    }

    storeSelectedRecordIdByObjectMappingName(objectMappingName, recordId) {
        this.selectedRecordIdByObjectMappingDevName[objectMappingName] = recordId;
    }

    get donorId() {
        switch (this.donorType()) {
            case DONATION_DONOR_TYPE_ENUM.ACCOUNT1:
                return this.getFieldValueFromFormState(
                    DATA_IMPORT_ACCOUNT1_IMPORTED_FIELD.fieldApiName);
            case DONATION_DONOR_TYPE_ENUM.CONTACT1:
                return this.getFieldValueFromFormState(
                    DATA_IMPORT_CONTACT1_IMPORTED_FIELD.fieldApiName);
            default:
                return null;
        }
    }

    handleDonorAccountChange(selectedRecordId) {
        this._account1Imported = selectedRecordId;
        if (selectedRecordId == null) {
            this._account1Name = null;
        }
        if (this.donorType() === DONATION_DONOR_TYPE_ENUM.ACCOUNT1) {
            this.setReviewDonationsDonorProperties(this._account1Imported);
        } else if (this.donorType() === null) {
            // TODO: Maybe auto-set to 'Account1'?
        }
    }

    handleDonorContactChange(selectedRecordId) {
        this._contact1Imported = selectedRecordId;
        if (selectedRecordId == null) {
            this._contact1LastName = null;
            this._contact1FirstName = null;
        }
        if (this.donorType() === DONATION_DONOR_TYPE_ENUM.CONTACT1) {
            this.setReviewDonationsDonorProperties(this._contact1Imported);
        } else if (this.donorType() === null) {
            // TODO: Maybe auto-set to 'Contact1'?
        }
    }

    handleDonationDonorChange(donationDonorValue) {
        if (!!this.selectedDonation) {
            this.resetDonationAndPaymentImportedFields();
            fireEvent(this, 'resetReviewDonationsEvent', {});
        }
        this.setReviewDonationsDonorProperties(this.donorId);
    }

    getObjectMappingsForSourceField(fieldApiName) {
        return Object.values(GeFormService.fieldMappings)
            .filter(({Source_Field_API_Name}) => Source_Field_API_Name === fieldApiName)
            .map(({Target_Object_Mapping_Dev_Name}) => Target_Object_Mapping_Dev_Name);
    }

    /**
     * @description Queues selected record Ids (and fields) when getRecord is
     *              in the progress of retrieving another record's related fields.
     *              Prevents one lookup from overwriting the reactive selectedRecordId
     *              and selectedRecordFields properties before getRecord has returned
     *              with data.
     * @param selectedRecordId Id of record to be retrieved.
     * @param selectedRecordFields Fields list to be retrieved.
     */
    queueSelectedRecordForRetrieval(selectedRecordId, selectedRecordFields) {
        if (this.getSelectedRecordStatus == 'ready') {
            this.getSelectedRecordStatus = 'pending';
            this.selectedRecordId = selectedRecordId;
            this.selectedRecordFields = selectedRecordFields;
        } else {
            this.selectedRecordsQueue.push({selectedRecordId, selectedRecordFields});
        }
    }

    handleNameOnCardFieldChange() {
        const sectionsList = this.template.querySelectorAll('c-ge-form-section');
        let fieldList = {};
        if (!isUndefined(sectionsList) && this.isSingleGiftEntry) {
            fieldList = this.getDisplayedFieldsMappedByFieldAPIName(sectionsList);

            this.fabricatedCardholderNames = this.fabricateCardHolderName(fieldList);
            sectionsList.forEach(section => {
                if (section.isCreditCardWidgetAvailable) {
                    this._hasCreditCardWidget = true;
                    section.setCardHolderName(this.fabricatedCardholderNames);
                }
            });
        }
    }


    /**
     * Function that fabricates the cardholder name for the credit card widget
     * @param fieldList (List of fields displayed on the form)
     * @returns {{firstName: string, lastName: string, accountName: string}} card holder name
     */
    fabricateCardHolderName(fieldList){
        let accountName, firstName, lastName;
        let index = 0;

        for (let field in fieldList) {
            index++;
            if (fieldList.hasOwnProperty(field)) {
                let value = fieldList[field].value ? fieldList[field].value : '';
                let fieldApiName = fieldList[field].apiName;

                switch (fieldApiName) {
                    case CONTACT_FIRST_NAME_INFO.fieldApiName :
                        firstName = value;
                        break;
                    case CONTACT_LAST_NAME_INFO.fieldApiName :
                        lastName = value;
                        break;
                    case ACCOUNT_NAME_FIELD.fieldApiName :
                        accountName = value;
                        break;
                }

                if (index === Object.keys(fieldList).length) {
                    if (this.donorType() === DONATION_DONOR_TYPE_ENUM.CONTACT1) {
                        return {
                            firstName: firstName,
                            lastName: lastName,
                            accountName: ''
                        };
                    } else {
                        return {
                            firstName: '',
                            lastName: '',
                            accountName: accountName
                        };
                    }
                }
            }
        }
    }

    getDisplayedFieldsMappedByFieldAPIName(sectionsList) {
        let allFields = {};
        sectionsList.forEach(section => {
            const fields = section.getAllFieldsByFieldAPIName();
            allFields = Object.assign(allFields, fields);
        });
        return allFields;
    }

    /*******************************************************************************
    * @description Method formats custom labels for the purchase call timeout error
    * scenario.
    *
    * @param {object} dataImportRecord: Data Import record related to the error
    * received from geGiftEntryFormApp.
    */
    formatTimeoutErrorMessage() {
        const donorName = this.getDonorName();
        const donationAmountFormField = this.getFormFieldBySourceName(DONATION_AMOUNT.fieldApiName);
        const formattedDonationAmount = getNumberAsLocalizedCurrency(donationAmountFormField.value);

        this.CUSTOM_LABELS.geErrorUncertainCardChargePart1 = GeLabelService.format(
            this.CUSTOM_LABELS.geErrorUncertainCardChargePart1,
            [formattedDonationAmount, donorName, this.CUSTOM_LABELS.commonPaymentServices]);

        this.CUSTOM_LABELS.geErrorUncertainCardChargePart3 = GeLabelService.format(
            this.CUSTOM_LABELS.geErrorUncertainCardChargePart3,
            [this.CUSTOM_LABELS.commonPaymentServices]);

        this.CUSTOM_LABELS.geErrorUncertainCardChargePart4 = GeLabelService.format(
            this.CUSTOM_LABELS.geErrorUncertainCardChargePart4,
            [this.CUSTOM_LABELS.commonPaymentServices]);
    }

    getDonorName() {
        const names = this.fabricatedCardholderNames;
        if (names.firstName && names.lastName) {
            return `${names.firstName} ${names.lastName}`;
        } else {
            return names.accountName;
        }
    }

    /*******************************************************************************
    * @description Get a form field's value and label properties by the source
    * field api name.
    *
    * @param {string} sourceFieldApiName: A field api name from the DataImport__c
    * custom object.
    */
    getFormFieldBySourceName(sourceFieldApiName) {
        const sectionsList = this.template.querySelectorAll('c-ge-form-section');
        for (let i = 0; i < sectionsList.length; i++) {
            const matchingFormField = sectionsList[i].getFieldValueAndLabel([sourceFieldApiName]);
            if (isObject(matchingFormField) && matchingFormField.hasOwnProperty(sourceFieldApiName)) {
                return matchingFormField[sourceFieldApiName];
            }
        }
    }

    get namespace() {
        return getNamespace(FORM_TEMPLATE_FIELD.fieldApiName);
    }

    // ================================================================================
    // AUTOMATION LOCATOR GETTERS
    // ================================================================================

    get qaLocatorCancelButton() {
        return `button ${this.cancelButtonText}`;
    }

    get qaLocatorSaveButton() {
        return `button ${this.saveActionLabel}`;
    }

    get formState() {
        return this._formState;
    }

    set formState(formState) {
        this._formState = formState;
    }

    updateFormStateForRecordIdWithRelatedRecord(recordId, record) {
        const relatedRecordFieldName =
            relatedRecordFieldNameFor(this.lookupFieldApiNameFor(recordId));
        this.updateFormState({[relatedRecordFieldName]: record});
    }

    lookupFieldApiNameFor(recordId) {
        return this.lookupFieldApiNameBySelectedRecordId[recordId];
    }

    /*******************************************************************************
     * @description Updates the formState object that holds the current value
     * of all fields on the form.
     * @param fields An object with key-value pairs.
     */
    updateFormState(fields) {
        Object.assign(this.formState, fields);

        if (fields.hasOwnProperty(DONATION_RECORD_TYPE_NAME.fieldApiName)) {
            this.updateFormStateForDonationRecordType(fields);
        }

        if (this.hasImportedRecordFieldsBeingSetToNull(fields)) {
            this.deleteRelationshipFieldsFromStateFor(fields);
        }

        // Re-assign to prompt reactivity
        this.formState = deepClone(this.formState);
    }

    updateFormStateForDonationRecordType(fields) {
        const opportunityRecordTypeValue = fields[DONATION_RECORD_TYPE_NAME.fieldApiName];

        if (opportunityRecordTypeValue) {
            const isId = opportunityRecordTypeValue.startsWith('012');
            const val = isId ?
                opportunityRecordTypeValue :
                this.opportunityRecordTypeIdFor(opportunityRecordTypeValue);

            this.formState[DONATION_RECORD_TYPE_NAME.fieldApiName] =
                this.opportunityRecordTypeNameFor(val);

            this.setDonationRecordTypeIdInFormState(val);
        }
    }

    opportunityRecordTypeNameFor(id) {
        const found = this.opportunityRecordTypeInfos &&
            this.opportunityRecordTypeInfos
                .find(recordTypeInfo => recordTypeInfo.recordTypeId === id);

        return found && found.name;
    }

    hasImportedRecordFieldsBeingSetToNull(fields) {
        return Object.keys(fields)
            .filter(field =>
                GeFormService.importedRecordFieldNames.includes(field) &&
                fields[field] === null
            ).length > 0;
    }

    deleteRelationshipFieldsFromStateFor(fields) {
        const needsRelationshipFieldDeleted = (field) =>
            this.hasRelatedRecordFieldInFormState(field) &&
            fields[field] === null;

        Object.keys(fields)
            .filter(needsRelationshipFieldDeleted)
            .forEach(field => {
                this.deleteFieldFromFormState(relatedRecordFieldNameFor(field));
            });
    }

    deleteFieldFromFormState(field) {
        delete this.formState[field];
    }

    hasRelatedRecordFieldInFormState(field) {
        return this.formState.hasOwnProperty(relatedRecordFieldNameFor(field));
    }

    handleFormFieldChange(event) {
        const value = event.detail.value,
            label = event.detail.label,
            sourceField = this.sourceFieldFor(event.detail.fieldMappingDevName),
            isDonationRecordTypeName =
                sourceField === DONATION_RECORD_TYPE_NAME.fieldApiName,
            isDonationDonor =
                sourceField === DATA_IMPORT_DONATION_DONOR_FIELD.fieldApiName;

        this.updateFormState({
            [sourceField]: isDonationRecordTypeName ? label : value
        });

        if (isDonationRecordTypeName) {
            this.setDonationRecordTypeIdInFormState(value);
        }

        if (isDonationDonor) {
            this.handleDonationDonorChange(value)
        }
    }

    sourceFieldFor(fieldMappingDevName) {
        return GeFormService.fieldMappings[fieldMappingDevName].Source_Field_API_Name;
    }

    /*******************************************************************************
     * @description Analyzes the sections property to get initial values and set them
     * in the formState property.
     */
    initializeFormState() {
        if (this.sections) {
            this.sections
                .forEach(section => {
                    if (section.elements) {
                        section.elements
                            .forEach(element => {
                                this.setInitialValueInFormStateForElement(element);
                            });
                    }
                });
        }

        if (this.batchId) {
            this.updateFormState({
                [NPSP_DATA_IMPORT_BATCH_FIELD.fieldApiName]: this.batchId
            });
        }
    }

    setInitialValueInFormStateForElement(element) {
        const sourceField = this.getSourceFieldApiNameFor(element);
        const value = this.getValueFrom(element);
        const isLookupWithDefaultValue = value &&
            GeFormService.importedRecordFieldNames.includes(sourceField);

        this.updateFormState({[sourceField]: value});

        if (isLookupWithDefaultValue) {
            this.loadSelectedRecordFieldValues(sourceField, value);
        }
    }

    setInitialValueInFormStateForFieldMappings(fieldMappingDevNames) {
        this.elementsFor(fieldMappingDevNames)
            .forEach(el => this.setInitialValueInFormStateForElement(el));

    }

    elementsFor(fieldMappingDevNames) {
        const foundInFieldMappingDevNames =
            (fieldMappingDevName) => fieldMappingDevNames
                .includes(fieldMappingDevName);

        return this.sections
            .map(s => s.elements)
            .flat()
            .filter(element =>
                element.dataImportFieldMappingDevNames
                    .some(foundInFieldMappingDevNames));
    }

    setFormStateToInitialFieldValuesForObjMapping(objectMappingDeveloperName) {
        this.setInitialValueInFormStateForFieldMappings(
            this.fieldMappingsFor(objectMappingDeveloperName)
                .map(({DeveloperName}) => DeveloperName));
    }

    fieldMappingsFor(objectMappingDeveloperName) {
        return GeFormService.fieldMappingsForObjectMappingDevName(objectMappingDeveloperName);
    }

    getSourceFieldApiNameFor(element) {
        return this.fieldMappingWrapperFor(element) &&
            this.fieldMappingWrapperFor(element).Source_Field_API_Name;
    }

    fieldMappingWrapperFor(element) {
        return element.dataImportFieldMappingDevNames &&
            GeFormService.getFieldMappingWrapper(element.dataImportFieldMappingDevNames[0]);
    }

    getValueFrom(element) {
        return element && element.recordValue !== undefined ?
            element.recordValue :
            element.defaultValue;
    }

    opportunityRecordTypeIdFor(opportunityRecordTypeName) {
        const recordTypeInfo = Object.values(this.opportunityRecordTypeInfos)
            .find(recordTypeInfo =>
                recordTypeInfo.name === opportunityRecordTypeName);
        
        if (!recordTypeInfo) return null;
        return recordTypeInfo.recordTypeId;
    }

    get opportunityRecordTypeInfos() {
        return this.opportunityObjectInfo &&
            Object.values(this.opportunityObjectInfo.data.recordTypeInfos);
    }

    setDonationRecordTypeIdInFormState(opportunityRecordTypeId) {
        const donationImportedRelatedRecordField =
            relatedRecordFieldNameFor(DATA_IMPORT_DONATION_IMPORTED_FIELD.fieldApiName);
        const relatedRecord =
            this.getFieldValueFromFormState(donationImportedRelatedRecordField);

        let updatedRecord;
        if (relatedRecord) {
            updatedRecord = Object.assign(
                relatedRecord,
                {recordTypeId: opportunityRecordTypeId});
        } else {
            updatedRecord = {recordTypeId: opportunityRecordTypeId};
        }

        this.updateFormState({
            [donationImportedRelatedRecordField]: updatedRecord
        })
    }

    siblingRecordTypeFieldFor(fieldMappingDevName) {
        const fieldMappingToRecordTypeId =
            Object.values(GeFormService.fieldMappings)
                .filter(f =>
                    f.Target_Object_Mapping_Dev_Name ===
                    this.objectMappingDevNameFor(fieldMappingDevName))
                .find(f => f.Target_Field_API_Name === 'RecordTypeId')

        return fieldMappingToRecordTypeId &&
            fieldMappingToRecordTypeId.Source_Field_API_Name;
    }

    objectMappingDevNameFor(fieldMappingDevName) {
        const fieldMapping = GeFormService.getFieldMappingWrapper(fieldMappingDevName);
        return fieldMapping && fieldMapping.Target_Object_Mapping_Dev_Name;
    }

    parentRecordFieldFor(fieldMappingDevName) {
        const objMapping =
            GeFormService.getObjectMapping(
                this.objectMappingDevNameFor(fieldMappingDevName));

        return objMapping && objMapping.Imported_Record_Field_Name;
    }

    donorType() {
        return this.getFieldValueFromFormState(
            DATA_IMPORT_DONATION_DONOR_FIELD.fieldApiName);
    }

    /**
     * @description Pass in a DataImport field's api to get that field's current
     * value from the formState object.
     * @param fieldApiName
     * @returns {*} Current value stored in formState for the passed-in field.
     */
    getFieldValueFromFormState(fieldApiName) {
        return this.formState[fieldApiName];
    }

    flatten(obj) {
        let flatObj = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null && value !== undefined && value.hasOwnProperty('value')) {
                flatObj[key] = value.value;
            } else {
                flatObj[key] = value;
            }
        }
        return flatObj;
    }

    defaultValueFor(fieldMappingDevName) {
        const element = this.formElements()
            .find(element =>
                element.dataImportFieldMappingDevNames[0] === fieldMappingDevName);

        return element && element.defaultValue;
    }

    appendNullValuesForMissingFields(dataImport) {
        this.applyNullValuesForMissingFields(this.sourceFieldsUsedInTemplate(), dataImport);
        return dataImport;
    }

    applyNullValuesForMissingFields(sourceFieldsOnForm, dataImport) {
        sourceFieldsOnForm.forEach(sourceFieldOnForm => {
            if (!dataImport.hasOwnProperty(sourceFieldOnForm)) {
                dataImport[sourceFieldOnForm] = null;
            }
        });
    }

    sourceFieldsUsedInTemplate() {
        return Object.values(GeFormService.fieldMappings)
            .filter(fieldMapping =>
                this.fieldMappingDevNamesUsedInTemplate()
                    .includes(fieldMapping.DeveloperName))
            .map(fieldMapping => fieldMapping.Source_Field_API_Name);
    }

    fieldMappingDevNamesUsedInTemplate() {
        return this.formElements()
            .filter(element => element.elementType === 'field')
            .map(element => element.dataImportFieldMappingDevNames[0]);
    }

    formElements() {
        return this.sections.flat()
            .map(({elements}) => elements)
            .flat();
    }

    /**
     * @description Returns a saveable data import record
     * derived from the formState object.
     */
    saveableFormState() {
        let dataImportRecord = deepClone(this.formState);
        this.removeRelationshipFieldsFrom(dataImportRecord);
        return dataImportRecord;
    }

    /**
     * @description Removes all relationships fields ('__r') from the
     * provided object.
     *
     * @param object: A map of sObject fields
     */
    removeRelationshipFieldsFrom = (object) => {
        Object.keys(object).forEach(key => {
            if (key.includes('__r')) {
                delete object[key];
            }
        });
    }

    get hasDataImportId() {
        return this.getFieldValueFromFormState('id') ? true : false;
    }

    hasProcessableDataImport() {
        return !this.hasFailedPurchaseRequest || this._isCreditCardWidgetInDoNotChargeState;
    }

    hasAuthorizationToken() {
        return this.getFieldValueFromFormState(PAYMENT_AUTHORIZE_TOKEN.fieldApiName) ?
            true :
            false;
    }

    shouldMakePurchaseRequest() {
        return this.hasAuthorizationToken() &&
            this.hasChargeableTransactionStatus(this.getFieldValueFromFormState(PAYMENT_STATUS.fieldApiName)) ?
                true :
                false;
    }

    hasChargeableTransactionStatus = (paymentStatus) => {
        switch (paymentStatus) {
            case this.PAYMENT_TRANSACTION_STATUS_ENUM.PENDING: return true;
            case this.PAYMENT_TRANSACTION_STATUS_ENUM.AUTHORIZED: return false;
            case this.PAYMENT_TRANSACTION_STATUS_ENUM.CANCELED: return false;
            case this.PAYMENT_TRANSACTION_STATUS_ENUM.CAPTURED: return false;
            case this.PAYMENT_TRANSACTION_STATUS_ENUM.DECLINED: return true;
            case this.PAYMENT_TRANSACTION_STATUS_ENUM.NONRETRYABLEERROR: return false;
            case this.PAYMENT_TRANSACTION_STATUS_ENUM.RETRYABLEERROR: return true;
            case this.PAYMENT_TRANSACTION_STATUS_ENUM.REFUNDISSUED: return false;
            default: return true;
        }
    }

    /*******************************************************************************
    * @description Saves a Data Import record, makes an elevate payment if needed,
    * and processes the Data Import through BDI.
    *
    * @param {object} event: Custom Event containing the Data Import record and a
    * callback for handling and displaying errors in the form.
    */
    submitSingleGift = async (dataImportFromFormState) => {
        try {
            await this.saveDataImport(dataImportFromFormState);

            if (this.shouldMakePurchaseRequest()) {
                await this.makePurchaseRequest()
            }

            if (this.hasProcessableDataImport()) {
                await this.processDataImport();
            }
        } catch (error) {
            this.disabled = false;
            this.toggleSpinner();
            handleError(error);
        }
    }

    saveDataImport = async (dataImportFromFormState) => {
        this.loadingText = this.hasDataImportId ?
            this.CUSTOM_LABELS.geTextUpdating :
            this.CUSTOM_LABELS.geTextSaving;

        const upsertResponse = await upsertDataImport({ dataImport: dataImportFromFormState });
        this.updateFormState(upsertResponse);
    };

    makePurchaseRequest = async () => {
        this.loadingText = this.CUSTOM_LABELS.geTextChargingCard;

        const responseBodyString = await sendPurchaseRequest({
            requestBodyParameters: this.buildPurchaseRequestBodyParameters(),
            dataImportRecordId: this.getFieldValueFromFormState('id')
        });

        const responseBody = JSON.parse(responseBodyString);
        this.processPurchaseResponse(responseBody);
    }

    buildPurchaseRequestBodyParameters() {
        const { firstName, lastName } = this.getCardholderNames();
        const metadata = {
            campaignCode: this.getFieldValueFromFormState(DONATION_CAMPAIGN_NAME.fieldApiName)
        };

        return JSON.stringify({
            firstName: firstName,
            lastName: lastName,
            metadata: metadata,
            amount: getCurrencyLowestCommonDenominator(
                this.getFieldValueFromFormState(DONATION_AMOUNT.fieldApiName)
            ),
            paymentMethodToken:
                this.getFieldValueFromFormState(PAYMENT_AUTHORIZE_TOKEN.fieldApiName),
        });
    }

    processPurchaseResponse = async (responseBody) => {
        const isPurchaseFailed = responseBody.errors;
        if (isPurchaseFailed) {
            this.updateFormStateWithFailedPurchaseCall(responseBody.errors);
            this.handlePurchaseCallValidationErrors(responseBody.errors);
            this.hasFailedPurchaseRequest = true;
        }

        const isPurchaseTimedout = !responseBody.id && responseBody.message && responseBody.status;
        if (isPurchaseTimedout) {
            this.updateFormStateWithTimedoutPurchaseCall(responseBody);
            this.hasFailedPurchaseRequest = true;
            this.hasPurchaseCallTimedout = true;
            this.formatTimeoutErrorMessage();
        }

        const isPurchaseCreated = responseBody.id && responseBody.status === 'CAPTURED';
        if (isPurchaseCreated) {
            this.updateFormStateWithSuccessfulPurchaseCall(responseBody);
            this.hasFailedPurchaseRequest = false;
        }

        await this.saveDataImport(this.saveableFormState());
    }

    updateFormStateWithFailedPurchaseCall(errors) {
        if (errors && errors[0]) {
            this.updateFormState({
                [PAYMENT_DECLINED_REASON.fieldApiName]: errors[0].message,
                [PAYMENT_STATUS.fieldApiName]: errors[0].localizedPaymentsMessage,
            });
        }
    }

    handlePurchaseCallValidationErrors(errors) {
        const errorMessage = JSON.stringify(errors.map(error => error.message)) || this.CUSTOM_LABELS.commonUnknownError;
        let labelReplacements = [this.CUSTOM_LABELS.commonPaymentServices, errorMessage];
        let formattedErrorResponse = format(this.CUSTOM_LABELS.gePaymentProcessError, labelReplacements);

        const error = {
            message: formattedErrorResponse.split(LABEL_NEW_LINE),
            isObject: true
        };

        this.toggleSpinner();
        this.handleAsyncWidgetError({ error });
    }

    updateFormStateWithTimedoutPurchaseCall(responseBody) {
        this.updateFormState({
            [PAYMENT_DECLINED_REASON.fieldApiName]: responseBody.message,
            [PAYMENT_STATUS.fieldApiName]: responseBody.status,
        });
    }

    updateFormStateWithSuccessfulPurchaseCall(responseBody) {
        this.updateFormState({
            [PAYMENT_ELEVATE_ID.fieldApiName]: responseBody.id,
            [PAYMENT_STATUS.fieldApiName]: responseBody.status,
            [PAYMENT_CARD_NETWORK.fieldApiName]: responseBody.cardData.brand,
            [PAYMENT_LAST_4.fieldApiName]: responseBody.cardData.last4,
            [PAYMENT_EXPIRATION_MONTH.fieldApiName]: responseBody.cardData.expirationMonth,
            [PAYMENT_EXPIRATION_YEAR.fieldApiName]: responseBody.cardData.expirationYear,
            [PAYMENT_DECLINED_REASON.fieldApiName]: '',
            [PAYMENT_GATEWAY_ID.fieldApiName]: responseBody.gatewayId,
            [PAYMENT_TRANSACTION_ID.fieldApiName]: responseBody.gatewayTransactionId,
            [PAYMENT_AUTHORIZED_AT.fieldApiName]: responseBody.authorizedAt,
        });
    }

    processDataImport = async () => {
        this.loadingText = this.CUSTOM_LABELS.geTextProcessing;
        const hasUserSelectedDonation = Object.keys(this.selectedDonationDataImportFieldValues).length > 0;

        submitDataImportToBDI({ dataImport: this.saveableFormState(), updateGift: hasUserSelectedDonation })
            .then(opportunityId => {
                this.loadingText = this.CUSTOM_LABELS.geTextNavigateToOpportunity;
                this.navigateToRecordPage(opportunityId);
            })
            .catch(error => {
                this.handleCardChargedBDIFailedError(error);
            });
    }

    handleCardChargedBDIFailedError(errorWrapper) {
        this.dispatchdDisablePaymentServicesWidgetEvent(this.CUSTOM_LABELS.geErrorCardChargedBDIFailed);
        this.toggleModalByComponentName('gePurchaseCallModalError');
        this.addPageLevelErrorMessage(this.buildCardChargedBDIFailedError(errorWrapper));
        this.disabled = false;
        this.toggleSpinner();
    }

    buildCardChargedBDIFailedError(errorWrapper) {
        const exception = new ExceptionDataError(errorWrapper);
        const error = {
            index: 0,
            errorMessage: this.CUSTOM_LABELS.geErrorCardChargedBDIFailed,
            multilineMessages: [{
                message: exception.errorMessage || this.CUSTOM_LABELS.commonUnknownError,
                index: 0
            }]
        };
        return error;
    }

    // TODO: Temp method for retrieving payment auth token, purge later
    TEMPORARY_forceTokenOntoDataImport = (dataImportFromFormState, inMemoryDataImport) => {
        if (!inMemoryDataImport[PAYMENT_AUTHORIZE_TOKEN.fieldApiName]) return;
        dataImportFromFormState[PAYMENT_AUTHORIZE_TOKEN.fieldApiName] =
            inMemoryDataImport[PAYMENT_AUTHORIZE_TOKEN.fieldApiName];
        this.updateFormState({
            [PAYMENT_AUTHORIZE_TOKEN.fieldApiName]: inMemoryDataImport[PAYMENT_AUTHORIZE_TOKEN.fieldApiName]
        })
    }
}
