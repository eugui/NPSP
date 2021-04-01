import { stripNamespace } from 'c/utilCommon';
import DATA_IMPORT from '@salesforce/schema/DataImport__c';
import DATA_IMPORT_PAYMENT_AUTHORIZATION_TOKEN_FIELD from '@salesforce/schema/DataImport__c.Payment_Authorization_Token__c';
import DATA_IMPORT_PAYMENT_STATUS_FIELD from '@salesforce/schema/DataImport__c.Payment_Status__c';
import DATA_IMPORT_PAYMENT_METHOD from '@salesforce/schema/DataImport__c.Payment_Method__c';
import DATA_IMPORT_CONTACT_FIRSTNAME from '@salesforce/schema/DataImport__c.Contact1_Firstname__c';
import DATA_IMPORT_CONTACT_LASTNAME from '@salesforce/schema/DataImport__c.Contact1_Lastname__c';
import DATA_IMPORT_DONATION_DONOR from '@salesforce/schema/DataImport__c.Donation_Donor__c';
import DATA_IMPORT_ACCOUNT_NAME from '@salesforce/schema/DataImport__c.Account1_Name__c';
import DATA_IMPORT_PARENT_BATCH_LOOKUP from '@salesforce/schema/DataImport__c.NPSP_Data_Import_Batch__c';

const easyConsume = (fieldImports) => {
    let easyMap = {};

    fieldImports.forEach(fieldImport => {
        const fieldApiName = fieldImport.fieldApiName;
        let key = fieldApiName;
        if (fieldApiName.includes('npsp__')) {
            key = stripNamespace(fieldApiName, 'npsp__');
        }
        easyMap[key] = fieldApiName;
    });

    return easyMap;
}

export const Schema = Object.freeze({
    DataImport__c: {
        ...DATA_IMPORT,
        ...easyConsume([
            DATA_IMPORT_PAYMENT_AUTHORIZATION_TOKEN_FIELD,
            DATA_IMPORT_PAYMENT_STATUS_FIELD,
            DATA_IMPORT_PAYMENT_METHOD,
            DATA_IMPORT_CONTACT_FIRSTNAME,
            DATA_IMPORT_CONTACT_LASTNAME,
            DATA_IMPORT_DONATION_DONOR,
            DATA_IMPORT_ACCOUNT_NAME,
            DATA_IMPORT_PARENT_BATCH_LOOKUP,
        ])
    }
});

export default Schema;