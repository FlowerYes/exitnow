import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateObservation,frictionPipeline,type Observation} from '../src/observations.ts';
const event:Observation={eventId:'e',observedAt:new Date('2026-09-26T22:00:00Z'),corridor:'Queens',evidenceType:'consented',excessWaitMinutes:5,analyticsConsent:false,source:'rider'};
test('observations require independent analytics consent',()=>{assert.throws(()=>validateObservation(event),/consent/);assert.doesNotThrow(()=>validateObservation({...event,analyticsConsent:true}));assert.doesNotThrow(()=>validateObservation({...event,evidenceType:'synthetic'}));});
test('friction aggregation keeps source/evidence separate with bounded window and cohort',()=>{const start=new Date('2026-09-26'),end=new Date('2026-09-27');const pipeline=frictionPipeline(start,end);assert.deepEqual(pipeline[0].$match.observedAt,{$gte:start,$lt:end});assert.deepEqual(pipeline[1].$group._id,{corridor:'$corridor',evidenceType:'$evidenceType',source:'$source'});assert.equal(pipeline[2].$match.sampleSize.$gte,5);assert.throws(()=>frictionPipeline(end,start));});
