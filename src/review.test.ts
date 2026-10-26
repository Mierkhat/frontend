import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {inspectSigned,bundleSchema} from '@mierkhat/sdk';
import {ReviewPanel} from './App.js';
import deployments from './deployments.json' with {type:'json'};
import committed from '../tests/fixtures/chain-success.json' with {type:'json'};
it('renders exact human quantities from the actual signed testnet action',()=>{
 const bundle=bundleSchema.parse({...deployments[0],enabled:true,reviewed:true});
 const review=inspectSigned(committed.envelopeXdr,bundle).review;
 const html=renderToStaticMarkup(createElement(ReviewPanel,{review,bundle,example:false,onEdit:()=>{},onSign:()=>{},signing:false,changed:false,confirmed:false,onConfirm:()=>{}}));
 expect(html).toContain('100');expect(html).toContain('0.0000001');expect(html).not.toContain('1000000000');expect(html).toContain(review.draft.intent.recipient);
});
