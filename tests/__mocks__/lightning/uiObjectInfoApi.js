/**
 * For the original lightning-combobox mock that comes with
 * @salesforce/sfdx-lwc-jest, see:
 * https://github.com/salesforce/sfdx-lwc-jest/blob/master/src/lightning-stubs/uiObjectInfoApi/uiObjectInfoApi.js
 */
import { createLdsTestWireAdapter } from '@salesforce/wire-service-jest-util';

export const getObjectInfo = createLdsTestWireAdapter(jest.fn());
export const getObjectInfos = createLdsTestWireAdapter(jest.fn());
export const getPicklistValues = createLdsTestWireAdapter(jest.fn());
export const getPicklistValuesByRecordType = createLdsTestWireAdapter(jest.fn());