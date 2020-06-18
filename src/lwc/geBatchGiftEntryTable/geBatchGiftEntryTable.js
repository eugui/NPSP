import {api, track} from 'lwc';
import {deleteRecord} from 'lightning/uiRecordApi';

import getDataImportModel from '@salesforce/apex/BGE_DataImportBatchEntry_CTRL.getDataImportModel';
import runBatchDryRun from '@salesforce/apex/BGE_DataImportBatchEntry_CTRL.runBatchDryRun';
import getDataImportRows from '@salesforce/apex/BGE_DataImportBatchEntry_CTRL.getDataImportRows';

import {handleError} from 'c/utilTemplateBuilder';
import {isNotEmpty} from 'c/utilCommon';
import GeListView from 'c/geListView';
import GeFormService from 'c/geFormService';

import geDonorColumnLabel from '@salesforce/label/c.geDonorColumnLabel';
import geDonationColumnLabel from '@salesforce/label/c.geDonationColumnLabel';
import bgeActionDelete from '@salesforce/label/c.bgeActionDelete';
import geBatchGiftsCount from '@salesforce/label/c.geBatchGiftsCount';
import geBatchGiftsTotal from '@salesforce/label/c.geBatchGiftsTotal';

import commonOpen from '@salesforce/label/c.commonOpen';

import DATAIMPORT_INFO from '@salesforce/schema/DataImport__c';
import STATUS_FIELD from '@salesforce/schema/DataImport__c.Status__c';
import FAILURE_INFORMATION_FIELD from '@salesforce/schema/DataImport__c.FailureInformation__c';
import DONATION_AMOUNT from '@salesforce/schema/DataImport__c.Donation_Amount__c';

export default class GeBatchGiftEntryTable extends GeListView {
    @api batchId;
    @track ready = false;

    _batchLoaded = false;
    @track data = [];
    @track hasData = false;

    _columnsLoaded = false;
    @track columns = [];
    _columns = [
        {label: 'Status', fieldName: STATUS_FIELD.fieldApiName, type: 'text'},
        {label: 'Errors', fieldName: FAILURE_INFORMATION_FIELD.fieldApiName, type: 'text'},
        {
            label: geDonorColumnLabel, fieldName: 'donorLink', type: 'url',
            typeAttributes: {label: {fieldName: 'donorName'}}
        },
        {
            label: geDonationColumnLabel, fieldName: 'matchedRecordUrl', type: 'url',
            typeAttributes: {label: {fieldName: 'matchedRecordLabel'}}
        }
    ];
    _actionsColumn = {
        type: 'action',
        typeAttributes: {
            rowActions: [
                {label: commonOpen, name: 'open'},
                {label: bgeActionDelete, name: 'delete'}
            ],
            menuAlignment: 'auto'
        }
    };

    @api title;
    @api total;
    @api expectedTotal;
    @api count;
    @api expectedCount;
    @track isLoaded = true;

    constructor() {
        super(DATAIMPORT_INFO.objectApiName);
        /* Add the loadBatch function as a callback for the parent component to execute once it executes the
        objectInfo wire service */
        this.callbacks.push(this.loadBatch.bind(this));
    }

    setReady() {
        this.ready = this._columnsLoaded && this._batchLoaded;
    }

    loadBatch = () => {
        getDataImportModel({batchId: this.batchId})
            .then(
                response => {
                    const dataImportModel = JSON.parse(response);
                    this._count = dataImportModel.totalCountOfRows;
                    this._total = dataImportModel.totalRowAmount;

                    this.data = this.setDatatableRecordsForImperativeCall(
                        dataImportModel.dataImportRows.map(row => {
                            return Object.assign(row, row.record);
                        })
                    )
                    this.hasData = this.data.length > 0;
                    this.batchLoaded();
                }
            )
            .catch(
                error => {
                    handleError(error);
                }
            );
    }

    batchLoaded() {
        this._batchLoaded = true;
        this.setReady();
    }

    @api
    handleSectionsRetrieved(sections) {
        let columns = this.buildColumns((sections));
        this.initColumns(columns);
    }

    initColumns(userDefinedColumns) {
        this.columns = [
            ...this._columns,
            ...userDefinedColumns,
            this._actionsColumn];
        this.columnsLoaded();
    }

    buildColumns(sections) {
        const fieldApiNames = [];
        sections.forEach(section => {
            section.elements
                .filter(element => element.elementType === 'field')
                .forEach(element => {
                    const fieldWrapper = GeFormService.getFieldMappingWrapper(
                        element.dataImportFieldMappingDevNames[0]
                    );
                    if (isNotEmpty(fieldWrapper)) {
                        fieldApiNames.push(fieldWrapper.Source_Field_API_Name);
                    }
                });
        });

        return this.buildNameFieldColumns(fieldApiNames);
    }

    columnsLoaded() {
        this._columnsLoaded = true;
        this.setReady();
    }

    @api
    upsertData(dataRow, idProperty) {
        const existingRowIndex = this.data.findIndex(row =>
            row[idProperty] === dataRow[idProperty]
        );

        let rows = this.setDatatableRecordsForImperativeCall([dataRow]);

        if (existingRowIndex !== -1) {
            this.data.splice(existingRowIndex, 1, dataRow);
            this.data = [...this.data];
        } else {
            this.data = [...rows, ...this.data];
            if (this.hasData === false) {
                this.hasData = true;
            }
        }
    }

    handleRowActions(event) {
        switch (event.detail.action.name) {
            case 'open':
                this.loadRow(event.detail.row);
                break;
            case 'delete':
                deleteRecord(event.detail.row.Id).then(() => {
                    this.deleteDIRow(event.detail.row);
                }).catch(error => {
                        handleError(error);
                    }
                );
                break;
        }
    }

    deleteDIRow(rowToDelete) {
        const isRowToDelete = row => row.Id == rowToDelete.Id;
        const index = this.data.findIndex(isRowToDelete);
        this.data.splice(index, 1);
        this.data = [...this.data];
        this.dispatchEvent(new CustomEvent('delete', {
            detail: {
                amount: rowToDelete[DONATION_AMOUNT.fieldApiName]
            }
        }));
    }

    loadMoreData(event) {
        event.target.isLoading = true;
        const disableInfiniteLoading = function () {
            this.enableInfiniteLoading = false;
        }.bind(event.target);

        const disableIsLoading = function () {
            this.isLoading = false;
        }.bind(event.target);

        getDataImportRows({batchId: this.batchId, offset: this.data.length})
            .then(rows => {
                rows.forEach(row => {
                        this.data.push(
                            Object.assign(row, row.record)
                        );
                    }
                );
                this.data = [...this.data];
                if (this.data.length >= this.count) {
                    disableInfiniteLoading();
                }
                disableIsLoading();
            })
            .catch(error => {
                handleError(error);
            });
    }

    @api
    runBatchDryRun(callback) {
        runBatchDryRun({
            batchId: this.batchId,
            numberOfRowsToReturn: this.data.length
        })
            .then(result => {
                const dataImportModel = JSON.parse(result);
                this._count = dataImportModel.totalCountOfRows;
                this._total = dataImportModel.totalRowAmount;
                dataImportModel.dataImportRows.forEach((row, idx) => {
                    this.upsertData(
                        Object.assign(row, row.record), 'Id');
                });
            })
            .catch(error => {
                handleError(error);
            })
            .finally(() => {
                callback();
            });
    }

    get geBatchGiftsCountLabel() {
        return geBatchGiftsCount;
    }

    get geBatchGiftsTotalLabel() {
        return geBatchGiftsTotal;
    }

    loadRow(row) {
        this.dispatchEvent(new CustomEvent('loaddata', {
            detail: row
        }));
    }

    /*************************************************************************************
     * @description Internal setters used to communicate the current count and total
     *              up to the App, which needs them to keep track of whether the batch's
     *              expected totals match.
     */
    set _count(count) {
        this.dispatchEvent(new CustomEvent('countchanged', {
            detail: {
                value: count
            }
        }));
    }

    set _total(total) {
        this.dispatchEvent(new CustomEvent('totalchanged', {
            detail: {
                value: total
            }
        }));
    }

}